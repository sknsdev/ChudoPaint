use crate::errors::{AppError, ErrorCode};
use image::{ImageBuffer, ImageFormat, ImageReader, Rgba, RgbaImage};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_DOCUMENT_DIMENSION: u32 = 32_768;
const OPEN_OPERATION: &str = "open_png";
const SAVE_OPERATION: &str = "save_png";
const CHECK_OPERATION: &str = "check_file_available";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedPng {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

fn validate_dimensions(width: u32, height: u32, operation: &'static str) -> Result<(), AppError> {
    if width == 0
        || height == 0
        || width > MAX_DOCUMENT_DIMENSION
        || height > MAX_DOCUMENT_DIMENSION
    {
        return Err(AppError::new(
            ErrorCode::InvalidDimensions,
            format!("Image dimensions must be between 1 and {MAX_DOCUMENT_DIMENSION} pixels."),
            operation,
            format!("received {width}×{height}"),
        ));
    }

    Ok(())
}

fn expected_rgba_length(
    width: u32,
    height: u32,
    operation: &'static str,
) -> Result<usize, AppError> {
    usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| {
            AppError::new(
                ErrorCode::InvalidDimensions,
                "Image dimensions are too large to allocate safely.",
                operation,
                format!("received {width}×{height}"),
            )
        })
}

fn png_output_path(path: &str) -> PathBuf {
    let mut output = PathBuf::from(path);
    if output.extension().and_then(|extension| extension.to_str()) != Some("png") {
        output.set_extension("png");
    }
    output
}

fn temporary_output_path(output_path: &Path) -> Result<PathBuf, AppError> {
    let parent = output_path.parent().unwrap_or_else(|| Path::new("."));
    let filename = output_path
        .file_name()
        .and_then(|filename| filename.to_str())
        .ok_or_else(|| {
            AppError::new(
                ErrorCode::FileWriteFailed,
                "Could not save the PNG file.",
                SAVE_OPERATION,
                "output path does not have a valid file name",
            )
        })?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            AppError::new(
                ErrorCode::FileWriteFailed,
                "Could not save the PNG file.",
                SAVE_OPERATION,
                error,
            )
        })?
        .as_nanos();

    Ok(parent.join(format!(".{filename}.{nonce}.tmp")))
}

fn atomic_write_png(image: &RgbaImage, output_path: &Path) -> Result<(), AppError> {
    let temporary_path = temporary_output_path(output_path)?;
    image
        .save_with_format(&temporary_path, ImageFormat::Png)
        .map_err(|error| {
            AppError::new(
                ErrorCode::FileWriteFailed,
                "Could not write the temporary PNG file.",
                SAVE_OPERATION,
                error,
            )
        })?;

    if let Err(error) = fs::rename(&temporary_path, output_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(AppError::new(
            ErrorCode::FileWriteFailed,
            "Could not replace the PNG file.",
            SAVE_OPERATION,
            error,
        ));
    }

    Ok(())
}

