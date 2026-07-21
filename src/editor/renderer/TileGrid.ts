import type { DirtyRect } from "@/editor/renderer/DirtyRect";

export const TILE_SIZE = 256;

export interface TileCoordinate {
  x: number;
  y: number;
}

/**
 * Tile addressing shared by future tile storage, dirty compositing and history.
 * Pixels remain contiguous today; introducing this contract avoids coupling
 * future large-document work to a specific storage implementation.
 */
export function tilesForDirtyRect(rect: DirtyRect, tileSize = TILE_SIZE): TileCoordinate[] {
  if (!Number.isInteger(tileSize) || tileSize < 1) {
    throw new RangeError(`Tile size must be a positive integer. Received: ${tileSize}.`);
  }

  const firstX = Math.floor(rect.x / tileSize);
  const firstY = Math.floor(rect.y / tileSize);
  const lastX = Math.floor((rect.x + rect.width - 1) / tileSize);
  const lastY = Math.floor((rect.y + rect.height - 1) / tileSize);
  const tiles: TileCoordinate[] = [];

  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      tiles.push({ x, y });
    }
  }

  return tiles;
}
