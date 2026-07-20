use image::{ImageBuffer, ImageFormat, ImageReader, Rgba};
use serde::Serialize;
use std::path::{Path, PathBuf};

const MAX_DOCUMENT_DIMENSION: u32 = 32_768;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedPng {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0
        || height == 0
        || width > MAX_DOCUMENT_DIMENSION
        || height > MAX_DOCUMENT_DIMENSION
    {
        return Err(format!(
            "PNG dimensions must be between 1 and {MAX_DOCUMENT_DIMENSION} pixels. Received: {width}×{height}."
        ));
    }

    Ok(())
}

fn expected_rgba_length(width: u32, height: u32) -> Result<usize, String> {
    usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "PNG dimensions are too large to allocate safely.".to_owned())
}

fn png_output_path(path: &str) -> PathBuf {
    let mut output = PathBuf::from(path);
    if output.extension().and_then(|extension| extension.to_str()) != Some("png") {
        output.set_extension("png");
    }
    output
}

#[tauri::command]
pub fn open_png(path: String) -> Result<DecodedPng, String> {
    let reader = ImageReader::open(Path::new(&path))
        .map_err(|error| format!("Could not open PNG file: {error}"))?
        .with_guessed_format()
        .map_err(|error| format!("Could not identify image format: {error}"))?;

    if reader.format() != Some(ImageFormat::Png) {
        return Err("Only PNG files can be opened at this stage.".to_owned());
    }

    let image = reader
        .decode()
        .map_err(|error| format!("Could not decode PNG image: {error}"))?
        .to_rgba8();
    let (width, height) = image.dimensions();
    validate_dimensions(width, height)?;

    Ok(DecodedPng {
        width,
        height,
        rgba: image.into_raw(),
    })
}

#[tauri::command]
pub fn save_png(path: String, width: u32, height: u32, rgba: Vec<u8>) -> Result<String, String> {
    validate_dimensions(width, height)?;

    let expected_length = expected_rgba_length(width, height)?;
    if rgba.len() != expected_length {
        return Err(format!(
            "RGBA buffer length does not match image dimensions. Expected {expected_length} bytes, received {}.",
            rgba.len()
        ));
    }

    let output_path = png_output_path(&path);
    let image = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width, height, rgba)
        .ok_or_else(|| "Could not create PNG image from the RGBA buffer.".to_owned())?;

    image
        .save_with_format(&output_path, ImageFormat::Png)
        .map_err(|error| format!("Could not save PNG file: {error}"))?;

    Ok(output_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{expected_rgba_length, open_png, png_output_path, save_png, validate_dimensions};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn validates_rgba_buffer_length() {
        assert_eq!(expected_rgba_length(2, 3), Ok(24));
    }

    #[test]
    fn rejects_dimensions_outside_editor_limits() {
        assert!(validate_dimensions(0, 100).is_err());
        assert!(validate_dimensions(32_769, 100).is_err());
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
