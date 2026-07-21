import type { SourceFileMetadata } from "@/editor/document";

interface AppMenuProps {
  canRedo: boolean;
  canUndo: boolean;
  isFileOperationPending: boolean;
  recentFiles: readonly SourceFileMetadata[];
  onExport(): void;
  onFitToScreen(): void;
  onOpen(): void;
  onOpenRecent(path: string): void;
  onRedo(): void;
  onResetZoom(): void;
  onSave(): void;
  onSaveAs(): void;
  onUndo(): void;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function AppMenu({
  canRedo,
  canUndo,
  isFileOperationPending,
  recentFiles,
  onExport,
  onFitToScreen,
  onOpen,
  onOpenRecent,
  onRedo,
  onResetZoom,
  onSave,
  onSaveAs,
  onUndo,
}: AppMenuProps) {
  return (
    <nav className="app-menu" aria-label="Application menu">
      <details>
        <summary>File</summary>
        <div className="menu-popup" role="menu">
          <button type="button" role="menuitem" disabled={isFileOperationPending} onClick={onOpen}>
            Open… <kbd>Ctrl/Cmd+O</kbd>
          </button>
          <button type="button" role="menuitem" disabled={isFileOperationPending} onClick={onSave}>
            Save <kbd>Ctrl/Cmd+S</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isFileOperationPending}
            onClick={onSaveAs}
          >
            Save As… <kbd>Ctrl/Cmd+Shift+S</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isFileOperationPending}
            onClick={onExport}
          >
            Export PNG…
          </button>
          {recentFiles.length > 0 ? (
            <>
              <span className="menu-separator" />
              <span className="menu-heading">Recent files</span>
              {recentFiles.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  role="menuitem"
                  disabled={isFileOperationPending}
                  title={file.path}
                  onClick={() => onOpenRecent(file.path)}
                >
                  {fileName(file.path)}
                </button>
              ))}
            </>
          ) : null}
        </div>
      </details>

      <details>
        <summary>Edit</summary>
        <div className="menu-popup" role="menu">
          <button type="button" role="menuitem" disabled={!canUndo} onClick={onUndo}>
            Undo <kbd>Ctrl/Cmd+Z</kbd>
          </button>
          <button type="button" role="menuitem" disabled={!canRedo} onClick={onRedo}>
            Redo <kbd>Ctrl/Cmd+Shift+Z</kbd>
          </button>
        </div>
      </details>

      <details>
        <summary>View</summary>
        <div className="menu-popup" role="menu">
          <button type="button" role="menuitem" onClick={onFitToScreen}>
            Fit to screen <kbd>Ctrl/Cmd+0</kbd>
          </button>
          <button type="button" role="menuitem" onClick={onResetZoom}>
            Actual size <kbd>Ctrl/Cmd+1</kbd>
          </button>
        </div>
      </details>
    </nav>
  );
}
