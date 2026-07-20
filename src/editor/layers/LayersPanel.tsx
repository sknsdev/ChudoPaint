import type { KeyboardEvent } from "react";
import type { EditorDocument } from "@/editor/document";

import type { EditorSession } from "@/editor/session";

interface LayersPanelProps {
  document: EditorDocument;
  session: EditorSession;
  onDocumentChange(): void;
}

function layerIndex(document: EditorDocument, id: string): number {
  return document.layers.findIndex((layer) => layer.id === id);
}

function renameOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter") {
    event.currentTarget.blur();
  }
}

export function LayersPanel({ document, session, onDocumentChange }: LayersPanelProps) {
  const changeLayer = (change: () => boolean): void => {
    if (change()) {
      onDocumentChange();
    }
  };

  const createLayer = (): void => {
    session.createLayer();
    onDocumentChange();
  };

  return (
    <aside className="layers-panel" aria-labelledby="layers-heading">
      <div className="panel-heading">
        <h2 id="layers-heading">Layers</h2>
        <button type="button" title="Add layer" onClick={createLayer}>
          +
        </button>
      </div>

      <ol className="layers-list">
        {[...document.layers].reverse().map((layer) => {
          const index = layerIndex(document, layer.id);
          const isActive = layer.id === document.activeLayerId;
          const isTopLayer = index === document.layers.length - 1;
          const isBottomLayer = index === 0;

          return (
            <li key={layer.id} className={isActive ? "layer-row is-active" : "layer-row"}>
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
              <button
                type="button"
                className="layer-select"
                aria-pressed={isActive}
                onClick={() => changeLayer(() => session.setActiveLayer(layer.id))}
              >
                {layer.name}
              </button>
              <div className="layer-actions">
                <button
                  type="button"
                  disabled={isTopLayer}
                  title="Move layer up"
                  onClick={() => changeLayer(() => session.moveLayer(layer.id, index + 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={isBottomLayer}
                  title="Move layer down"
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
