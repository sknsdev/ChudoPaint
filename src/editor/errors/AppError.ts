export type AppErrorCode =
  | "fileOpenFailed"
  | "unsupportedFormat"
  | "imageDecodeFailed"
  | "invalidDimensions"
  | "invalidPixelBuffer"
  | "fileWriteFailed"
  | "imageEncodeFailed"
  | "unexpected";

export interface AppErrorContext {
  operation: string;
  details: string;
}

export interface AppError {
  code: AppErrorCode;
  message: string;
  context: AppErrorContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAppError(value: unknown): value is AppError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    isRecord(value.context) &&
    typeof value.context.operation === "string" &&
    typeof value.context.details === "string"
  );
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** Normalizes Tauri invoke rejections into the stable frontend error contract. */
export function toAppError(error: unknown): AppError {
  const candidate = error instanceof Error ? tryParseJson(error.message) : error;

  if (isAppError(candidate)) {
    return candidate;
  }

  return {
    code: "unexpected",
    message: "An unexpected application error occurred.",
    context: {
      operation: "unknown",
      details: error instanceof Error ? error.message : String(error),
    },
  };
}

export function formatAppError(error: unknown): string {
  const appError = toAppError(error);
  return `${appError.message} [${appError.code}]`;
}
