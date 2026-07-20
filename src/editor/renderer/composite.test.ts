import { describe, expect, it } from "vitest";
import { createEditorDocument } from "@/editor/document";
import { compositeDocumentLayers, RasterSurface } from "@/editor/renderer";

describe("compositeDocumentLayers", () => {
  it("blends visible layers using normal source-over alpha", () => {
    const document = createEditorDocument({
      width: 1,
      height: 1,
      idGenerator: (() => {
        let nextId = 0;
        return () => `id-${++nextId}`;
      })(),
    });
    const topLayer = {
      ...document.layers[0],
      id: "top-layer",
      opacity: 0.5,
    };
    const layers = [{ ...document.layers[0], id: "bottom-layer" }, topLayer];
    const surfaces = new Map([
      ["bottom-layer", new RasterSurface(1, 1, new Uint8ClampedArray([255, 0, 0, 255]))],
      ["top-layer", new RasterSurface(1, 1, new Uint8ClampedArray([0, 0, 255, 255]))],
    ]);

    const pixels = compositeDocumentLayers(
      { ...document, layers, activeLayerId: topLayer.id },
      (layerId) => {
        const surface = surfaces.get(layerId);
        if (!surface) {
          throw new Error(`Missing test surface for ${layerId}.`);
        }
        return surface;
      },
    );

    expect([...pixels]).toEqual([128, 0, 128, 255]);
  });

  it("ignores hidden layers", () => {
    const document = createEditorDocument({
      width: 1,
      height: 1,
      idGenerator: () => "layer",
    });
    const hiddenLayer = { ...document.layers[0], visible: false };
    const surface = new RasterSurface(1, 1, new Uint8ClampedArray([255, 0, 0, 255]));

    expect(compositeDocumentLayers({ ...document, layers: [hiddenLayer] }, () => surface)).toEqual(
      new Uint8ClampedArray([0, 0, 0, 0]),
    );
  });
});
