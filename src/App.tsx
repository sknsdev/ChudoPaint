import { useState } from "react";
import { EditorCanvas } from "@/editor/canvas";
import { createEditorDocument, setSourceFile } from "@/editor/document";
import {
  choosePngSavePath,
  choosePngToOpen,
  decodePng,
  documentNameFromPath,
  encodePng,
} from "@/editor/files/png";
import { LayersPanel } from "@/editor/layers/LayersPanel";
import { EditorSession } from "@/editor/session";
import { PencilTool } from "@/editor/tools";

const initialDocument = createEditorDocument({
  width: 800,
  height: 600,
});
const editorSession = new EditorSession(initialDocument);
const pencilTool = new PencilTool();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [documentVersion, setDocumentVersion] = useState(0);
  const [isFileOperationPending, setIsFileOperationPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const document = editorSession.document;

  const openPng = async (): Promise<void> => {
    setStatusMessage(null);
    setIsFileOperationPending(true);

    try {
      const path = await choosePngToOpen();
      if (!path) {
        return;
      }

      const decoded = await decodePng(path);
      const importedDocument = setSourceFile(
        createEditorDocument({
          width: decoded.width,
          height: decoded.height,
          name: documentNameFromPath(path),
        }),
        {
          path,
          mimeType: "image/png",
          openedAt: new Date().toISOString(),
        },
      );

      editorSession.replaceDocument(importedDocument, new Uint8ClampedArray(decoded.rgba));
      setDocumentVersion((version) => version + 1);
      setStatusMessage(`Opened ${importedDocument.name}.png`);
    } catch (error) {
      setStatusMessage(`Could not open PNG: ${errorMessage(error)}`);
    } finally {
      setIsFileOperationPending(false);
    }
  };

  const savePng = async (): Promise<void> => {
    setStatusMessage(null);
    setIsFileOperationPending(true);

    try {
      const path = await choosePngSavePath(`${document.name}.png`);
      if (!path) {
        return;
      }

      const savedPath = await encodePng(
        path,
        document.width,
        document.height,
        editorSession.getCompositePixels(),
      );
      editorSession.markSaved();
      setDocumentVersion((version) => version + 1);
      setStatusMessage(`Saved ${savedPath}`);
    } catch (error) {
      setStatusMessage(`Could not save PNG: ${errorMessage(error)}`);
    } finally {
      setIsFileOperationPending(false);
    }
  };

  return (
    <main className="editor-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Open-source raster editor</p>
          <h1>ChudoPaint</h1>
        </div>
        <div className="app-actions">
          <button type="button" disabled={isFileOperationPending} onClick={openPng}>
            Open PNG
          </button>
          <button type="button" disabled={isFileOperationPending} onClick={savePng}>
            Save PNG
          </button>
          <p className="document-details">
            {document.name} · {document.width} × {document.height} px
            {document.dirty ? " · Unsaved" : ""}
          </p>
        </div>
      </header>

      {statusMessage ? <p className="file-status">{statusMessage}</p> : null}
      <div className="editor-content">
        <EditorCanvas documentVersion={documentVersion} session={editorSession} tool={pencilTool} />
        <LayersPanel
          document={document}
          session={editorSession}
          onDocumentChange={() => setDocumentVersion((version) => version + 1)}
        />
      </div>
    </main>
  );
}

export default App;
