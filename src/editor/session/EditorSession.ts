import { markDocumentDirty, markDocumentSaved } from "@/editor/document";
import { CallbackCommand, CommandHistory, RasterPatchCommand } from "@/editor/history";
import type { HistoryInfo } from "@/editor/history";
import type { EditorDocument } from "@/editor/document";
import type { Layer } from "@/editor/layers/types";
import {
  clampDirtyRect,
  compositeDocumentLayers,
  dirtyRectFromPoints,
  unionDirtyRects,
} from "@/editor/renderer";
import type { BrushSettings, DirtyRect, RgbaColor } from "@/editor/renderer";
import { RasterSurface } from "@/editor/renderer/RasterSurface";
import type { ColorSlot, ToolContext } from "@/editor/tools";
import type { Point } from "@/editor/viewport";

interface ActiveRasterStroke {
  surface: RasterSurface;
  label: string;
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

/** Owns mutable raster surfaces, composite cache, and the active editor command. */
export class EditorSession implements ToolContext {
  private currentDocument: EditorDocument;
  private readonly surfaces = new Map<string, RasterSurface>();
  private readonly history: CommandHistory;
  private activeStroke: ActiveRasterStroke | null = null;
  private compositeCache: Uint8ClampedArray | null = null;
  private currentColors = { ...DEFAULT_COLORS };
  private currentBrushSettings = { ...DEFAULT_BRUSH_SETTINGS };

  constructor(
    document: EditorDocument,
    private readonly idGenerator: () => string = createLayerId,
    historyBudgetBytes?: number,
  ) {
    this.currentDocument = document;
    this.history = new CommandHistory(historyBudgetBytes);

    for (const layer of document.layers) {
      this.surfaces.set(layer.id, new RasterSurface(document.width, document.height));
    }
  }

  get document(): EditorDocument {
    return this.currentDocument;
  }

  get historyInfo(): HistoryInfo {
    return this.history.info;
  }

  replaceDocument(document: EditorDocument, rgba: Uint8ClampedArray): void {
    const expectedLength = document.width * document.height * 4;
    if (rgba.length !== expectedLength) {
      throw new RangeError("Imported RGBA buffer does not match the document dimensions.");
    }

    this.activeStroke = null;
    this.surfaces.clear();
    this.currentDocument = document;
    this.surfaces.set(
      document.activeLayerId,
      new RasterSurface(document.width, document.height, new Uint8ClampedArray(rgba)),
    );
    this.history.clear();
    this.invalidateComposite();
  }

  markSaved(): void {
    this.currentDocument = markDocumentSaved(this.currentDocument);
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
      offset: { x: 0, y: 0 },
    };

    this.surfaces.set(
      id,
      new RasterSurface(this.currentDocument.width, this.currentDocument.height),
    );
    this.applyLayerDocument({
      ...this.currentDocument,
      layers: [...this.currentDocument.layers, layer],
      activeLayerId: id,
    });
    this.pushLayerCommand("Add layer", before);
    return layer;
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

  getCompositePixels(): Uint8ClampedArray {
    if (!this.compositeCache) {
      this.compositeCache = compositeDocumentLayers(this.currentDocument, (layerId) =>
        this.getLayerSurface(layerId),
      );
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

    if (!stroke.changed || !stroke.dirtyRect) {
      return false;
    }

    const patch = this.createPatch(stroke);
    this.history.push(
      new RasterPatchCommand(stroke.label, stroke.surface, patch.rect, patch.before, patch.after),
    );
    this.currentDocument = markDocumentDirty(this.currentDocument);
    return true;
  }

  cancelRasterStroke(): void {
    if (!this.activeStroke) {
      return;
    }

    const stroke = this.activeStroke;
    this.activeStroke = null;
    if (stroke.changed && stroke.dirtyRect) {
      const patch = this.createPatch(stroke);
      stroke.surface.restoreRect(patch.rect, patch.before);
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
    this.activeStroke.changed = this.activeStroke.changed || changed;
    if (changed) {
      this.invalidateComposite();
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

  private invalidateComposite(): void {
    this.compositeCache = null;
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

  private captureLayerState(): LayerState {
    return {
      document: this.currentDocument,
      surfaces: new Map(this.surfaces),
    };
  }

  private restoreLayerState(state: LayerState): void {
    this.currentDocument = state.document;
    this.surfaces.clear();
    for (const [id, surface] of state.surfaces) {
      this.surfaces.set(id, surface);
    }
    this.invalidateComposite();
  }

  private applyLayerDocument(document: EditorDocument): void {
    this.cancelRasterStroke();
    this.currentDocument = markDocumentDirty(document);
    this.invalidateComposite();
  }

  private pushLayerCommand(label: string, before: LayerState): void {
    const after = this.captureLayerState();
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
