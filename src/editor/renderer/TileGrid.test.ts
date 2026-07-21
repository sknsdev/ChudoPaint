import { describe, expect, it } from "vitest";
import { tilesForDirtyRect } from "@/editor/renderer/TileGrid";

describe("tilesForDirtyRect", () => {
  it("maps a dirty rectangle onto all intersecting 256px tiles", () => {
    expect(tilesForDirtyRect({ x: 250, y: 250, width: 20, height: 20 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });
});
