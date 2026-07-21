import { markDocumentDirty, markDocumentSaved, setSourceFile } from "@/editor/document";
import type { SourceFileMetadata } from "@/editor/document";
import { CallbackCommand, CommandHistory, RasterPatchCommand } from "@/editor/history";
import type { HistoryInfo } from "@/editor/history";
import type { EditorDocument } from "@/editor/document";
import type { Layer } from "@/editor/layers/types";
import {
  clampDirtyRect,
  compositeDocumentLayers,
  compositeDocumentRegion,
  dirtyRectFromPoints,
  unionDirtyRects,
} from "@/editor/renderer";
import type { BrushSettings, DirtyRect, RgbaColor } from "@/editor/renderer";
import { RasterSurface } from "@/editor/renderer/RasterSurface";
import type { ColorSampleSource, ColorSlot, ToolContext } from "@/editor/tools";
import type { Point } from "@/editor/viewport";

interface ActiveRasterStroke {
  surface: RasterSurface;
  label: string;
  layerId: string;
  lockTransparency: boolean;
  originalPixels: Map<number, number>;
  dirtyRect: DirtyRect | null;
  changed: boolean;
}

interface LayerState {
  document: EditorDocument;
  surfaces: Map<string, RasterSurface>;
}

interface RasterPatch {
  rect: DirtyRect;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
}

export interface LayerThumbnail {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

interface CachedLayerThumbnail extends LayerThumbnail {
  revision: number;
}

function createLayerId(): string {
  return globalThis.crypto.randomUUID();
}

function packPixel(pixels: Uint8ClampedArray, offset: number): number {
  return (
    pixels[offset] |
    (pixels[offset + 1] << 8) |
    (pixels[offset + 2] << 16) |
    (pixels[offset + 3] << 24)
  );
}

function unpackPixel(pixels: Uint8ClampedArray, offset: number, packed: number): void {
  pixels[offset] = packed & 0xff;
  pixels[offset + 1] = (packed >>> 8) & 0xff;
  pixels[offset + 2] = (packed >>> 16) & 0xff;
  pixels[offset + 3] = (packed >>> 24) & 0xff;
}

const DEFAULT_COLORS = {
  primary: { red: 17, green: 24, blue: 39, alpha: 255 },
  secondary: { red: 255, green: 255, blue: 255, alpha: 255 },
};

const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  size: 16,
  hardness: 1,
  opacity: 1,
};
const DEFAULT_FILL_TOLERANCE = 0;

/** Owns mutable raster surfaces, composite cache, and the active editor command. */
export class EditorSession implements ToolContext {
  private currentDocument: EditorDocument;
  private readonly surfaces = new Map<string, RasterSurface>();
  private readonly history: CommandHistory;
  private activeStroke: ActiveRasterStroke | null = null;
  private compositeCache: Uint8ClampedArray | null = null;
  private compositeDirtyRect: DirtyRect | null = null;
  private readonly layerSurfaceRevisions = new Map<string, number>();
  private readonly layerThumbnails = new Map<string, CachedLayerThumbnail>();
  private currentColors = { ...DEFAULT_COLORS };
  private currentBrushSettings = { ...DEFAULT_BRUSH_SETTINGS };
  private fillTolerance = DEFAULT_FILL_TOLERANCE;
  private readonly recentSourceFiles: SourceFileMetadata[] = [];

  constructor(
    document: EditorDocument,
    private readonly idGenerator: () => string = createLayerId,
    historyBudgetBytes?: number,
  ) {
    this.currentDocument = document;
    this.history = new CommandHistory(historyBudgetBytes);

    for (const layer of document.layers) {
      this.surfaces.set(layer.id, new RasterSurface(document.width, document.height));
      this.layerSurfaceRevisions.set(layer.id, 0);
    }
  }

  get document(): EditorDocument {
    return this.currentDocument;
  }

  get historyInfo(): HistoryInfo {
    return this.history.info;
  }

  get recentFiles(): readonly SourceFileMetadata[] {
    return this.recentSourceFiles;
  }

