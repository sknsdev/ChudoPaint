import { useLayoutEffect, useRef } from "react";
import type { EditorDocument } from "@/editor/document";

const CHECKERBOARD_CELL_SIZE = 16;
const CHECKERBOARD_LIGHT_COLOR = "#f0f0f0";
const CHECKERBOARD_DARK_COLOR = "#cacaca";

interface EditorCanvasProps {
  document: EditorDocument;
}

function drawCheckerboard(context: CanvasRenderingContext2D, width: number, height: number): void {
  const tileSize = CHECKERBOARD_CELL_SIZE * 2;
  const tile = globalThis.document.createElement("canvas");
  tile.width = tileSize;
  tile.height = tileSize;

  const tileContext = tile.getContext("2d");
  if (!tileContext) {
    return;
  }

  tileContext.fillStyle = CHECKERBOARD_LIGHT_COLOR;
  tileContext.fillRect(0, 0, tileSize, tileSize);
  tileContext.fillStyle = CHECKERBOARD_DARK_COLOR;
  tileContext.fillRect(0, 0, CHECKERBOARD_CELL_SIZE, CHECKERBOARD_CELL_SIZE);
  tileContext.fillRect(
    CHECKERBOARD_CELL_SIZE,
    CHECKERBOARD_CELL_SIZE,
    CHECKERBOARD_CELL_SIZE,
    CHECKERBOARD_CELL_SIZE,
  );

  const pattern = context.createPattern(tile, "repeat");
  if (!pattern) {
    return;
  }

  context.fillStyle = pattern;
  context.fillRect(0, 0, width, height);
}

export function EditorCanvas({ document }: EditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const pixelRatio = globalThis.devicePixelRatio || 1;
    canvas.width = Math.round(document.width * pixelRatio);
    canvas.height = Math.round(document.height * pixelRatio);
    canvas.style.width = `${document.width}px`;
    canvas.style.height = `${document.height}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, document.width, document.height);

    if (document.background.kind === "color") {
      context.fillStyle = document.background.color;
      context.fillRect(0, 0, document.width, document.height);
      return;
    }

    drawCheckerboard(context, document.width, document.height);
  }, [document.background, document.height, document.width]);

  return (
    <canvas
      ref={canvasRef}
      className="editor-canvas"
      aria-label={`${document.name} canvas`}
      role="img"
    >
      Your browser does not support Canvas 2D.
    </canvas>
  );
}
