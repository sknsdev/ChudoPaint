export interface Layer {
  /** Stable identity used by commands and UI selection. */
  id: string;
  kind: "raster";
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  lockTransparency: boolean;
  offset: LayerOffset;
}

export interface LayerOffset {
  x: number;
  y: number;
}

export type RasterLayer = Layer;
