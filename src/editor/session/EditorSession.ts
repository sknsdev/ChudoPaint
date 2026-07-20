import { markDocumentDirty, markDocumentSaved } from "@/editor/document";
import { RasterSnapshotCommand } from "@/editor/history/RasterSnapshotCommand";
import { SingleStepHistory } from "@/editor/history/SingleStepHistory";
import type { EditorDocument } from "@/editor/document";
import type { Layer } from "@/editor/layers/types";
import { compositeDocumentLayers } from "@/editor/renderer/composite";
import { RasterSurface } from "@/editor/renderer/RasterSurface";
import type { RgbaColor } from "@/editor/renderer/RasterSurface";
import type { ToolContext } from "@/editor/tools";
import type { Point } from "@/editor/viewport";

interface ActiveRasterStroke {
  surface: RasterSurface;
  before: Uint8ClampedArray;
  changed: boolean;
}

function createLayerId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Owns mutable pixel surfaces outside React state and coordinates the MVP
 * one-stroke undo history.
 */
export class EditorSession implements ToolContext {
  private currentDocument: EditorDocument;
  private readonly surfaces = new Map<string, RasterSurface>();
  private readonly history = new SingleStepHistory();
  private activeStroke: ActiveRasterStroke | null = null;

  constructor(
    document: EditorDocument,
    private readonly idGenerator: () => string = createLayerId,
  ) {
    this.currentDocument = document;

    for (const layer of document.layers) {
      this.surfaces.set(layer.id, new RasterSurface(document.width, document.height));
    }
  }

  get document(): EditorDocument {
    return this.currentDocument;
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
  }

  markSaved(): void {
    this.currentDocument = markDocumentSaved(this.currentDocument);
  }

  createLayer(name = `Layer ${this.currentDocument.layers.length + 1}`): Layer {
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
    this.replaceDocumentMetadata({
      ...this.currentDocument,
      layers: [...this.currentDocument.layers, layer],
      activeLayerId: id,
    });
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

    const layers = this.currentDocument.layers.filter((layer) => layer.id !== id);
    const activeLayerId =
      id === this.currentDocument.activeLayerId
        ? layers[Math.max(0, index - 1)].id
        : this.currentDocument.activeLayerId;

    this.surfaces.delete(id);
    this.replaceDocumentMetadata({
      ...this.currentDocument,
      layers,
      activeLayerId,
    });
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

    return this.updateLayer(id, (layer) => ({ ...layer, name: nextName }));
  }

  setLayerVisibility(id: string, visible: boolean): boolean {
    return this.updateLayer(id, (layer) => ({ ...layer, visible }));
  }

  setLayerOpacity(id: string, opacity: number): boolean {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new RangeError(`Layer opacity must be between 0 and 1. Received: ${opacity}.`);
    }

    return this.updateLayer(id, (layer) => ({ ...layer, opacity }));
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

    const layers = [...this.currentDocument.layers];
    const [layer] = layers.splice(sourceIndex, 1);
    layers.splice(destinationIndex, 0, layer);
    this.replaceDocumentMetadata({
      ...this.currentDocument,
      layers,
    });
    return true;
  }

  getCompositePixels(): Uint8ClampedArray {
    return compositeDocumentLayers(this.currentDocument, (layerId) =>
      this.getLayerSurface(layerId),
    );
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

  beginRasterStroke(): void {
    if (this.activeStroke) {
      throw new Error("A raster stroke is already active.");
    }

    const layer = this.currentDocument.layers.find(
      (candidate) => candidate.id === this.currentDocument.activeLayerId,
    );
    if (!layer || !layer.visible || layer.locked) {
      return;
    }

    const surface = this.getActiveSurface();
    this.activeStroke = {
      surface,
      before: surface.clonePixels(),
      changed: false,
    };
  }

  drawRasterLine(from: Point, to: Point, color: RgbaColor): boolean {
    if (!this.activeStroke) {
      return false;
    }

    const changed = this.activeStroke.surface.drawLine(from, to, color);
    this.activeStroke.changed = this.activeStroke.changed || changed;
    return changed;
  }

  finishRasterStroke(): boolean {
    if (!this.activeStroke) {
      return false;
    }

    const stroke = this.activeStroke;
    this.activeStroke = null;

    if (!stroke.changed) {
      return false;
    }

    this.history.push(new RasterSnapshotCommand(stroke.surface, stroke.before));
    this.currentDocument = markDocumentDirty(this.currentDocument);
    return true;
  }

  cancelRasterStroke(): void {
    if (!this.activeStroke) {
      return;
    }

    this.activeStroke.surface.restorePixels(this.activeStroke.before);
    this.activeStroke = null;
  }

  undo(): boolean {
    const undone = this.history.undo();
    if (undone) {
      this.currentDocument = markDocumentDirty(this.currentDocument);
    }

    return undone;
  }

  private findLayerIndex(id: string): number {
    return this.currentDocument.layers.findIndex((layer) => layer.id === id);
  }

  private updateLayer(id: string, update: (layer: Layer) => Layer): boolean {
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

    this.replaceDocumentMetadata({
      ...this.currentDocument,
      layers,
    });
    return true;
  }

  private replaceDocumentMetadata(document: EditorDocument): void {
    this.cancelRasterStroke();
    this.currentDocument = markDocumentDirty(document);
    this.history.clear();
  }
}
