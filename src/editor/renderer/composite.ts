import type { EditorDocument } from "@/editor/document";
import type { RasterSurface } from "@/editor/renderer/RasterSurface";

export type LayerSurfaceResolver = (layerId: string) => RasterSurface;

/**
 * Composites visible raster layers with normal source-over alpha blending.
 * RasterSurface stores straight sRGB RGBA8 values, so the output is converted
 * back to straight alpha after every blend operation.
 */
export function compositeDocumentLayers(
  document: EditorDocument,
  getSurface: LayerSurfaceResolver,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(document.width * document.height * 4);

  for (const layer of document.layers) {
    if (!layer.visible || layer.opacity === 0) {
      continue;
    }

    const surface = getSurface(layer.id);
    compositeSurface(
      output,
      document.width,
      document.height,
      surface,
      layer.offset.x,
      layer.offset.y,
      layer.opacity,
    );
  }

  return output;
}

function compositeSurface(
  destination: Uint8ClampedArray,
  destinationWidth: number,
  destinationHeight: number,
  source: RasterSurface,
  offsetX: number,
  offsetY: number,
  opacity: number,
): void {
  const startX = Math.max(0, offsetX);
  const startY = Math.max(0, offsetY);
  const endX = Math.min(destinationWidth, offsetX + source.width);
  const endY = Math.min(destinationHeight, offsetY + source.height);

  for (let destinationY = startY; destinationY < endY; destinationY += 1) {
    const sourceY = destinationY - offsetY;

    for (let destinationX = startX; destinationX < endX; destinationX += 1) {
      const sourceX = destinationX - offsetX;
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const destinationOffset = (destinationY * destinationWidth + destinationX) * 4;
      blendSourceOver(destination, destinationOffset, source.data, sourceOffset, opacity);
    }
  }
}

function blendSourceOver(
  destination: Uint8ClampedArray,
  destinationOffset: number,
  source: Uint8ClampedArray,
  sourceOffset: number,
  layerOpacity: number,
): void {
  const sourceAlpha = (source[sourceOffset + 3] / 255) * layerOpacity;
  if (sourceAlpha === 0) {
    return;
  }

  const destinationAlpha = destination[destinationOffset + 3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  const sourceWeight = sourceAlpha / outputAlpha;
  const destinationWeight = (destinationAlpha * (1 - sourceAlpha)) / outputAlpha;

  destination[destinationOffset] = Math.round(
    source[sourceOffset] * sourceWeight + destination[destinationOffset] * destinationWeight,
  );
  destination[destinationOffset + 1] = Math.round(
    source[sourceOffset + 1] * sourceWeight +
      destination[destinationOffset + 1] * destinationWeight,
  );
  destination[destinationOffset + 2] = Math.round(
    source[sourceOffset + 2] * sourceWeight +
      destination[destinationOffset + 2] * destinationWeight,
  );
  destination[destinationOffset + 3] = Math.round(outputAlpha * 255);
}
