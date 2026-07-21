use serde::Serialize;
use std::fmt::Display;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    FileOpenFailed,
    UnsupportedFormat,
    ImageDecodeFailed,
    InvalidDimensions,
    InvalidPixelBuffer,
    FileWriteFailed,
    ImageEncodeFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorContext {
    pub operation: &'static str,
    pub details: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    pub context: ErrorContext,
}

impl AppError {
    pub fn new(
        code: ErrorCode,
        message: impl Into<String>,
        operation: &'static str,
        details: impl Display,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            context: ErrorContext {
                operation,
                details: details.to_string(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AppError, ErrorCode};

    #[test]
    fn serializes_the_stable_frontend_error_contract() {
        let error = AppError::new(
            ErrorCode::ImageDecodeFailed,
            "Could not decode the PNG image.",
            "open_png",
            "unexpected end of file",
        );

        let value = serde_json::to_value(error).expect("error should serialize");
        assert_eq!(value["code"], "imageDecodeFailed");
        assert_eq!(value["message"], "Could not decode the PNG image.");
        assert_eq!(value["context"]["operation"], "open_png");
        assert_eq!(value["context"]["details"], "unexpected end of file");
    }
}
