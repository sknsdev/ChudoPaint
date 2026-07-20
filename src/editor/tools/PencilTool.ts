import type { RgbaColor } from "@/editor/renderer/RasterSurface";
import type { Tool, ToolContext, ToolPointerEvent } from "@/editor/tools/types";
import type { Point } from "@/editor/viewport";

const PENCIL_COLOR: RgbaColor = {
  red: 17,
  green: 24,
  blue: 39,
  alpha: 255,
};

export class PencilTool implements Tool {
  readonly id = "pencil";
  readonly cursor = "crosshair";
  private previousPoint: Point | null = null;

  onPointerDown(event: ToolPointerEvent, context: ToolContext): void {
    this.previousPoint = event.point;
    context.beginRasterStroke();
    context.drawRasterLine(event.point, event.point, PENCIL_COLOR);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): void {
    if (!this.previousPoint) {
      return;
    }

    context.drawRasterLine(this.previousPoint, event.point, PENCIL_COLOR);
    this.previousPoint = event.point;
  }

  onPointerUp(event: ToolPointerEvent, context: ToolContext): void {
    if (this.previousPoint) {
      context.drawRasterLine(this.previousPoint, event.point, PENCIL_COLOR);
    }

    this.previousPoint = null;
    context.finishRasterStroke();
  }

  onPointerCancel(context: ToolContext): void {
    this.previousPoint = null;
    context.cancelRasterStroke();
  }
}