#[tauri::command]
pub fn check_file_available(path: String) -> Result<bool, AppError> {
    match fs::metadata(path) {
        Ok(metadata) => Ok(metadata.is_file()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(AppError::new(
            ErrorCode::FileCheckFailed,
            "Could not check the source file.",
            CHECK_OPERATION,
            error,
        )),
    }
}

#[tauri::command]
pub fn open_png(path: String) -> Result<DecodedPng, AppError> {
    let reader = ImageReader::open(Path::new(&path))
        .map_err(|error| {
            AppError::new(
                ErrorCode::FileOpenFailed,
                "Could not open the selected file.",
                OPEN_OPERATION,
                error,
            )
        })?
        .with_guessed_format()
        .map_err(|error| {
            AppError::new(
                ErrorCode::ImageDecodeFailed,
                "Could not identify the image format.",
                OPEN_OPERATION,
                error,
            )
        })?;

    if reader.format() != Some(ImageFormat::Png) {
        return Err(AppError::new(
            ErrorCode::UnsupportedFormat,
            "Only PNG files can be opened at this stage.",
            OPEN_OPERATION,
            format!("detected format: {:?}", reader.format()),
        ));
    }

    let image = reader
        .decode()
        .map_err(|error| {
            AppError::new(
                ErrorCode::ImageDecodeFailed,
                "Could not decode the PNG image.",
                OPEN_OPERATION,
                error,
            )
        })?
        .to_rgba8();
    let (width, height) = image.dimensions();
    validate_dimensions(width, height, OPEN_OPERATION)?;

    Ok(DecodedPng {
        width,
        height,
        rgba: image.into_raw(),
    })
}

#[tauri::command]
pub fn save_png(path: String, width: u32, height: u32, rgba: Vec<u8>) -> Result<String, AppError> {
    validate_dimensions(width, height, SAVE_OPERATION)?;

    let expected_length = expected_rgba_length(width, height, SAVE_OPERATION)?;
    if rgba.len() != expected_length {
        return Err(AppError::new(
            ErrorCode::InvalidPixelBuffer,
            "Image pixels do not match the document dimensions.",
            SAVE_OPERATION,
            format!(
                "expected {expected_length} RGBA bytes, received {}",
                rgba.len()
            ),
        ));
    }

    let output_path = png_output_path(&path);
    let image =
        ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width, height, rgba).ok_or_else(|| {
            AppError::new(
                ErrorCode::ImageEncodeFailed,
                "Could not prepare the image for PNG encoding.",
                SAVE_OPERATION,
                "ImageBuffer::from_raw returned None",
            )
        })?;
    atomic_write_png(&image, &output_path)?;

    Ok(output_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{
        check_file_available, expected_rgba_length, open_png, png_output_path, save_png,
        validate_dimensions,
    };
    use crate::errors::ErrorCode;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_path(name: &str) -> std::path::PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after the Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "chudopaint-{name}-{}-{timestamp}.png",
            std::process::id()
        ))
    }

    #[test]
    fn validates_rgba_buffer_length() {
        assert_eq!(expected_rgba_length(2, 3, "test"), Ok(24));
    }

    #[test]
    fn rejects_dimensions_outside_editor_limits() {
        let error = validate_dimensions(0, 100, "test").expect_err("zero width should fail");
        assert_eq!(error.code, ErrorCode::InvalidDimensions);
        assert!(validate_dimensions(32_769, 100, "test").is_err());
    }

    #[test]
    fn appends_png_extension_when_missing() {
        assert_eq!(png_output_path("artwork").to_string_lossy(), "artwork.png");
    }

    #[test]
    fn overwrites_png_without_leaving_a_temporary_file() {
        let path = temporary_path("atomic-save");
        save_png(
            path.to_string_lossy().into_owned(),
            1,
            1,
            vec![255, 0, 0, 255],
        )
        .expect("initial PNG should save");
        save_png(
            path.to_string_lossy().into_owned(),
            1,
            1,
            vec![0, 0, 255, 255],
        )
        .expect("replacement PNG should save");

        let decoded = open_png(path.to_string_lossy().into_owned()).expect("PNG should decode");
        assert_eq!(decoded.rgba, vec![0, 0, 255, 255]);
        std::fs::remove_file(path).expect("temporary PNG should be removed");
    }

    #[test]
    fn returns_a_typed_error_when_parent_directory_is_missing() {
        let path = std::env::temp_dir()
            .join("chudopaint-missing-parent")
            .join("output.png");
        let error = save_png(path.to_string_lossy().into_owned(), 1, 1, vec![0, 0, 0, 0])
            .expect_err("saving in a missing directory should fail");
        assert_eq!(error.code, ErrorCode::FileWriteFailed);
    }

    #[test]
    fn keeps_existing_destination_untouched_when_replacement_fails() {
        let root = temporary_path("replacement-failure").with_extension("");
        std::fs::create_dir(&root).expect("test directory should be created");
        let destination = root.join("existing.png");
        std::fs::create_dir(&destination).expect("destination directory should be created");

        let error = save_png(
            destination.to_string_lossy().into_owned(),
            1,
            1,
            vec![0, 0, 0, 0],
        )
        .expect_err("replacing a directory should fail");

        assert_eq!(error.code, ErrorCode::FileWriteFailed);
        assert!(destination.is_dir());
        assert_eq!(
            std::fs::read_dir(&root)
                .expect("test directory should be readable")
                .count(),
            1,
            "the failed temporary write should be cleaned up"
        );
        std::fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn checks_source_file_availability() {
        let path = temporary_path("availability");
        assert_eq!(
            check_file_available(path.to_string_lossy().into_owned()),
            Ok(false)
        );
        std::fs::write(&path, "source").expect("test source should write");
        assert_eq!(
            check_file_available(path.to_string_lossy().into_owned()),
            Ok(true)
        );
        std::fs::remove_file(path).expect("test source should be removed");
    }
}
