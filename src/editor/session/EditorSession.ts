import { markDocumentDirty, markDocumentSaved } from "@/editor/document";
import { RasterSnapshotCommand } from "@/editor/history/RasterSnapshotCommand";
import { SingleStepHistory } from "@/editor/history/SingleStepHistory";
import type { EditorDocument } from "@/editor/document";
import { RasterSurface } from "@/editor/renderer/RasterSurface";
import type { RgbaColor } from "@/editor/renderer/RasterSurface";
import type { ToolContext } from "@/editor/tools";
import type { Point } from "@/editor/viewport";

interface ActiveRasterStroke {
  surface: RasterSurface;
  before: Uint8ClampedArray;
  changed: boolean;
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

  constructor(document: EditorDocument) {
    this.currentDocument = document;

    for (const layer of document.layers) {
      if (layer.kind === "raster") {
        this.surfaces.set(layer.id, new RasterSurface(document.width, document.height));
      }
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

  getActiveSurface(): RasterSurface {
    const surface = this.surfaces.get(this.currentDocument.activeLayerId);
    if (!surface) {
      throw new Error("The active layer does not have a raster surface.");
    }

    return surface;
  }

  beginRasterStroke(): void {
    if (this.activeStroke) {
      throw new Error("A raster stroke is already active.");
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
}
