import type { ChangeEvent } from "react";
import type { RgbaColor } from "@/editor/renderer";
import type { EditorSession } from "@/editor/session";

export type ToolId = "pencil" | "brush" | "eraser" | "fill";

interface ToolsPanelProps {
  activeTool: ToolId;
  session: EditorSession;
  onActiveToolChange(tool: ToolId): void;
  onSettingsChange(): void;
}

const toolLabels: Record<ToolId, string> = {
  pencil: "Pencil",
  brush: "Brush",
  eraser: "Eraser",
  fill: "Fill",
};

function toHex({ red, green, blue }: RgbaColor): string {
  return `#${[red, green, blue]
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function colorFromInput(event: ChangeEvent<HTMLInputElement>, alpha: number): RgbaColor {
  const value = event.target.value;
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
    alpha,
  };
}

export function ToolsPanel({
  activeTool,
  session,
  onActiveToolChange,
  onSettingsChange,
}: ToolsPanelProps) {
  const colors = session.colors;
  const brushSettings = session.getBrushSettings();
  const updateBrushSetting = (setting: "size" | "hardness" | "opacity", value: number): void => {
    session.setBrushSettings({
      ...brushSettings,
      [setting]: value,
    });
    onSettingsChange();
  };

  return (
    <section className="tools-panel" aria-labelledby="tools-heading">
      <h2 id="tools-heading">Tools</h2>
      <div className="tool-grid">
        {(Object.keys(toolLabels) as ToolId[]).map((toolId) => (
          <button
            key={toolId}
            type="button"
            aria-pressed={activeTool === toolId}
            onClick={() => onActiveToolChange(toolId)}
          >
            {toolLabels[toolId]}
          </button>
        ))}
      </div>

      <div className="color-controls">
        <label>
          <span>Primary</span>
          <input
            type="color"
            value={toHex(colors.primary)}
            onChange={(event) => {
              session.setColor("primary", colorFromInput(event, colors.primary.alpha));
              onSettingsChange();
            }}
          />
        </label>
        <label>
          <span>Secondary</span>
          <input
            type="color"
            value={toHex(colors.secondary)}
            onChange={(event) => {
              session.setColor("secondary", colorFromInput(event, colors.secondary.alpha));
              onSettingsChange();
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            session.swapColors();
            onSettingsChange();
          }}
        >
          Swap colors
        </button>
        <button
          type="button"
          onClick={() => {
            session.resetColors();
            onSettingsChange();
          }}
        >
          Reset B/W
        </button>
      </div>

      {activeTool === "brush" || activeTool === "eraser" ? (
        <div className="brush-controls">
          <label>
            <span>Size {brushSettings.size}px</span>
            <input
              type="range"
              min="1"
              max="128"
              step="1"
              value={brushSettings.size}
              onChange={(event) => updateBrushSetting("size", Number(event.target.value))}
            />
          </label>
          <label>
            <span>Hardness {Math.round(brushSettings.hardness * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={brushSettings.hardness}
              onChange={(event) => updateBrushSetting("hardness", Number(event.target.value))}
            />
          </label>
          <label>
            <span>Opacity {Math.round(brushSettings.opacity * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={brushSettings.opacity}
              onChange={(event) => updateBrushSetting("opacity", Number(event.target.value))}
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
