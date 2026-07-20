import type { RasterLayer } from "@/editor/layers/types";
import type {
  Background,
  CreateEditorDocumentOptions,
  EditorDocument,
  SourceFileMetadata,
} from "@/editor/document/types";

export const MAX_DOCUMENT_DIMENSION = 32_768;

const defaultBackground: Background = { kind: "transparent" };

function createId(): string {
  return globalThis.crypto.randomUUID();
}

function requirePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DOCUMENT_DIMENSION) {
    throw new RangeError(
      `${fieldName} must be an integer between 1 and ${MAX_DOCUMENT_DIMENSION}. Received: ${value}.`,
    );
  }
}

function requireId(id: string, entityName: string): string {
  if (id.trim().length === 0) {
    throw new Error(`${entityName} ID generator returned an empty ID.`);
  }

  return id;
}

export function createEditorDocument(options: CreateEditorDocumentOptions): EditorDocument {
  requirePositiveInteger(options.width, "Document width");
  requirePositiveInteger(options.height, "Document height");

  const idGenerator = options.idGenerator ?? createId;
  const documentId = requireId(idGenerator(), "Document");
  const firstLayer: RasterLayer = {
    id: requireId(idGenerator(), "Layer"),
    kind: "raster",
    name: "Layer 1",
    visible: true,
    opacity: 1,
    locked: false,
    offset: { x: 0, y: 0 },
  };

  return {
    id: documentId,
    name: options.name?.trim() || "Untitled",
    width: options.width,
    height: options.height,
    background: options.background ?? defaultBackground,
    layers: [firstLayer],
    activeLayerId: firstLayer.id,
    selection: null,
    dirty: false,
    sourceFile: null,
  };
}

export function setSourceFile(
  document: EditorDocument,
  sourceFile: SourceFileMetadata | null,
): EditorDocument {
  return {
    ...document,
    sourceFile,
  };
}

export function markDocumentSaved(document: EditorDocument): EditorDocument {
  return {
    ...document,
    dirty: false,
  };
}

export function markDocumentDirty(document: EditorDocument): EditorDocument {
  return {
    ...document,
    dirty: true,
  };
}
