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
});
