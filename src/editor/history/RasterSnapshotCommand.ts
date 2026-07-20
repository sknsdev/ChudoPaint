import type { Command } from "@/editor/history/Command";
import type { RasterSurface } from "@/editor/renderer/RasterSurface";

export class RasterSnapshotCommand implements Command {
  constructor(
    private readonly surface: RasterSurface,
    private readonly before: Uint8ClampedArray,
    private readonly after: Uint8ClampedArray,
  ) {}

  undo(): void {
    this.surface.restorePixels(this.before);
  }

  redo(): void {
    this.surface.restorePixels(this.after);
  }
}
