/** A point in a two-dimensional coordinate space. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The local bounds of the viewport element in browser client coordinates.
 * PointerEvent.clientX and PointerEvent.clientY are screen coordinates for
 * the editor's purposes.
 */
export interface ViewportBounds {
  left: number;
  top: number;
}

/**
 * Maps document pixels onto the viewport.
 *
 * `origin` is the viewport-local position of document point (0, 0). It is
 * intentionally independent from the viewport element's browser position.
 */
export interface Viewport {
  zoom: number;
  origin: Point;
}
