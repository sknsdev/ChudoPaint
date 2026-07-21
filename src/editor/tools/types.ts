import type { BrushSettings, RgbaColor } from "@/editor/renderer/RasterSurface";
import type { Point } from "@/editor/viewport";

export type ColorSlot = "primary" | "secondary";

export interface ToolPointerEvent {
  point: Point;
  button: number;
}

export interface ToolContext {
  beginRasterStroke(label: string): void;
  drawRasterLine(from: Point, to: Point, color: RgbaColor): boolean;
  drawRasterBrushLine(from: Point, to: Point, color: RgbaColor, settings: BrushSettings): boolean;
  eraseRasterBrushLine(from: Point, to: Point, settings: BrushSettings): boolean;
  floodFill(point: Point, color: RgbaColor, tolerance: number): boolean;
  getColor(slot: ColorSlot): RgbaColor;
  getBrushSettings(): BrushSettings;
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
