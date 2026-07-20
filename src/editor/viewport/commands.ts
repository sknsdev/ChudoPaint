import type { Viewport } from "@/editor/viewport/types";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportFitOptions {
  minZoom: number;
  maxZoom: number;
  padding: number;
}

function requirePositiveFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${fieldName} must be a positive finite number. Received: ${value}.`);
  }
}

function centerDocument(document: ViewportSize, viewport: ViewportSize, zoom: number): Viewport {
  return {
    zoom,
    origin: {
      x: (viewport.width - document.width * zoom) / 2,
      y: (viewport.height - document.height * zoom) / 2,
    },
  };
}

/** Centers the document at its native one-document-pixel-to-one-CSS-pixel scale. */
export function resetViewportToActualSize(
  document: ViewportSize,
  viewport: ViewportSize,
): Viewport {
  requirePositiveFinite(document.width, "Document width");
  requirePositiveFinite(document.height, "Document height");
  requirePositiveFinite(viewport.width, "Viewport width");
  requirePositiveFinite(viewport.height, "Viewport height");

  return centerDocument(document, viewport, 1);
}

/** Fits the complete document inside the available viewport while keeping it centered. */
export function fitDocumentToViewport(
  document: ViewportSize,
  viewport: ViewportSize,
  options: ViewportFitOptions,
): Viewport {
  requirePositiveFinite(document.width, "Document width");
  requirePositiveFinite(document.height, "Document height");
  requirePositiveFinite(viewport.width, "Viewport width");
  requirePositiveFinite(viewport.height, "Viewport height");
  requirePositiveFinite(options.minZoom, "Minimum zoom");
  requirePositiveFinite(options.maxZoom, "Maximum zoom");

  if (options.minZoom > options.maxZoom) {
    throw new RangeError("Minimum zoom cannot exceed maximum zoom.");
  }

  if (!Number.isFinite(options.padding) || options.padding < 0) {
    throw new RangeError(
      `Viewport padding must be a non-negative finite number. Received: ${options.padding}.`,
    );
  }

  const availableWidth = Math.max(1, viewport.width - options.padding * 2);
  const availableHeight = Math.max(1, viewport.height - options.padding * 2);
  const unconstrainedZoom = Math.min(
    availableWidth / document.width,
    availableHeight / document.height,
  );
  const zoom = Math.min(options.maxZoom, Math.max(options.minZoom, unconstrainedZoom));

  return centerDocument(document, viewport, zoom);
}
