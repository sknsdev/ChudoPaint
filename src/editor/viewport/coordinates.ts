import type { Point, Viewport, ViewportBounds } from "@/editor/viewport/types";

const DEFAULT_ZOOM = 1;

function requireFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${fieldName} must be a finite number. Received: ${value}.`);
  }
}

function requireZoom(zoom: number): void {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new RangeError(`Viewport zoom must be a positive finite number. Received: ${zoom}.`);
  }
}

function requirePoint(point: Point, fieldName: string): void {
  requireFinite(point.x, `${fieldName}.x`);
  requireFinite(point.y, `${fieldName}.y`);
}

/** Creates a viewport transform with a document origin at (0, 0). */
export function createViewport(zoom = DEFAULT_ZOOM, origin: Point = { x: 0, y: 0 }): Viewport {
  requireZoom(zoom);
  requirePoint(origin, "Viewport origin");

  return {
    zoom,
    origin: { ...origin },
  };
}

/** Converts a document pixel coordinate into a viewport-local coordinate. */
export function documentToViewport(point: Point, viewport: Viewport): Point {
  requirePoint(point, "Document point");
  requireZoom(viewport.zoom);
  requirePoint(viewport.origin, "Viewport origin");

  return {
    x: point.x * viewport.zoom + viewport.origin.x,
    y: point.y * viewport.zoom + viewport.origin.y,
  };
}

/** Converts a viewport-local coordinate into a document pixel coordinate. */
export function viewportToDocument(point: Point, viewport: Viewport): Point {
  requirePoint(point, "Viewport point");
  requireZoom(viewport.zoom);
  requirePoint(viewport.origin, "Viewport origin");

  return {
    x: (point.x - viewport.origin.x) / viewport.zoom,
    y: (point.y - viewport.origin.y) / viewport.zoom,
  };
}

/**
 * Converts browser client coordinates to coordinates local to the viewport
 * element. Read `left` and `top` from its DOMRect for each pointer event.
 */
export function screenToViewport(point: Point, bounds: ViewportBounds): Point {
  requirePoint(point, "Screen point");
  requireFinite(bounds.left, "Viewport bounds.left");
  requireFinite(bounds.top, "Viewport bounds.top");

  return {
    x: point.x - bounds.left,
    y: point.y - bounds.top,
  };
}

/** Converts browser client coordinates directly into a document pixel coordinate. */
export function screenToDocument(point: Point, bounds: ViewportBounds, viewport: Viewport): Point {
  return viewportToDocument(screenToViewport(point, bounds), viewport);
}
