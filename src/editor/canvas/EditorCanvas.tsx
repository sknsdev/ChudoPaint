import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { EditorSession } from "@/editor/session";
import type { Tool } from "@/editor/tools";
import {
  createViewport,
  fitDocumentToViewport,
  resetViewportToActualSize,
  screenToDocument,
  screenToViewport,
  viewportToDocument,
} from "@/editor/viewport";
import type { Point, Viewport } from "@/editor/viewport";

const CHECKERBOARD_CELL_SIZE = 16;
const CHECKERBOARD_LIGHT_COLOR = "#f0f0f0";
const CHECKERBOARD_DARK_COLOR = "#cacaca";
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 32;
const ZOOM_STEP = 1.1;
const VIEWPORT_PADDING = 40;

interface EditorCanvasProps {
  documentVersion: number;
  session: EditorSession;
  tool: Tool;
}

interface PanState {
  pointerId: number;
  start: Point;
  origin: Point;
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function formatHistoryBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
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

function drawSurface(
  context: CanvasRenderingContext2D,
  documentWidth: number,
  documentHeight: number,
  pixels: Uint8ClampedArray,
): void {
  const layerCanvas = globalThis.document.createElement("canvas");
  layerCanvas.width = documentWidth;
  layerCanvas.height = documentHeight;

  const layerContext = layerCanvas.getContext("2d");
  if (!layerContext) {
    return;
  }

  layerContext.putImageData(new ImageData(pixels, documentWidth, documentHeight), 0, 0);
  context.drawImage(layerCanvas, 0, 0);
}

export function EditorCanvas({ documentVersion, session, tool }: EditorCanvasProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasCenteredDocument = useRef(false);
  const spacePressed = useRef(false);
  const panState = useRef<PanState | null>(null);
  const drawingPointerId = useRef<number | null>(null);
  const [viewport, setViewport] = useState<Viewport>(() => createViewport());
  const [revision, setRevision] = useState(0);
  const document = session.document;
  const historyInfo = session.historyInfo;

  const fitToScreen = useCallback((): void => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    const bounds = workspace.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    setViewport(
      fitDocumentToViewport(document, bounds, {
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        padding: VIEWPORT_PADDING,
      }),
    );
  }, [document]);

  const resetToActualSize = useCallback((): void => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    const bounds = workspace.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    setViewport(resetViewportToActualSize(document, bounds));
  }, [document]);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    hasCenteredDocument.current = false;
    const centerDocument = (): void => {
      if (hasCenteredDocument.current) {
        return;
      }

      const bounds = workspace.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        return;
      }

      hasCenteredDocument.current = true;
      setViewport((current) => ({
        ...current,
        origin: {
          x: (bounds.width - document.width * current.zoom) / 2,
          y: (bounds.height - document.height * current.zoom) / 2,
        },
      }));
    };

    const observer = new ResizeObserver(centerDocument);
    observer.observe(workspace);
    centerDocument();

    return () => observer.disconnect();
  }, [document.height, document.id, document.width, documentVersion]);

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
    } else {
      drawCheckerboard(context, document.width, document.height);
    }

    drawSurface(context, document.width, document.height, session.getCompositePixels());
  }, [
    document.background,
    document.height,
    document.layers,
    document.width,
    documentVersion,
    revision,
    session,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === "Space") {
        spacePressed.current = true;
        event.preventDefault();
        return;
      }

      const hasCommandModifier = event.ctrlKey || event.metaKey;
      if (hasCommandModifier && event.key === "0") {
        event.preventDefault();
        fitToScreen();
        return;
      }

      if (hasCommandModifier && event.key === "1") {
        event.preventDefault();
        resetToActualSize();
        return;
      }

      if (hasCommandModifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const changed = event.shiftKey ? session.redo() : session.undo();
        if (changed) {
          setRevision((current) => current + 1);
        }
        return;
      }

      if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        if (session.redo()) {
          setRevision((current) => current + 1);
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === "Space") {
        spacePressed.current = false;
      }
    };

    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("keyup", onKeyUp);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
    };
  }, [fitToScreen, resetToActualSize, session]);

  const toDocumentPoint = (clientX: number, clientY: number): Point => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return { x: 0, y: 0 };
    }

    const bounds = workspace.getBoundingClientRect();
    return screenToDocument({ x: clientX, y: clientY }, bounds, viewport);
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    const bounds = workspace.getBoundingClientRect();
    const viewportPoint = screenToViewport({ x: event.clientX, y: event.clientY }, bounds);
    const zoomFactor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

    setViewport((current) => {
      const documentPoint = viewportToDocument(viewportPoint, current);
      const zoom = clampZoom(current.zoom * zoomFactor);

      return {
        zoom,
        origin: {
          x: viewportPoint.x - documentPoint.x * zoom,
          y: viewportPoint.y - documentPoint.y * zoom,
        },
      };
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const isPanGesture = event.button === 1 || (event.button === 0 && spacePressed.current);
    if (isPanGesture) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panState.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        origin: { ...viewport.origin },
      };
      return;
    }

    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingPointerId.current = event.pointerId;
    tool.onPointerDown(
      { point: toDocumentPoint(event.clientX, event.clientY), button: event.button },
      session,
    );
    setRevision((current) => current + 1);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = panState.current;
    if (pan?.pointerId === event.pointerId) {
      setViewport((current) => ({
        ...current,
        origin: {
          x: pan.origin.x + event.clientX - pan.start.x,
          y: pan.origin.y + event.clientY - pan.start.y,
        },
      }));
      return;
    }

    if (drawingPointerId.current !== event.pointerId) {
      return;
    }

    tool.onPointerMove(
      { point: toDocumentPoint(event.clientX, event.clientY), button: event.button },
      session,
    );
    setRevision((current) => current + 1);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (panState.current?.pointerId === event.pointerId) {
      panState.current = null;
      return;
    }

    if (drawingPointerId.current !== event.pointerId) {
      return;
    }

    tool.onPointerUp(
      { point: toDocumentPoint(event.clientX, event.clientY), button: event.button },
      session,
    );
    drawingPointerId.current = null;
    setRevision((current) => current + 1);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (panState.current?.pointerId === event.pointerId) {
      panState.current = null;
      return;
    }

    if (drawingPointerId.current === event.pointerId) {
      tool.onPointerCancel(session);
      drawingPointerId.current = null;
      setRevision((current) => current + 1);
    }
  };

  return (
    <div
      ref={workspaceRef}
      className="canvas-workspace"
      aria-label="Editor workspace"
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      <canvas
        ref={canvasRef}
        className="editor-canvas"
        aria-label={`${document.name} canvas`}
        role="img"
        style={{
          cursor: spacePressed.current ? "grab" : tool.cursor,
          transform: `translate(${viewport.origin.x}px, ${viewport.origin.y}px) scale(${viewport.zoom})`,
        }}
      >
        Your browser does not support Canvas 2D.
      </canvas>
      <div className="canvas-status" aria-live="polite">
        <button
          type="button"
          title="Fit to screen (Ctrl/Cmd+0)"
          onClick={fitToScreen}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          Fit
        </button>
        <button
          type="button"
          title="Actual size (Ctrl/Cmd+1)"
          onClick={resetToActualSize}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          100%
        </button>
        <span>
          {Math.round(viewport.zoom * 100)}% · Undo {historyInfo.undoCount} · Redo{" "}
          {historyInfo.redoCount} · {formatHistoryBytes(historyInfo.usedBytes)} · Ctrl/Cmd+Z undo ·
          Ctrl/Cmd+Shift+Z redo
        </span>
      </div>
    </div>
  );
}
