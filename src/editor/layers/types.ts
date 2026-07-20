export interface Layer {
  /** Stable identity used by commands and UI selection. */
  id: string;
  kind: "raster";
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  offset: LayerOffset;
}

export interface LayerOffset {
  x: number;
  y: number;
}

/**
 * The first layer type. Pixel storage is intentionally introduced separately
 * from React state when the renderer is implemented.
 */
export type RasterLayer = Layer;
