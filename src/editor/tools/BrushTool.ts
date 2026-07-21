import type { Tool, ToolContext, ToolPointerEvent } from "@/editor/tools/types";
import type { Point } from "@/editor/viewport";

export class BrushTool implements Tool {
  readonly id = "brush";
  readonly cursor = "crosshair";
  private previousPoint: Point | null = null;
  private colorSlot: "primary" | "secondary" = "primary";

  onPointerDown(event: ToolPointerEvent, context: ToolContext): void {
    this.previousPoint = event.point;
    this.colorSlot = event.button === 2 ? "secondary" : "primary";
    context.beginRasterStroke("Brush stroke");
    context.drawRasterBrushLine(
      event.point,
      event.point,
      context.getColor(this.colorSlot),
      context.getBrushSettings(),
    );
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): void {
    if (!this.previousPoint) {
      return;
    }

    context.drawRasterBrushLine(
      this.previousPoint,
      event.point,
      context.getColor(this.colorSlot),
      context.getBrushSettings(),
    );
    this.previousPoint = event.point;
  }

  onPointerUp(event: ToolPointerEvent, context: ToolContext): void {
    if (this.previousPoint) {
      context.drawRasterBrushLine(
        this.previousPoint,
        event.point,
        context.getColor(this.colorSlot),
        context.getBrushSettings(),
      );
    }

    this.previousPoint = null;
    context.finishRasterStroke();
  }

  onPointerCancel(context: ToolContext): void {
    this.previousPoint = null;
    context.cancelRasterStroke();
  }
}
