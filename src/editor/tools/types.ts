import type { RgbaColor } from "@/editor/renderer/RasterSurface";
import type { Point } from "@/editor/viewport";

export interface ToolPointerEvent {
  point: Point;
}

export interface ToolContext {
  beginRasterStroke(): void;
  drawRasterLine(from: Point, to: Point, color: RgbaColor): boolean;
  finishRasterStroke(): boolean;
  cancelRasterStroke(): void;
}

/**
 * Tools receive document coordinates only. Canvas and viewport details stay at
 * the interaction boundary, so tools remain reusable by other renderers.
 */
export interface Tool {
  id: string;
  cursor: string;
  onPointerDown(event: ToolPointerEvent, context: ToolContext): void;
  onPointerMove(event: ToolPointerEvent, context: ToolContext): void;
  onPointerUp(event: ToolPointerEvent, context: ToolContext): void;
  onPointerCancel(context: ToolContext): void;
}
