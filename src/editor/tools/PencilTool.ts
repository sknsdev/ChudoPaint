import type { Tool, ToolContext, ToolPointerEvent } from "@/editor/tools/types";
import type { Point } from "@/editor/viewport";

export class PencilTool implements Tool {
  readonly id = "pencil";
  readonly cursor = "crosshair";
  private previousPoint: Point | null = null;
  private colorSlot: "primary" | "secondary" = "primary";

  onPointerDown(event: ToolPointerEvent, context: ToolContext): void {
    this.previousPoint = event.point;
    this.colorSlot = event.button === 2 ? "secondary" : "primary";
    context.beginRasterStroke("Pencil stroke");
    context.drawRasterLine(event.point, event.point, context.getColor(this.colorSlot));
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): void {
    if (!this.previousPoint) {
      return;
    }

    context.drawRasterLine(this.previousPoint, event.point, context.getColor(this.colorSlot));
    this.previousPoint = event.point;
  }

  onPointerUp(event: ToolPointerEvent, context: ToolContext): void {
    if (this.previousPoint) {
      context.drawRasterLine(this.previousPoint, event.point, context.getColor(this.colorSlot));
    }

    this.previousPoint = null;
    context.finishRasterStroke();
  }

  onPointerCancel(context: ToolContext): void {
    this.previousPoint = null;
    context.cancelRasterStroke();
  }
}
