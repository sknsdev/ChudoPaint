import type { Command } from "@/editor/history/Command";
import type { DirtyRect } from "@/editor/renderer/DirtyRect";
import type { RasterSurface } from "@/editor/renderer/RasterSurface";

export class RasterPatchCommand implements Command {
  readonly label: string;

  constructor(
    label: string,
    private readonly surface: RasterSurface,
    private readonly rect: DirtyRect,
    private readonly before: Uint8ClampedArray,
    private readonly after: Uint8ClampedArray,
  ) {
    this.label = label;
  }

  undo(): void {
    this.surface.restoreRect(this.rect, this.before);
  }

  redo(): void {
    this.surface.restoreRect(this.rect, this.after);
  }
}