  replaceDocument(document: EditorDocument, rgba: Uint8ClampedArray): void {
    const expectedLength = document.width * document.height * 4;
    if (rgba.length !== expectedLength) {
      throw new RangeError("Imported RGBA buffer does not match the document dimensions.");
    }

    this.activeStroke = null;
    this.surfaces.clear();
    this.layerSurfaceRevisions.clear();
    this.layerThumbnails.clear();
    this.currentDocument = document;
    this.surfaces.set(
      document.activeLayerId,
      new RasterSurface(document.width, document.height, new Uint8ClampedArray(rgba)),
    );
    this.layerSurfaceRevisions.set(document.activeLayerId, 0);
    this.history.clear();
    this.rememberSourceFile(document.sourceFile);
    this.invalidateComposite();
  }

  markSaved(sourceFile: SourceFileMetadata | null = this.currentDocument.sourceFile): void {
    this.currentDocument = markDocumentSaved(setSourceFile(this.currentDocument, sourceFile));
    this.rememberSourceFile(sourceFile);
  }

  get colors(): Readonly<typeof DEFAULT_COLORS> {
    return this.currentColors;
  }

  getColor(slot: ColorSlot): RgbaColor {
    return this.currentColors[slot];
  }

  setColor(slot: ColorSlot, color: RgbaColor): void {
    this.currentColors = {
      ...this.currentColors,
      [slot]: { ...color },
    };
  }

  swapColors(): void {
    this.currentColors = {
      primary: this.currentColors.secondary,
      secondary: this.currentColors.primary,
    };
  }

  resetColors(): void {
    this.currentColors = {
      primary: { ...DEFAULT_COLORS.primary },
      secondary: { ...DEFAULT_COLORS.secondary },
    };
  }

  getBrushSettings(): BrushSettings {
    return { ...this.currentBrushSettings };
  }

  getFillTolerance(): number {
    return this.fillTolerance;
  }

  setFillTolerance(tolerance: number): void {
    if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) {
      throw new RangeError(`Fill tolerance must be between 0 and 255. Received: ${tolerance}.`);
    }

