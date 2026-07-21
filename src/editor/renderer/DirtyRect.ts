import type { Point } from "@/editor/viewport";

export interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function dirtyRectFromPoints(from: Point, to: Point, padding = 0): DirtyRect {
  const left = Math.floor(Math.min(from.x, to.x) - padding);
  const top = Math.floor(Math.min(from.y, to.y) - padding);
  const right = Math.ceil(Math.max(from.x, to.x) + padding);
  const bottom = Math.ceil(Math.max(from.y, to.y) + padding);

  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

export function clampDirtyRect(rect: DirtyRect, width: number, height: number): DirtyRect | null {
  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const right = Math.min(width, rect.x + rect.width);
  const bottom = Math.min(height, rect.y + rect.height);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function unionDirtyRects(first: DirtyRect | null, second: DirtyRect): DirtyRect {
  if (!first) {
    return second;
  }

  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}
