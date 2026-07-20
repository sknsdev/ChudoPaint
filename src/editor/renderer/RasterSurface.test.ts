import { describe, expect, it } from "vitest";
import { RasterSurface } from "@/editor/renderer";

describe("RasterSurface tools", () => {
  it("erases brush pixels to transparency", () => {
    const surface = new RasterSurface(5, 5, new Uint8ClampedArray(5 * 5 * 4).fill(255));

    expect(
      surface.eraseBrushLine(
        { x: 2, y: 2 },
        { x: 2, y: 2 },
        {
          size: 1,
          hardness: 1,
          opacity: 1,
        },
      ),
    ).toBe(true);

    expect(surface.data[(2 * 5 + 2) * 4 + 3]).toBe(0);
  });

  it("fills a connected region on the active surface", () => {
    const surface = new RasterSurface(3, 1);

    expect(surface.floodFill({ x: 1, y: 0 }, { red: 255, green: 0, blue: 0, alpha: 255 }, 0)).toBe(
      true,
    );

    expect([...surface.data]).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
  });
});