    this.fillTolerance = Math.round(tolerance);
  }

  sampleColor(point: Point, source: ColorSampleSource): RgbaColor | null {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (x < 0 || y < 0 || x >= this.currentDocument.width || y >= this.currentDocument.height) {
      return null;
    }

    const pixels =
      source === "composite" ? this.getCompositePixels() : this.getActiveSurface().data;
    const offset = (y * this.currentDocument.width + x) * 4;
    return {
      red: pixels[offset],
      green: pixels[offset + 1],
      blue: pixels[offset + 2],
      alpha: pixels[offset + 3],
    };
  }

  setBrushSettings(settings: BrushSettings): void {
    if (
      !Number.isFinite(settings.size) ||
      settings.size < 1 ||
      !Number.isFinite(settings.hardness) ||
      settings.hardness < 0 ||
      settings.hardness > 1 ||
      !Number.isFinite(settings.opacity) ||
      settings.opacity < 0 ||
      settings.opacity > 1
    ) {
      throw new RangeError("Brush settings are invalid.");
    }

    this.currentBrushSettings = { ...settings };
  }

  createLayer(name = `Layer ${this.currentDocument.layers.length + 1}`): Layer {
    const before = this.captureLayerState();
    const id = this.idGenerator();
    if (id.trim().length === 0 || this.surfaces.has(id)) {
      throw new Error("Layer ID generator returned an invalid or duplicate ID.");
    }

    const layer: Layer = {
      id,
      kind: "raster",
      name: name.trim() || `Layer ${this.currentDocument.layers.length + 1}`,
      visible: true,
      opacity: 1,
      locked: false,
      lockTransparency: false,
      offset: { x: 0, y: 0 },
    };

    this.surfaces.set(
      id,
      new RasterSurface(this.currentDocument.width, this.currentDocument.height),
    );
    this.layerSurfaceRevisions.set(id, 0);
    this.applyLayerDocument({
      ...this.currentDocument,
      layers: [...this.currentDocument.layers, layer],
      activeLayerId: id,
    });
    this.pushLayerCommand("Add layer", before);
    return layer;
  }

  duplicateLayer(id: string): Layer | null {
    const sourceIndex = this.findLayerIndex(id);
    if (sourceIndex === -1) {
      return null;
    }

    const sourceLayer = this.currentDocument.layers[sourceIndex];
    const duplicateId = this.idGenerator();
    if (duplicateId.trim().length === 0 || this.surfaces.has(duplicateId)) {
      throw new Error("Layer ID generator returned an invalid or duplicate ID.");
    }

    const before = this.captureLayerState(true);
    const duplicate: Layer = {
      ...sourceLayer,
      id: duplicateId,
      name: `Copy of ${sourceLayer.name}`,
      offset: { ...sourceLayer.offset },
    };
    this.surfaces.set(
      duplicateId,
      new RasterSurface(
        this.currentDocument.width,
        this.currentDocument.height,
        this.getLayerSurface(id).clonePixels(),
      ),
    );
    this.layerSurfaceRevisions.set(duplicateId, 0);
    const layers = [...this.currentDocument.layers];
    layers.splice(sourceIndex + 1, 0, duplicate);
    this.applyLayerDocument({ ...this.currentDocument, layers, activeLayerId: duplicateId });
    this.pushLayerCommand("Duplicate layer", before, true);
    return duplicate;
  }

  deleteLayer(id: string): boolean {
    if (this.currentDocument.layers.length === 1) {
      return false;
    }

    const index = this.findLayerIndex(id);
    if (index === -1) {
      return false;
    }

    const before = this.captureLayerState();
    const layers = this.currentDocument.layers.filter((layer) => layer.id !== id);
    const activeLayerId =
      id === this.currentDocument.activeLayerId
        ? layers[Math.max(0, index - 1)].id
        : this.currentDocument.activeLayerId;

    this.surfaces.delete(id);
    this.layerSurfaceRevisions.delete(id);
    this.deleteLayerThumbnails(id);
    this.applyLayerDocument({
      ...this.currentDocument,
      layers,
      activeLayerId,
    });
    this.pushLayerCommand("Delete layer", before);
    return true;
  }

  setActiveLayer(id: string): boolean {
    if (this.currentDocument.activeLayerId === id || this.findLayerIndex(id) === -1) {
      return false;
    }

    this.currentDocument = {
      ...this.currentDocument,
      activeLayerId: id,
    };
    return true;
  }

  renameLayer(id: string, name: string): boolean {
    const nextName = name.trim();
    if (nextName.length === 0) {
      return false;
    }

    return this.updateLayer("Rename layer", id, (layer) => ({ ...layer, name: nextName }));
  }

  setLayerVisibility(id: string, visible: boolean): boolean {
    return this.updateLayer("Toggle layer visibility", id, (layer) => ({ ...layer, visible }));
  }

  setLayerLocked(id: string, locked: boolean): boolean {
    return this.updateLayer("Toggle layer lock", id, (layer) => ({ ...layer, locked }));
  }

  setLayerTransparencyLocked(id: string, lockTransparency: boolean): boolean {
    return this.updateLayer("Toggle transparency lock", id, (layer) => ({
      ...layer,
      lockTransparency,
    }));
  }

  setLayerOpacity(id: string, opacity: number): boolean {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new RangeError(`Layer opacity must be between 0 and 1. Received: ${opacity}.`);
    }

    return this.updateLayer("Change layer opacity", id, (layer) => ({ ...layer, opacity }));
  }

  moveLayer(id: string, destinationIndex: number): boolean {
    const sourceIndex = this.findLayerIndex(id);
    if (
      sourceIndex === -1 ||
      destinationIndex < 0 ||
      destinationIndex >= this.currentDocument.layers.length ||
      sourceIndex === destinationIndex
    ) {
      return false;
    }

    const before = this.captureLayerState();
    const layers = [...this.currentDocument.layers];
    const [layer] = layers.splice(sourceIndex, 1);
    layers.splice(destinationIndex, 0, layer);
    this.applyLayerDocument({
      ...this.currentDocument,
      layers,
    });
    this.pushLayerCommand("Reorder layers", before);
    return true;
  }

  mergeDown(id = this.currentDocument.activeLayerId): boolean {
    const sourceIndex = this.findLayerIndex(id);
    if (sourceIndex <= 0) {
      return false;
    }

    const lowerLayer = this.currentDocument.layers[sourceIndex - 1];
    const activeLayer = this.currentDocument.layers[sourceIndex];
    const before = this.captureLayerState(true);
    const pixels = compositeDocumentLayers(
      { ...this.currentDocument, layers: [lowerLayer, activeLayer] },
      (layerId) => this.getLayerSurface(layerId),
    );
    this.surfaces.set(
      lowerLayer.id,
      new RasterSurface(this.currentDocument.width, this.currentDocument.height, pixels),
    );
    this.markLayerPixelsChanged(lowerLayer.id);
    this.surfaces.delete(activeLayer.id);
    this.layerSurfaceRevisions.delete(activeLayer.id);
    this.deleteLayerThumbnails(activeLayer.id);
    const layers = this.currentDocument.layers
      .filter((layer) => layer.id !== activeLayer.id)
      .map((layer) =>
        layer.id === lowerLayer.id
          ? {
              ...layer,
              visible: lowerLayer.visible || activeLayer.visible,
              opacity: 1,
              offset: { x: 0, y: 0 },
            }
          : layer,
      );
    this.applyLayerDocument({ ...this.currentDocument, layers, activeLayerId: lowerLayer.id });
    this.pushLayerCommand("Merge down", before, true);
    return true;
  }

  mergeVisible(): boolean {
    const visibleLayers = this.currentDocument.layers.filter((layer) => layer.visible);
    if (visibleLayers.length < 2) {
      return false;
    }

    const before = this.captureLayerState(true);
    const id = this.idGenerator();
    if (id.trim().length === 0 || this.surfaces.has(id)) {
      throw new Error("Layer ID generator returned an invalid or duplicate ID.");
    }
    const pixels = this.getCompositePixels().slice();
    const mergedLayer: Layer = {
      id,
      kind: "raster",
      name: "Merged visible",
      visible: true,
      opacity: 1,
      locked: false,
      lockTransparency: false,
      offset: { x: 0, y: 0 },
    };
    const insertionIndex = Math.max(...visibleLayers.map((layer) => this.findLayerIndex(layer.id)));
    const visibleIds = new Set(visibleLayers.map((layer) => layer.id));
    const layers = this.currentDocument.layers.filter((layer) => !visibleIds.has(layer.id));
    layers.splice(
      insertionIndex -
        visibleLayers.filter((layer) => this.findLayerIndex(layer.id) < insertionIndex).length,
      0,
      mergedLayer,
    );
    for (const layer of visibleLayers) {
      this.surfaces.delete(layer.id);
      this.layerSurfaceRevisions.delete(layer.id);
      this.deleteLayerThumbnails(layer.id);
    }
    this.surfaces.set(
      id,
      new RasterSurface(this.currentDocument.width, this.currentDocument.height, pixels),
    );
    this.layerSurfaceRevisions.set(id, 0);
    this.applyLayerDocument({ ...this.currentDocument, layers, activeLayerId: id });
    this.pushLayerCommand("Merge visible", before, true);
    return true;
  }

  flatten(): boolean {
    if (this.currentDocument.layers.length === 1) {
      return false;
    }

    const before = this.captureLayerState(true);
    const id = this.idGenerator();
    if (id.trim().length === 0 || this.surfaces.has(id)) {
      throw new Error("Layer ID generator returned an invalid or duplicate ID.");
    }
    const flattenedLayer: Layer = {
      id,
      kind: "raster",
      name: "Flattened",
      visible: true,
      opacity: 1,
      locked: false,
      lockTransparency: false,
      offset: { x: 0, y: 0 },
    };
    const pixels = this.getCompositePixels().slice();
    this.surfaces.clear();
    this.layerSurfaceRevisions.clear();
    this.layerThumbnails.clear();
    this.surfaces.set(
      id,
      new RasterSurface(this.currentDocument.width, this.currentDocument.height, pixels),
    );
    this.layerSurfaceRevisions.set(id, 0);
    this.applyLayerDocument({
      ...this.currentDocument,
      layers: [flattenedLayer],
      activeLayerId: id,
    });
    this.pushLayerCommand("Flatten image", before, true);
    return true;
  }

  getCompositePixels(): Uint8ClampedArray {
    if (!this.compositeCache) {
      this.compositeCache = compositeDocumentLayers(this.currentDocument, (layerId) =>
        this.getLayerSurface(layerId),
      );
      this.compositeDirtyRect = null;
    } else if (this.compositeDirtyRect) {
      const dirtyRect = this.compositeDirtyRect;
      const pixels = compositeDocumentRegion(
        this.currentDocument,
        (layerId) => this.getLayerSurface(layerId),
        dirtyRect,
      );
      for (let row = 0; row < dirtyRect.height; row += 1) {
        const sourceOffset = row * dirtyRect.width * 4;
        const destinationOffset =
          ((dirtyRect.y + row) * this.currentDocument.width + dirtyRect.x) * 4;
        this.compositeCache.set(
          pixels.subarray(sourceOffset, sourceOffset + dirtyRect.width * 4),
          destinationOffset,
        );
      }
      this.compositeDirtyRect = null;
    }

    return this.compositeCache;
  }

  getLayerSurface(id: string): RasterSurface {
    const surface = this.surfaces.get(id);
    if (!surface) {
      throw new Error(`Layer ${id} does not have a raster surface.`);
    }

    return surface;
  }

  getActiveSurface(): RasterSurface {
    return this.getLayerSurface(this.currentDocument.activeLayerId);
  }

  getLayerThumbnail(id: string, maxSize = 48): LayerThumbnail {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new RangeError(`Thumbnail size must be a positive integer. Received: ${maxSize}.`);
    }

    const surface = this.getLayerSurface(id);
    const revision = this.layerSurfaceRevisions.get(id) ?? 0;
    const cacheKey = `${id}:${maxSize}`;
    const cached = this.layerThumbnails.get(cacheKey);
    if (cached?.revision === revision) {
      return cached;
    }

    const scale = Math.min(maxSize / surface.width, maxSize / surface.height, 1);
    const width = Math.max(1, Math.round(surface.width * scale));
    const height = Math.max(1, Math.round(surface.height * scale));
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(surface.height - 1, Math.floor((y / height) * surface.height));
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(surface.width - 1, Math.floor((x / width) * surface.width));
        const sourceOffset = (sourceY * surface.width + sourceX) * 4;
        const destinationOffset = (y * width + x) * 4;
        pixels.set(surface.data.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
      }
    }

    const thumbnail = { width, height, pixels, revision };
    this.layerThumbnails.set(cacheKey, thumbnail);
    return thumbnail;
  }

  beginRasterStroke(label: string): void {
    if (this.activeStroke) {
      throw new Error("A raster stroke is already active.");
    }

    const layer = this.currentDocument.layers.find(
      (candidate) => candidate.id === this.currentDocument.activeLayerId,
    );
    if (!layer || !layer.visible || layer.locked) {
      return;
    }

    this.activeStroke = {
      surface: this.getActiveSurface(),
      label,
      layerId: layer.id,
      lockTransparency: layer.lockTransparency,
      originalPixels: new Map(),
      dirtyRect: null,
      changed: false,
    };
  }

  drawRasterLine(from: Point, to: Point, color: RgbaColor): boolean {
    return this.applyToActiveStroke(dirtyRectFromPoints(from, to), (surface) =>
      surface.drawLine(from, to, color),
    );
  }

  drawRasterBrushLine(from: Point, to: Point, color: RgbaColor, settings: BrushSettings): boolean {
    return this.applyToActiveStroke(
      dirtyRectFromPoints(from, to, settings.size / 2 + 1),
      (surface) => surface.drawBrushLine(from, to, color, settings),
    );
  }

  eraseRasterBrushLine(from: Point, to: Point, settings: BrushSettings): boolean {
    return this.applyToActiveStroke(
      dirtyRectFromPoints(from, to, settings.size / 2 + 1),
      (surface) => surface.eraseBrushLine(from, to, settings),
    );
  }

  floodFill(point: Point, color: RgbaColor, tolerance: number): boolean {
    if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) {
      throw new RangeError(`Fill tolerance must be between 0 and 255. Received: ${tolerance}.`);
    }

    return this.applyToActiveStroke(
      { x: 0, y: 0, width: this.currentDocument.width, height: this.currentDocument.height },
      (surface) => surface.floodFill(point, color, tolerance),
    );
  }

  finishRasterStroke(): boolean {
    if (!this.activeStroke) {
      return false;
    }

    const stroke = this.activeStroke;
    this.activeStroke = null;

    if (!stroke.changed || !stroke.dirtyRect || !this.hasStrokeChanges(stroke)) {
      return false;
    }

    const patch = this.createPatch(stroke);
    this.history.push(
      new RasterPatchCommand(stroke.label, stroke.surface, patch.rect, patch.before, patch.after),
    );
    this.markLayerPixelsChanged(stroke.layerId);
    this.currentDocument = markDocumentDirty(this.currentDocument);
    return true;
  }

  cancelRasterStroke(): void {
    if (!this.activeStroke) {
      return;
    }

    const stroke = this.activeStroke;
    this.activeStroke = null;
    if (stroke.changed) {
      this.restoreOriginalPixels(stroke);
      this.invalidateComposite();
    }
  }

  undo(): boolean {
    const undone = this.history.undo();
    if (undone) {
      this.currentDocument = markDocumentDirty(this.currentDocument);
      this.invalidateComposite();
    }

    return undone;
  }

  redo(): boolean {
    const redone = this.history.redo();
    if (redone) {
      this.currentDocument = markDocumentDirty(this.currentDocument);
      this.invalidateComposite();
    }

    return redone;
  }

  private applyToActiveStroke(
    dirtyRect: DirtyRect,
    operation: (surface: RasterSurface) => boolean,
  ): boolean {
    if (!this.activeStroke) {
      return false;
    }

    this.captureOriginalPixels(this.activeStroke, dirtyRect);
    const changed = operation(this.activeStroke.surface);
    if (this.activeStroke.lockTransparency) {
      this.restoreTransparentPixels(this.activeStroke);
    }
    this.activeStroke.changed = this.activeStroke.changed || changed;
    if (changed) {
      this.invalidateComposite(dirtyRect);
    }
    return changed;
  }

  private captureOriginalPixels(stroke: ActiveRasterStroke, dirtyRect: DirtyRect): void {
    const clipped = clampDirtyRect(dirtyRect, stroke.surface.width, stroke.surface.height);
    if (!clipped) {
      return;
    }

    for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
      for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
        const pixelIndex = y * stroke.surface.width + x;
        if (!stroke.originalPixels.has(pixelIndex)) {
          stroke.originalPixels.set(pixelIndex, packPixel(stroke.surface.data, pixelIndex * 4));
        }
      }
    }

    stroke.dirtyRect = unionDirtyRects(stroke.dirtyRect, clipped);
  }

  private hasStrokeChanges(stroke: ActiveRasterStroke): boolean {
    for (const [pixelIndex, packed] of stroke.originalPixels) {
      if (packPixel(stroke.surface.data, pixelIndex * 4) !== packed) {
        return true;
      }
    }
    return false;
  }

  private restoreOriginalPixels(stroke: ActiveRasterStroke): void {
    for (const [pixelIndex, packed] of stroke.originalPixels) {
      unpackPixel(stroke.surface.data, pixelIndex * 4, packed);
    }
  }

  private createPatch(stroke: ActiveRasterStroke): RasterPatch {
    let changedRect: DirtyRect | null = null;
    for (const [pixelIndex, packed] of stroke.originalPixels) {
      if (packPixel(stroke.surface.data, pixelIndex * 4) === packed) {
        continue;
      }

      const x = pixelIndex % stroke.surface.width;
      const y = Math.floor(pixelIndex / stroke.surface.width);
      changedRect = unionDirtyRects(changedRect, { x, y, width: 1, height: 1 });
    }

    if (!changedRect) {
      throw new Error("Cannot create a raster patch without changed pixels.");
    }

    const after = stroke.surface.copyRect(changedRect);
    const before = new Uint8ClampedArray(after);
    for (const [pixelIndex, packed] of stroke.originalPixels) {
      const x = pixelIndex % stroke.surface.width;
      const y = Math.floor(pixelIndex / stroke.surface.width);
      if (
        x < changedRect.x ||
        y < changedRect.y ||
        x >= changedRect.x + changedRect.width ||
        y >= changedRect.y + changedRect.height
      ) {
        continue;
      }

      const localOffset = ((y - changedRect.y) * changedRect.width + x - changedRect.x) * 4;
      unpackPixel(before, localOffset, packed);
    }

    return { rect: changedRect, before, after };
  }

  private restoreTransparentPixels(stroke: ActiveRasterStroke): void {
    for (const [pixelIndex, packed] of stroke.originalPixels) {
      if (((packed >>> 24) & 0xff) === 0) {
        unpackPixel(stroke.surface.data, pixelIndex * 4, packed);
      }
    }
  }

  private markLayerPixelsChanged(id: string): void {
    this.layerSurfaceRevisions.set(id, (this.layerSurfaceRevisions.get(id) ?? 0) + 1);
    this.deleteLayerThumbnails(id);
  }

  private deleteLayerThumbnails(id: string): void {
    for (const key of this.layerThumbnails.keys()) {
      if (key.startsWith(`${id}:`)) {
        this.layerThumbnails.delete(key);
      }
    }
  }

  private invalidateComposite(dirtyRect?: DirtyRect): void {
    if (!this.compositeCache || !dirtyRect) {
      this.compositeCache = null;
      this.compositeDirtyRect = null;
      return;
    }

    const clipped = clampDirtyRect(
      dirtyRect,
      this.currentDocument.width,
      this.currentDocument.height,
    );
    if (clipped) {
      this.compositeDirtyRect = unionDirtyRects(this.compositeDirtyRect, clipped);
    }
  }

  private rememberSourceFile(sourceFile: SourceFileMetadata | null): void {
    if (!sourceFile) {
      return;
    }

    const withoutCurrent = this.recentSourceFiles.filter((file) => file.path !== sourceFile.path);
    this.recentSourceFiles.splice(
      0,
      this.recentSourceFiles.length,
      sourceFile,
      ...withoutCurrent.slice(0, 9),
    );
  }

  private findLayerIndex(id: string): number {
    return this.currentDocument.layers.findIndex((layer) => layer.id === id);
  }

  private updateLayer(label: string, id: string, update: (layer: Layer) => Layer): boolean {
    let didChange = false;
    const layers = this.currentDocument.layers.map((layer) => {
      if (layer.id !== id) {
        return layer;
      }

      const nextLayer = update(layer);
      didChange = JSON.stringify(nextLayer) !== JSON.stringify(layer);
      return nextLayer;
    });

    if (!didChange) {
      return false;
    }

    const before = this.captureLayerState();
    this.applyLayerDocument({
      ...this.currentDocument,
      layers,
    });
    this.pushLayerCommand(label, before);
    return true;
  }

  private captureLayerState(copyPixels = false): LayerState {
    return {
      document: this.currentDocument,
      surfaces: new Map(
        [...this.surfaces].map(([id, surface]) => [
          id,
          copyPixels
            ? new RasterSurface(surface.width, surface.height, surface.clonePixels())
            : surface,
        ]),
      ),
    };
  }

  private restoreLayerState(state: LayerState): void {
    this.currentDocument = state.document;
    this.surfaces.clear();
    this.layerSurfaceRevisions.clear();
    this.layerThumbnails.clear();
    for (const [id, surface] of state.surfaces) {
      this.surfaces.set(id, surface);
      this.layerSurfaceRevisions.set(id, 0);
    }
    this.invalidateComposite();
  }

  private applyLayerDocument(document: EditorDocument): void {
    this.cancelRasterStroke();
    this.currentDocument = markDocumentDirty(document);
    this.invalidateComposite();
  }

  private pushLayerCommand(label: string, before: LayerState, copyPixels = false): void {
    const after = this.captureLayerState(copyPixels);
    this.history.push(
      new CallbackCommand(
        label,
        0,
        () => this.restoreLayerState(before),
        () => this.restoreLayerState(after),
      ),
    );
  }
}
