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

    pencil.onPointerDown({ point: { x: 1, y: 1 }, button: 0 }, session);
    pencil.onPointerMove({ point: { x: 3, y: 1 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 3, y: 1 }, button: 0 }, session);

    const pixelOffset = (1 * document.width + 2) * 4;
    expect(session.getActiveSurface().data[pixelOffset + 3]).toBe(255);
    expect(session.undo()).toBe(true);
    expect(session.getActiveSurface().data[pixelOffset + 3]).toBe(0);
    expect(session.redo()).toBe(true);
    expect(session.getActiveSurface().data[pixelOffset + 3]).toBe(255);
    expect(session.redo()).toBe(false);
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

  it("undoes layer metadata commands", () => {
    let nextId = 0;
    const idGenerator = (): string => `id-${++nextId}`;
    const document = createEditorDocument({ width: 2, height: 2, idGenerator });
    const session = new EditorSession(document, idGenerator);
    const layer = session.createLayer("Paint");

    session.renameLayer(layer.id, "Details");
    expect(session.document.layers).toHaveLength(2);
    expect(session.document.layers.at(-1)?.name).toBe("Details");

    expect(session.undo()).toBe(true);
    expect(session.document.layers.at(-1)?.name).toBe("Paint");
    expect(session.undo()).toBe(true);
    expect(session.document.layers).toHaveLength(1);
    expect(session.redo()).toBe(true);
    expect(session.document.layers).toHaveLength(2);
  });

  it("duplicates a layer with pixels and restores it through undo and redo", () => {
    let nextId = 0;
    const idGenerator = (): string => `id-${++nextId}`;
    const document = createEditorDocument({ width: 2, height: 2, idGenerator });
    const session = new EditorSession(document, idGenerator);
    const pencil = new PencilTool();

    pencil.onPointerDown({ point: { x: 0, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 0, y: 0 }, button: 0 }, session);
    const duplicate = session.duplicateLayer(document.activeLayerId);

    expect(duplicate).not.toBeNull();
    expect(session.document.layers).toHaveLength(2);
    expect(session.getLayerSurface(duplicate!.id).data).toEqual(
      session.getLayerSurface(document.activeLayerId).data,
    );
    expect(session.undo()).toBe(true);
    expect(session.document.layers).toHaveLength(1);
    expect(session.redo()).toBe(true);
    expect(session.document.layers).toHaveLength(2);
    expect(session.getLayerSurface(duplicate!.id).data[3]).toBe(255);
  });

  it("honors layer and transparency locks", () => {
    const document = createEditorDocument({ width: 3, height: 1 });
    const session = new EditorSession(document);
    const pencil = new PencilTool();

    expect(session.setLayerLocked(document.activeLayerId, true)).toBe(true);
    pencil.onPointerDown({ point: { x: 0, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 0, y: 0 }, button: 0 }, session);
    expect(session.getActiveSurface().data[3]).toBe(0);

    session.setLayerLocked(document.activeLayerId, false);
    pencil.onPointerDown({ point: { x: 0, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 0, y: 0 }, button: 0 }, session);
    session.setLayerTransparencyLocked(document.activeLayerId, true);
    session.setColor("primary", { red: 255, green: 0, blue: 0, alpha: 255 });
    pencil.onPointerDown({ point: { x: 1, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 1, y: 0 }, button: 0 }, session);
    pencil.onPointerDown({ point: { x: 0, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 0, y: 0 }, button: 0 }, session);

    expect(session.getActiveSurface().data[7]).toBe(0);
    expect(session.getActiveSurface().data.slice(0, 4)).toEqual(
      new Uint8ClampedArray([255, 0, 0, 255]),
    );
  });

  it("merges layers and flattens them as undoable commands", () => {
    let nextId = 0;
    const idGenerator = (): string => `id-${++nextId}`;
    const document = createEditorDocument({ width: 2, height: 2, idGenerator });
    const session = new EditorSession(document, idGenerator);
    const pencil = new PencilTool();

    pencil.onPointerDown({ point: { x: 0, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 0, y: 0 }, button: 0 }, session);
    const topLayer = session.createLayer("Top");
    session.setColor("primary", { red: 255, green: 0, blue: 0, alpha: 255 });
    pencil.onPointerDown({ point: { x: 0, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 0, y: 0 }, button: 0 }, session);

    expect(session.mergeDown(topLayer.id)).toBe(true);
    expect(session.document.layers).toHaveLength(1);
    expect(session.getActiveSurface().data.slice(0, 4)).toEqual(
      new Uint8ClampedArray([255, 0, 0, 255]),
    );
    expect(session.undo()).toBe(true);
    expect(session.document.layers).toHaveLength(2);
    expect(session.redo()).toBe(true);
    session.createLayer("Overlay");
    expect(session.flatten()).toBe(true);
    expect(session.document.layers).toHaveLength(1);
    expect(session.undo()).toBe(true);
    expect(session.document.layers).toHaveLength(2);
  });

  it("merges visible layers as an undoable command", () => {
    let nextId = 0;
    const idGenerator = (): string => `id-${++nextId}`;
    const document = createEditorDocument({ width: 2, height: 2, idGenerator });
    const session = new EditorSession(document, idGenerator);

    session.createLayer("Top");
    expect(session.mergeVisible()).toBe(true);
    expect(session.document.layers).toHaveLength(1);
    expect(session.undo()).toBe(true);
    expect(session.document.layers).toHaveLength(2);
  });

  it("invalidates only the changed layer thumbnail", () => {
    let nextId = 0;
    const idGenerator = (): string => `id-${++nextId}`;
    const document = createEditorDocument({ width: 2, height: 2, idGenerator });
    const session = new EditorSession(document, idGenerator);
    const pencil = new PencilTool();
    const baseThumbnail = session.getLayerThumbnail(document.activeLayerId);
    const topLayer = session.createLayer("Top");
    const initialTopThumbnail = session.getLayerThumbnail(topLayer.id);

    expect(session.getLayerThumbnail(topLayer.id)).toBe(initialTopThumbnail);
    pencil.onPointerDown({ point: { x: 0, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 0, y: 0 }, button: 0 }, session);
    const updatedTopThumbnail = session.getLayerThumbnail(topLayer.id);

    expect(updatedTopThumbnail).not.toBe(initialTopThumbnail);
    expect(updatedTopThumbnail.pixels[3]).toBe(255);
    expect(session.getLayerThumbnail(session.document.activeLayerId)).toBe(updatedTopThumbnail);
    expect(session.getLayerThumbnail(document.layers[0].id)).toBe(baseThumbnail);
  });

  it("samples colors from the active layer or composite", () => {
    let nextId = 0;
    const idGenerator = (): string => `id-${++nextId}`;
    const document = createEditorDocument({ width: 2, height: 2, idGenerator });
    const session = new EditorSession(document, idGenerator);
    const pencil = new PencilTool();

    pencil.onPointerDown({ point: { x: 0, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 0, y: 0 }, button: 0 }, session);
    session.createLayer("Top layer");

    expect(session.sampleColor({ x: 0, y: 0 }, "active-layer")).toEqual({
      red: 0,
      green: 0,
      blue: 0,
      alpha: 0,
    });
    expect(session.sampleColor({ x: 0, y: 0 }, "composite")).toEqual(session.getColor("primary"));
    expect(session.sampleColor({ x: -1, y: 0 }, "composite")).toBeNull();
  });

  it("stores a bounded fill tolerance", () => {
    const session = new EditorSession(createEditorDocument({ width: 2, height: 2 }));

    session.setFillTolerance(18.7);
    expect(session.getFillTolerance()).toBe(19);
    expect(() => session.setFillTolerance(256)).toThrow(RangeError);
  });

  it("updates cached composite pixels after a raster command", () => {
    const document = createEditorDocument({
      width: 2,
      height: 2,
      idGenerator: (() => {
        let nextId = 0;
        return () => `id-${++nextId}`;
      })(),
    });
    const session = new EditorSession(document);
    const pencil = new PencilTool();
    const initialComposite = session.getCompositePixels();

    pencil.onPointerDown({ point: { x: 0, y: 0 }, button: 0 }, session);
    pencil.onPointerUp({ point: { x: 0, y: 0 }, button: 0 }, session);

    const updatedComposite = session.getCompositePixels();
    expect(updatedComposite).toBe(initialComposite);
    expect(updatedComposite[3]).toBe(255);
  });
});
