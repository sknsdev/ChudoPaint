import type { ChangeEvent } from "react";
import type { ColorSampleSource } from "@/editor/tools";
import type { RgbaColor } from "@/editor/renderer";
import type { EditorSession } from "@/editor/session";

export type ToolId = "pencil" | "brush" | "eraser" | "fill" | "eyedropper";

type ColorChannel = "red" | "green" | "blue" | "alpha";

interface ToolsPanelProps {
  activeTool: ToolId;
  eyedropperSource: ColorSampleSource;
  session: EditorSession;
  onActiveToolChange(tool: ToolId): void;
  onEyedropperSourceChange(source: ColorSampleSource): void;
  onSettingsChange(): void;
}

const toolLabels: Record<ToolId, { label: string; shortcut: string }> = {
  pencil: { label: "Pencil", shortcut: "P" },
  brush: { label: "Brush", shortcut: "B" },
  eraser: { label: "Eraser", shortcut: "E" },
  fill: { label: "Fill", shortcut: "G" },
  eyedropper: { label: "Eyedropper", shortcut: "I" },
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex({ red, green, blue }: RgbaColor): string {
  return `#${[red, green, blue]
    .map((channel) => clampByte(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function colorFromHex(value: string, alpha: number): RgbaColor | null {
  const match = /^#?([\da-f]{6})$/i.exec(value.trim());
  if (!match) {
    return null;
  }

  return {
    red: Number.parseInt(match[1].slice(0, 2), 16),
    green: Number.parseInt(match[1].slice(2, 4), 16),
    blue: Number.parseInt(match[1].slice(4, 6), 16),
    alpha,
  };
}

function colorFromInput(event: ChangeEvent<HTMLInputElement>, alpha: number): RgbaColor {
  return colorFromHex(event.target.value, alpha) ?? { red: 0, green: 0, blue: 0, alpha };
}

function updateColorChannel(color: RgbaColor, channel: ColorChannel, value: number): RgbaColor {
  return { ...color, [channel]: clampByte(value) };
}

function ColorEditor({
  label,
  color,
  onChange,
}: {
  label: string;
  color: RgbaColor;
  onChange(color: RgbaColor): void;
}) {
  const updateChannel = (channel: ColorChannel, event: ChangeEvent<HTMLInputElement>): void => {
    onChange(updateColorChannel(color, channel, Number(event.target.value)));
  };

  return (
    <fieldset className="color-editor">
      <legend>{label}</legend>
      <input
        aria-label={`${label} color picker`}
        type="color"
        value={toHex(color)}
        onChange={(event) => onChange(colorFromInput(event, color.alpha))}
      />
      <label>
        <span>HEX</span>
        <input
          key={toHex(color)}
          aria-label={`${label} HEX`}
          defaultValue={toHex(color)}
          inputMode="text"
          maxLength={7}
          onBlur={(event) => {
            const nextColor = colorFromHex(event.target.value, color.alpha);
            if (nextColor) {
              onChange(nextColor);
            } else {
              event.currentTarget.value = toHex(color);
            }
          }}
        />
      </label>
      <div className="color-channels">
        {(["red", "green", "blue", "alpha"] as ColorChannel[]).map((channel) => (
          <label key={channel}>
            <span>{channel === "alpha" ? "A" : channel.slice(0, 1).toUpperCase()}</span>
            <input
              aria-label={`${label} ${channel}`}
              type="number"
              min="0"
              max="255"
              value={color[channel]}
              onChange={(event) => updateChannel(channel, event)}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ToolsPanel({
  activeTool,
  eyedropperSource,
  session,
  onActiveToolChange,
  onEyedropperSourceChange,
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
  const updateColor = (slot: "primary" | "secondary", color: RgbaColor): void => {
    session.setColor(slot, color);
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
            title={`${toolLabels[toolId].label} (${toolLabels[toolId].shortcut})`}
            onClick={() => onActiveToolChange(toolId)}
          >
            {toolLabels[toolId].label} <kbd>{toolLabels[toolId].shortcut}</kbd>
          </button>
        ))}
      </div>

      <div className="color-controls">
        <ColorEditor
          label="Primary"
          color={colors.primary}
          onChange={(color) => updateColor("primary", color)}
        />
        <ColorEditor
          label="Secondary"
          color={colors.secondary}
          onChange={(color) => updateColor("secondary", color)}
        />
        <button
          type="button"
          onClick={() => {
            session.swapColors();
            onSettingsChange();
          }}
        >
          Swap colors <kbd>X</kbd>
        </button>
        <button
          type="button"
          onClick={() => {
            session.resetColors();
            onSettingsChange();
          }}
        >
          Reset B/W <kbd>D</kbd>
        </button>
      </div>

      {activeTool === "fill" ? (
        <div className="brush-controls">
          <label>
            <span>Color tolerance {session.getFillTolerance()}</span>
            <input
              type="range"
              min="0"
              max="255"
              step="1"
              value={session.getFillTolerance()}
              onChange={(event) => {
                session.setFillTolerance(Number(event.target.value));
                onSettingsChange();
              }}
            />
          </label>
        </div>
      ) : null}

      {activeTool === "eyedropper" ? (
        <label className="eyedropper-source">
          <span>Sample from</span>
          <select
            value={eyedropperSource}
            onChange={(event) => onEyedropperSourceChange(event.target.value as ColorSampleSource)}
          >
            <option value="active-layer">Active layer</option>
            <option value="composite">Composite</option>
          </select>
        </label>
      ) : null}

      {activeTool === "brush" || activeTool === "eraser" ? (
        <div className="brush-controls">
          <label>
            <span>Size {brushSettings.size}px ([ / ])</span>
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
