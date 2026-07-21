use crate::errors::{AppError, ErrorCode};
use image::{ImageBuffer, ImageFormat, ImageReader, Rgba};
use serde::Serialize;
use std::path::{Path, PathBuf};

const MAX_DOCUMENT_DIMENSION: u32 = 32_768;
const OPEN_OPERATION: &str = "open_png";
const SAVE_OPERATION: &str = "save_png";

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

    image
        .save_with_format(&output_path, ImageFormat::Png)
        .map_err(|error| {
            AppError::new(
                ErrorCode::FileWriteFailed,
                "Could not save the PNG file.",
                SAVE_OPERATION,
                error,
            )
        })?;

    Ok(output_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{expected_rgba_length, open_png, png_output_path, save_png, validate_dimensions};
    use crate::errors::ErrorCode;
    use std::time::{SystemTime, UNIX_EPOCH};

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
    fn encodes_and_decodes_rgba_pixels() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "chudopaint-png-test-{}-{timestamp}.png",
            std::process::id()
        ));
        let rgba = vec![255, 0, 0, 255, 0, 0, 255, 128];

        let saved_path = save_png(path.to_string_lossy().into_owned(), 2, 1, rgba.clone())
            .expect("PNG should save successfully");
        let decoded = open_png(saved_path.clone()).expect("PNG should decode successfully");

        assert_eq!(decoded.width, 2);
        assert_eq!(decoded.height, 1);
        assert_eq!(decoded.rgba, rgba);
        std::fs::remove_file(saved_path).expect("temporary PNG should be removed");
    }
}
