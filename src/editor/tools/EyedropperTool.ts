import type { ColorSampleSource, Tool, ToolContext, ToolPointerEvent } from "@/editor/tools/types";

export class EyedropperTool implements Tool {
  readonly id = "eyedropper";
  readonly cursor = "copy";

  constructor(private sampleSource: ColorSampleSource = "composite") {}

  setSampleSource(source: ColorSampleSource): void {
    this.sampleSource = source;
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): void {
    const color = context.sampleColor(event.point, this.sampleSource);
    if (color) {
      context.setColor(event.button === 2 ? "secondary" : "primary", color);
    }
  }

  onPointerMove(): void {}

  onPointerUp(): void {}

  onPointerCancel(): void {}
}
