import type { Point } from "@/editor/viewport";

export interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface BrushSettings {
  size: number;
  hardness: number;
  opacity: number;
}

/** Stores straight sRGB RGBA8 pixels for a single raster layer. */
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

  drawBrushLine(from: Point, to: Point, color: RgbaColor, settings: BrushSettings): boolean {
    return this.stampLine(from, to, settings, (x, y, strength) =>
      this.blendPixel(x, y, color, strength),
    );
  }

  eraseBrushLine(from: Point, to: Point, settings: BrushSettings): boolean {
    return this.stampLine(from, to, settings, (x, y, strength) => this.erasePixel(x, y, strength));
  }

  floodFill(point: Point, color: RgbaColor, tolerance: number): boolean {
    const startX = Math.round(point.x);
    const startY = Math.round(point.y);
    if (startX < 0 || startY < 0 || startX >= this.width || startY >= this.height) {
      return false;
    }

    const startOffset = (startY * this.width + startX) * 4;
    const target = this.data.slice(startOffset, startOffset + 4);
    const pixelCount = this.width * this.height;
    const visited = new Uint8Array(pixelCount);
    const queue = [startY * this.width + startX];
    let readIndex = 0;
    let changed = false;

    while (readIndex < queue.length) {
      const pixelIndex = queue[readIndex++];
      if (visited[pixelIndex]) {
        continue;
      }
      visited[pixelIndex] = 1;

      const offset = pixelIndex * 4;
      if (!this.matchesColor(offset, target, tolerance)) {
        continue;
      }

      const x = pixelIndex % this.width;
      const y = Math.floor(pixelIndex / this.width);
      changed = this.blendPixel(x, y, color, 1) || changed;

      if (x > 0) {
        queue.push(pixelIndex - 1);
      }
      if (x < this.width - 1) {
        queue.push(pixelIndex + 1);
      }
      if (y > 0) {
        queue.push(pixelIndex - this.width);
      }
      if (y < this.height - 1) {
        queue.push(pixelIndex + this.width);
      }
    }

    return changed;
  }

  private stampLine(
    from: Point,
    to: Point,
    settings: BrushSettings,
    stamp: (x: number, y: number, strength: number) => boolean,
  ): boolean {
    this.validateBrushSettings(settings);
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const distance = Math.hypot(deltaX, deltaY);
    const spacing = Math.max(1, settings.size * 0.25);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    let changed = false;

    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      changed =
        this.stampCircle(from.x + deltaX * progress, from.y + deltaY * progress, settings, stamp) ||
        changed;
    }

    return changed;
  }

  private stampCircle(
    centerX: number,
    centerY: number,
    settings: BrushSettings,
    stamp: (x: number, y: number, strength: number) => boolean,
  ): boolean {
    const radius = settings.size / 2;
    const startX = Math.max(0, Math.floor(centerX - radius));
    const endX = Math.min(this.width - 1, Math.ceil(centerX + radius));
    const startY = Math.max(0, Math.floor(centerY - radius));
    const endY = Math.min(this.height - 1, Math.ceil(centerY + radius));
    const hardRadius = radius * settings.hardness;
    let changed = false;

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance > radius) {
          continue;
        }

        const edgeStrength =
          settings.hardness === 1 || distance <= hardRadius
            ? 1
            : (radius - distance) / (radius - hardRadius);
        changed = stamp(x, y, edgeStrength * settings.opacity) || changed;
      }
    }

    return changed;
  }

  private blendPixel(x: number, y: number, color: RgbaColor, opacity: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }

    const offset = (y * this.width + x) * 4;
    const sourceAlpha = (color.alpha / 255) * opacity;
    const destinationAlpha = this.data[offset + 3] / 255;
    const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
    if (outputAlpha === 0) {
      return false;
    }

    const sourceWeight = sourceAlpha / outputAlpha;
    const destinationWeight = (destinationAlpha * (1 - sourceAlpha)) / outputAlpha;
    const nextRed = Math.round(color.red * sourceWeight + this.data[offset] * destinationWeight);
    const nextGreen = Math.round(
      color.green * sourceWeight + this.data[offset + 1] * destinationWeight,
    );
    const nextBlue = Math.round(
      color.blue * sourceWeight + this.data[offset + 2] * destinationWeight,
    );
    const nextAlpha = Math.round(outputAlpha * 255);

    return this.writePixel(offset, nextRed, nextGreen, nextBlue, nextAlpha);
  }

  private erasePixel(x: number, y: number, strength: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }

    const offset = (y * this.width + x) * 4;
    const nextAlpha = Math.round(this.data[offset + 3] * (1 - strength));
    return this.writePixel(
      offset,
      this.data[offset],
      this.data[offset + 1],
      this.data[offset + 2],
      nextAlpha,
    );
  }

  private setPixel(x: number, y: number, color: RgbaColor): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }

    const offset = (y * this.width + x) * 4;
    return this.writePixel(offset, color.red, color.green, color.blue, color.alpha);
  }

  private writePixel(
    offset: number,
    red: number,
    green: number,
    blue: number,
    alpha: number,
  ): boolean {
    if (
      this.data[offset] === red &&
      this.data[offset + 1] === green &&
      this.data[offset + 2] === blue &&
      this.data[offset + 3] === alpha
    ) {
      return false;
    }

    this.data[offset] = red;
    this.data[offset + 1] = green;
    this.data[offset + 2] = blue;
    this.data[offset + 3] = alpha;
    return true;
  }

  private matchesColor(offset: number, target: Uint8ClampedArray, tolerance: number): boolean {
    return (
      Math.abs(this.data[offset] - target[0]) <= tolerance &&
      Math.abs(this.data[offset + 1] - target[1]) <= tolerance &&
      Math.abs(this.data[offset + 2] - target[2]) <= tolerance &&
      Math.abs(this.data[offset + 3] - target[3]) <= tolerance
    );
  }

  private validateBrushSettings(settings: BrushSettings): void {
    if (!Number.isFinite(settings.size) || settings.size < 1) {
      throw new RangeError(`Brush size must be at least 1. Received: ${settings.size}.`);
    }
    if (!Number.isFinite(settings.hardness) || settings.hardness < 0 || settings.hardness > 1) {
      throw new RangeError(
        `Brush hardness must be between 0 and 1. Received: ${settings.hardness}.`,
      );
    }
    if (!Number.isFinite(settings.opacity) || settings.opacity < 0 || settings.opacity > 1) {
      throw new RangeError(`Brush opacity must be between 0 and 1. Received: ${settings.opacity}.`);
    }
  }
}
