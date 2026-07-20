import { describe, expect, it } from "vitest";
import { createEditorDocument } from "@/editor/document";
import { EditorSession } from "@/editor/session";
import { PencilTool } from "@/editor/tools";

describe("EditorSession", () => {
  it("undoes the latest pencil stroke", () => {
    const document = createEditorDocument({
      width: 8,
      height: 8,
      idGenerator: (() => {
        let nextId = 0;
        return () => `id-${++nextId}`;
      })(),
    });
    const session = new EditorSession(document);
    const pencil = new PencilTool();

    pencil.onPointerDown({ point: { x: 1, y: 1 } }, session);
    pencil.onPointerMove({ point: { x: 3, y: 1 } }, session);
    pencil.onPointerUp({ point: { x: 3, y: 1 } }, session);

    const pixelOffset = (1 * document.width + 2) * 4;
    expect(session.getActiveSurface().data[pixelOffset + 3]).toBe(255);
    expect(session.undo()).toBe(true);
    expect(session.getActiveSurface().data[pixelOffset + 3]).toBe(0);
    expect(session.undo()).toBe(false);
  });

  it("manages raster layers while retaining one layer", () => {
    let nextId = 0;
    const idGenerator = (): string => `id-${++nextId}`;
    const document = createEditorDocument({
      width: 8,
      height: 8,
      idGenerator,
    });
    const session = new EditorSession(document, idGenerator);
    const firstLayerId = document.activeLayerId;

    const paintLayer = session.createLayer("Paint");
    expect(session.document.layers).toHaveLength(2);
    expect(session.document.activeLayerId).toBe(paintLayer.id);
    expect(session.getLayerSurface(paintLayer.id)).toBeDefined();

    expect(session.renameLayer(paintLayer.id, "Details")).toBe(true);
    expect(session.setLayerVisibility(paintLayer.id, false)).toBe(true);
    expect(session.setLayerOpacity(paintLayer.id, 0.4)).toBe(true);
    expect(session.moveLayer(paintLayer.id, 0)).toBe(true);
    expect(session.document.layers.map((layer) => layer.id)).toEqual([paintLayer.id, firstLayerId]);

    expect(session.setActiveLayer(firstLayerId)).toBe(true);
    expect(session.deleteLayer(paintLayer.id)).toBe(true);
    expect(session.document.layers).toHaveLength(1);
    expect(session.deleteLayer(firstLayerId)).toBe(false);
  });
});
