import { describe, expect, it } from "vitest";
import { fitDocumentToViewport, resetViewportToActualSize } from "@/editor/viewport";

describe("viewport commands", () => {
  const document = { width: 800, height: 600 };
  const viewport = { width: 1200, height: 800 };

  it("centers the document at 100%", () => {
    expect(resetViewportToActualSize(document, viewport)).toEqual({
      zoom: 1,
      origin: { x: 200, y: 100 },
    });
  });

  it("fits the document into the available viewport area", () => {
    expect(
      fitDocumentToViewport(document, viewport, {
        minZoom: 0.1,
        maxZoom: 32,
        padding: 40,
      }),
    ).toEqual({
      zoom: 1.2,
      origin: { x: 120, y: 40 },
    });
  });

  it("limits fit zoom to the configured bounds", () => {
    expect(
      fitDocumentToViewport(
        document,
        { width: 4000, height: 3000 },
        {
          minZoom: 0.1,
          maxZoom: 2,
          padding: 0,
        },
      ).zoom,
    ).toBe(2);
  });
});
