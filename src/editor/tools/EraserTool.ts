import type { Tool, ToolContext, ToolPointerEvent } from "@/editor/tools/types";
import type { Point } from "@/editor/viewport";

export class EraserTool implements Tool {
  readonly id = "eraser";
  readonly cursor = "cell";
  private previousPoint: Point | null = null;

  onPointerDown(event: ToolPointerEvent, context: ToolContext): void {
    this.previousPoint = event.point;
    context.beginRasterStroke("Erase");
    context.eraseRasterBrushLine(event.point, event.point, context.getBrushSettings());
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): void {
    if (!this.previousPoint) {
      return;
    }

    context.eraseRasterBrushLine(this.previousPoint, event.point, context.getBrushSettings());
    this.previousPoint = event.point;
  }

  onPointerUp(event: ToolPointerEvent, context: ToolContext): void {
    if (this.previousPoint) {
      context.eraseRasterBrushLine(this.previousPoint, event.point, context.getBrushSettings());
    }

    this.previousPoint = null;
    context.finishRasterStroke();
  }

  onPointerCancel(context: ToolContext): void {
    this.previousPoint = null;
    context.cancelRasterStroke();
  }
}
