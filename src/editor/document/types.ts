import type { Layer } from "@/editor/layers/types";
import type { Selection } from "@/editor/selection/types";

export type Background = TransparentBackground | ColorBackground;

export interface TransparentBackground {
  kind: "transparent";
}

export interface ColorBackground {
  kind: "color";
  /** CSS color used when the document is flattened or exported without alpha. */
  color: string;
}

export interface SourceFileMetadata {
  path: string;
  mimeType: string;
  openedAt: string;
}

/**
 * A serializable editor document. It contains document state only; viewport,
 * pointer interaction, and pixel buffers belong to their respective modules.
 */
export interface EditorDocument {
  id: string;
  name: string;
  width: number;
  height: number;
  background: Background;
  layers: Layer[];
  activeLayerId: string;
  selection: Selection | null;
  dirty: boolean;
  sourceFile: SourceFileMetadata | null;
}

export interface CreateEditorDocumentOptions {
  width: number;
  height: number;
  name?: string;
  background?: Background;
  idGenerator?: () => string;
}
