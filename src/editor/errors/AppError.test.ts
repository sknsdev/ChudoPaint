import { describe, expect, it } from "vitest";
import { formatAppError, toAppError } from "@/editor/errors/AppError";

describe("toAppError", () => {
  it("preserves a structured Tauri error", () => {
    const error = toAppError({
      code: "imageDecodeFailed",
      message: "Could not decode the PNG image.",
      context: {
        operation: "open_png",
        details: "unexpected end of file",
      },
    });

    expect(error).toEqual({
      code: "imageDecodeFailed",
      message: "Could not decode the PNG image.",
      context: {
        operation: "open_png",
        details: "unexpected end of file",
      },
    });
  });

  it("normalizes unknown rejections without exposing implementation details", () => {
    expect(formatAppError(new Error("network unavailable"))).toBe(
      "An unexpected application error occurred. [unexpected]",
    );
  });
});
