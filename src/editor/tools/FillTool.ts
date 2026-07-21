import type { Tool, ToolContext, ToolPointerEvent } from "@/editor/tools/types";

export class FillTool implements Tool {
  readonly id = "fill";
  readonly cursor = "copy";

  onPointerDown(event: ToolPointerEvent, context: ToolContext): void {
    context.beginRasterStroke("Fill");
    context.floodFill(
      event.point,
      context.getColor(event.button === 2 ? "secondary" : "primary"),
      context.getFillTolerance(),
    );
    context.finishRasterStroke();
  }

  onPointerMove(): void {}

  onPointerUp(): void {}

  onPointerCancel(context: ToolContext): void {
    context.cancelRasterStroke();
  }
}
