import { useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import type { EditorDocument } from "@/editor/document";
import { shouldIgnoreEditorHotkey } from "@/editor/keyboard";
import type { Layer } from "@/editor/layers/types";
import type { EditorSession, LayerThumbnail } from "@/editor/session";

interface LayersPanelProps {
  document: EditorDocument;
  session: EditorSession;
  onDocumentChange(): void;
}

interface LayerThumbnailProps {
  document: EditorDocument;
  layer: Layer;
  session: EditorSession;
}

function layerIndex(document: EditorDocument, id: string): number {
  return document.layers.findIndex((layer) => layer.id === id);
}

function renameOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter") {
    event.currentTarget.blur();
  }
}

function LayerThumbnailView({ document, layer, session }: LayerThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const thumbnail: LayerThumbnail = session.getLayerThumbnail(layer.id);
    canvas.width = thumbnail.width;
    canvas.height = thumbnail.height;
    const context = canvas.getContext("2d");
    if (context) {
      context.putImageData(
        new ImageData(thumbnail.pixels, thumbnail.width, thumbnail.height),
        0,
        0,
      );
    }
  }, [document, layer.id, session]);

  return <canvas ref={canvasRef} className="layer-thumbnail" aria-hidden="true" />;
}

export function LayersPanel({ document, session, onDocumentChange }: LayersPanelProps) {
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const changeLayer = (change: () => boolean): void => {
    if (change()) {
      onDocumentChange();
    }
  };

  const createLayer = (): void => {
    session.createLayer();
    onDocumentChange();
  };

  const onDrop = (event: DragEvent<HTMLLIElement>, destinationIndex: number): void => {
    event.preventDefault();
    const sourceId = draggedLayerId ?? event.dataTransfer.getData("text/plain");
    if (sourceId) {
      changeLayer(() => session.moveLayer(sourceId, destinationIndex));
    }
    setDraggedLayerId(null);
  };

  return (
    <aside className="layers-panel" aria-labelledby="layers-heading">
      <div className="panel-heading">
        <h2 id="layers-heading">Layers</h2>
        <button type="button" title="Add layer" onClick={createLayer}>
          +
        </button>
      </div>

      <ol className="layers-list" aria-label="Layers, top to bottom">
        {[...document.layers].reverse().map((layer) => {
          const index = layerIndex(document, layer.id);
          const isActive = layer.id === document.activeLayerId;
          const isTopLayer = index === document.layers.length - 1;
          const isBottomLayer = index === 0;

          return (
            <li
              key={layer.id}
              draggable
              className={isActive ? "layer-row is-active" : "layer-row"}
              aria-grabbed={draggedLayerId === layer.id}
              onDragEnd={() => setDraggedLayerId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", layer.id);
                setDraggedLayerId(layer.id);
              }}
              onDrop={(event) => onDrop(event, index)}
              onKeyDown={(event) => {
                if (shouldIgnoreEditorHotkey(event.nativeEvent) || !event.altKey) {
                  return;
                }

                if (event.key === "ArrowUp" && !isTopLayer) {
                  event.preventDefault();
                  changeLayer(() => session.moveLayer(layer.id, index + 1));
                } else if (event.key === "ArrowDown" && !isBottomLayer) {
                  event.preventDefault();
                  changeLayer(() => session.moveLayer(layer.id, index - 1));
                }
              }}
            >
              <button
                type="button"
                className="layer-visibility"
                aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                title={layer.visible ? "Hide layer" : "Show layer"}
                onClick={() =>
                  changeLayer(() => session.setLayerVisibility(layer.id, !layer.visible))
                }
              >
                {layer.visible ? "●" : "○"}
              </button>
              <LayerThumbnailView document={document} layer={layer} session={session} />
              <button
                type="button"
                className="layer-select"
                aria-pressed={isActive}
                onClick={() => changeLayer(() => session.setActiveLayer(layer.id))}
              >
                {layer.name}
              </button>
              <div className="layer-actions" aria-label={`${layer.name} order`}>
                <button
                  type="button"
                  disabled={isTopLayer}
                  title="Move layer up (Alt+Up)"
                  onClick={() => changeLayer(() => session.moveLayer(layer.id, index + 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={isBottomLayer}
                  title="Move layer down (Alt+Down)"
                  onClick={() => changeLayer(() => session.moveLayer(layer.id, index - 1))}
                >
                  ↓
                </button>
              </div>

              {isActive ? (
                <div className="layer-settings">
                  <label>
                    <span>Name</span>
                    <input
                      key={layer.id}
                      aria-label="Layer name"
                      defaultValue={layer.name}
                      onBlur={(event) =>
                        changeLayer(() => session.renameLayer(layer.id, event.currentTarget.value))
                      }
                      onKeyDown={renameOnEnter}
                    />
                  </label>
                  <label>
                    <span>Opacity {Math.round(layer.opacity * 100)}%</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={layer.opacity}
                      onChange={(event) =>
                        changeLayer(() =>
                          session.setLayerOpacity(layer.id, Number(event.target.value)),
                        )
                      }
                    />
                  </label>
                  <div className="layer-toggle-controls">
                    <button
                      type="button"
                      aria-pressed={layer.locked}
                      onClick={() =>
                        changeLayer(() => session.setLayerLocked(layer.id, !layer.locked))
                      }
                    >
                      {layer.locked ? "Unlock layer" : "Lock layer"}
                    </button>
                    <button
                      type="button"
                      aria-pressed={layer.lockTransparency}
                      onClick={() =>
                        changeLayer(() =>
                          session.setLayerTransparencyLocked(layer.id, !layer.lockTransparency),
                        )
                      }
                    >
                      {layer.lockTransparency ? "Unlock transparency" : "Lock transparency"}
                    </button>
                  </div>
                  <div className="layer-command-controls">
                    <button
                      type="button"
                      disabled={isBottomLayer}
                      onClick={() => changeLayer(() => session.mergeDown(layer.id))}
                    >
                      Merge down
                    </button>
                    <button
                      type="button"
                      onClick={() => changeLayer(() => session.duplicateLayer(layer.id) !== null)}
                    >
                      Duplicate
                    </button>
                    <button type="button" onClick={() => changeLayer(() => session.mergeVisible())}>
                      Merge visible
                    </button>
                    <button type="button" onClick={() => changeLayer(() => session.flatten())}>
                      Flatten
                    </button>
                  </div>
                  <button
                    type="button"
                    className="layer-delete"
                    disabled={document.layers.length === 1}
                    onClick={() => changeLayer(() => session.deleteLayer(layer.id))}
                  >
                    Delete layer
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
