import type { Point } from "@/editor/viewport";

export interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export class RasterSurface {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
    data: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4),
  ) {
    if (data.length !== width * height * 4) {
      throw new RangeError("Raster surface data length does not match its dimensions.");
    }

    this.data = data;
  }

  clonePixels(): Uint8ClampedArray {
    return new Uint8ClampedArray(this.data);
  }

  restorePixels(snapshot: Uint8ClampedArray): void {
    if (snapshot.length !== this.data.length) {
      throw new RangeError("Raster snapshot dimensions do not match this surface.");
    }

    this.data.set(snapshot);
  }

  drawLine(from: Point, to: Point, color: RgbaColor): boolean {
    let x = Math.round(from.x);
    let y = Math.round(from.y);
    const targetX = Math.round(to.x);
    const targetY = Math.round(to.y);
    const deltaX = Math.abs(targetX - x);
    const stepX = x < targetX ? 1 : -1;
    const deltaY = -Math.abs(targetY - y);
    const stepY = y < targetY ? 1 : -1;
    let error = deltaX + deltaY;
    let changed = false;

    while (true) {
      changed = this.setPixel(x, y, color) || changed;

      if (x === targetX && y === targetY) {
        return changed;
      }

      const doubledError = error * 2;
      if (doubledError >= deltaY) {
        error += deltaY;
        x += stepX;
      }
      if (doubledError <= deltaX) {
        error += deltaX;
        y += stepY;
      }
    }
  }

  private setPixel(x: number, y: number, color: RgbaColor): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }

    const offset = (y * this.width + x) * 4;
    const hasChanged =
      this.data[offset] !== color.red ||
      this.data[offset + 1] !== color.green ||
      this.data[offset + 2] !== color.blue ||
      this.data[offset + 3] !== color.alpha;

    if (!hasChanged) {
      return false;
    }

    this.data[offset] = color.red;
    this.data[offset + 1] = color.green;
    this.data[offset + 2] = color.blue;
    this.data[offset + 3] = color.alpha;
    return true;
  }
}
