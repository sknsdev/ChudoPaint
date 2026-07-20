import { describe, expect, it } from "vitest";
import {
  createViewport,
  documentToViewport,
  screenToDocument,
  screenToViewport,
  viewportToDocument,
} from "@/editor/viewport";

describe("viewport coordinates", () => {
  const viewport = createViewport(2, { x: 100, y: 50 });

  it("maps document coordinates into viewport coordinates", () => {
    expect(documentToViewport({ x: 20, y: 30 }, viewport)).toEqual({ x: 140, y: 110 });
  });

  it("maps viewport coordinates back into document coordinates", () => {
    expect(viewportToDocument({ x: 140, y: 110 }, viewport)).toEqual({ x: 20, y: 30 });
  });

  it("converts screen coordinates through the viewport into document coordinates", () => {
    const bounds = { left: 200, top: 150 };

    expect(screenToViewport({ x: 310, y: 260 }, bounds)).toEqual({ x: 110, y: 110 });
    expect(screenToDocument({ x: 310, y: 260 }, bounds, viewport)).toEqual({ x: 5, y: 30 });
  });

  it("rejects invalid zoom values", () => {
    expect(() => createViewport(0)).toThrow(RangeError);
    expect(() => createViewport(Number.NaN)).toThrow(RangeError);
  });
});
