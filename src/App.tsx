import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppMenu } from "@/components/AppMenu";
import { EditorCanvas } from "@/editor/canvas";
import type { EditorCanvasHandle } from "@/editor/canvas";
import { createEditorDocument, setSourceFile } from "@/editor/document";
import { formatAppError } from "@/editor/errors";
import {
  checkPngSourceFile,
  choosePngSavePath,
  choosePngToOpen,
  decodePng,
  documentNameFromPath,
  encodePng,
} from "@/editor/files/png";
import { LayersPanel } from "@/editor/layers/LayersPanel";
import { EditorSession } from "@/editor/session";
import { BrushTool, EraserTool, FillTool, PencilTool } from "@/editor/tools";
import { ToolsPanel } from "@/editor/tools/ToolsPanel";
import type { ToolId } from "@/editor/tools/ToolsPanel";

const initialDocument = createEditorDocument({
  width: 800,
  height: 600,
});
const editorSession = new EditorSession(initialDocument);
const tools = {
  pencil: new PencilTool(),
  brush: new BrushTool(),
  eraser: new EraserTool(),
  fill: new FillTool(),
};

function App() {
  const canvasRef = useRef<EditorCanvasHandle>(null);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [isFileOperationPending, setIsFileOperationPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeToolId, setActiveToolId] = useState<ToolId>("pencil");
  const [, setToolSettingsVersion] = useState(0);
  const document = editorSession.document;
  const historyInfo = editorSession.historyInfo;

  const refreshDocument = useCallback((): void => {
    setDocumentVersion((version) => version + 1);
  }, []);

  const openPngFromPath = useCallback(
    async (path: string): Promise<void> => {
      setStatusMessage(null);
      setIsFileOperationPending(true);

      try {
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
        refreshDocument();
        setStatusMessage(`Opened ${importedDocument.name}.png`);
      } catch (error) {
        setStatusMessage(`Could not open PNG: ${formatAppError(error)}`);
      } finally {
        setIsFileOperationPending(false);
      }
    },
    [refreshDocument],
  );

  const openPng = useCallback(async (): Promise<void> => {
    const path = await choosePngToOpen();
    if (path) {
      await openPngFromPath(path);
    }
  }, [openPngFromPath]);

  const writePng = useCallback(
    async (path: string, adoptAsSource: boolean): Promise<void> => {
      const currentDocument = editorSession.document;
      const savedPath = await encodePng(
        path,
        currentDocument.width,
        currentDocument.height,
        editorSession.getCompositePixels(),
      );

      if (adoptAsSource) {
        editorSession.markSaved({
          path: savedPath,
          mimeType: "image/png",
          openedAt: currentDocument.sourceFile?.openedAt ?? new Date().toISOString(),
        });
        refreshDocument();
      }

      setStatusMessage(`${adoptAsSource ? "Saved" : "Exported"} ${savedPath}`);
    },
    [refreshDocument],
  );

  const saveAs = useCallback(async (): Promise<void> => {
    setStatusMessage(null);
    setIsFileOperationPending(true);

    try {
      const path = await choosePngSavePath(`${editorSession.document.name}.png`);
      if (path) {
        await writePng(path, true);
      }
    } catch (error) {
      setStatusMessage(`Could not save PNG: ${formatAppError(error)}`);
    } finally {
      setIsFileOperationPending(false);
    }
  }, [writePng]);

  const save = useCallback(async (): Promise<void> => {
    const sourceFile = editorSession.document.sourceFile;
    if (!sourceFile) {
      await saveAs();
      return;
    }

    setStatusMessage(null);
    setIsFileOperationPending(true);
    try {
      const sourceIsAvailable = await checkPngSourceFile(sourceFile.path);
      if (!sourceIsAvailable) {
        setStatusMessage(
          "The source file is no longer available. Choose a new location with Save As.",
        );
        return;
      }

      await writePng(sourceFile.path, true);
    } catch (error) {
      setStatusMessage(`Could not save PNG: ${formatAppError(error)}`);
    } finally {
      setIsFileOperationPending(false);
    }
  }, [saveAs, writePng]);

  const exportPng = useCallback(async (): Promise<void> => {
    setStatusMessage(null);
    setIsFileOperationPending(true);

    try {
      const path = await choosePngSavePath(`${editorSession.document.name}.png`);
      if (path) {
        await writePng(path, false);
      }
    } catch (error) {
      setStatusMessage(`Could not export PNG: ${formatAppError(error)}`);
    } finally {
      setIsFileOperationPending(false);
    }
  }, [writePng]);

  const undo = useCallback((): void => {
    if (editorSession.undo()) {
      refreshDocument();
    }
  }, [refreshDocument]);

  const redo = useCallback((): void => {
    if (editorSession.redo()) {
      refreshDocument();
    }
  }, [refreshDocument]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) {
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void (event.shiftKey ? saveAs() : save());
      } else if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openPng();
      }
    };

    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [openPng, save, saveAs]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (editorSession.document.dirty && !globalThis.confirm("Discard unsaved changes?")) {
          event.preventDefault();
        }
      })
      .then((cleanup) => {
        unlisten = cleanup;
      });

    return () => unlisten?.();
  }, [document.dirty]);

  return (
    <main className="editor-shell">
      <header className="app-header">
        <div className="app-brand">
          <p className="eyebrow">Open-source raster editor</p>
          <h1>ChudoPaint</h1>
        </div>
        <AppMenu
          canRedo={historyInfo.redoCount > 0}
          canUndo={historyInfo.undoCount > 0}
          isFileOperationPending={isFileOperationPending}
          recentFiles={editorSession.recentFiles}
          onExport={() => void exportPng()}
          onFitToScreen={() => canvasRef.current?.fitToScreen()}
          onOpen={() => void openPng()}
          onOpenRecent={(path) => void openPngFromPath(path)}
          onRedo={redo}
          onResetZoom={() => canvasRef.current?.resetToActualSize()}
          onSave={() => void save()}
          onSaveAs={() => void saveAs()}
          onUndo={undo}
        />
        <p className="document-details">
          {document.name} · {document.width} × {document.height} px
          {document.dirty ? " · Unsaved" : ""}
        </p>
      </header>

      {statusMessage ? <p className="file-status">{statusMessage}</p> : null}
      <div className="editor-content">
        <EditorCanvas
          ref={canvasRef}
          documentVersion={documentVersion}
          onSessionChange={refreshDocument}
          session={editorSession}
          tool={tools[activeToolId]}
        />
        <aside className="editor-sidebar" aria-label="Editor controls">
          <ToolsPanel
            activeTool={activeToolId}
            session={editorSession}
            onActiveToolChange={setActiveToolId}
            onSettingsChange={() => setToolSettingsVersion((version) => version + 1)}
          />
          <LayersPanel
            document={document}
            session={editorSession}
            onDocumentChange={refreshDocument}
          />
        </aside>
      </div>
    </main>
  );
}

export default App;
