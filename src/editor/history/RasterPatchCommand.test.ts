import { describe, expect, it } from "vitest";
import { RasterPatchCommand } from "@/editor/history/RasterPatchCommand";
import { RasterSurface } from "@/editor/renderer";

describe("RasterPatchCommand", () => {
  it("restores and reapplies only the dirty rectangle", () => {
    const surface = new RasterSurface(
      3,
      1,
      new Uint8ClampedArray([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255]),
    );
    const before = surface.copyRect({ x: 1, y: 0, width: 1, height: 1 });
    const after = new Uint8ClampedArray([200, 0, 0, 255]);
    surface.restoreRect({ x: 1, y: 0, width: 1, height: 1 }, after);
    const command = new RasterPatchCommand(
      "Pencil stroke",
      surface,
      { x: 1, y: 0, width: 1, height: 1 },
      before,
      after,
    );

    command.undo();
    expect([...surface.data]).toEqual([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255]);

    command.redo();
    expect([...surface.data]).toEqual([10, 0, 0, 255, 200, 0, 0, 255, 30, 0, 0, 255]);
    expect(command.label).toBe("Pencil stroke");
  });
});
