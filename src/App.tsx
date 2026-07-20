import { EditorCanvas } from "@/editor/canvas";
import { createEditorDocument } from "@/editor/document";

const initialDocument = createEditorDocument({
  width: 800,
  height: 600,
});

function App() {
  return (
    <main className="editor-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Open-source raster editor</p>
          <h1>ChudoPaint</h1>
        </div>
        <p className="document-details">
          {initialDocument.name} · {initialDocument.width} × {initialDocument.height} px
        </p>
      </header>

      <section className="canvas-workspace" aria-label="Editor workspace">
        <EditorCanvas document={initialDocument} />
      </section>
    </main>
  );
}

export default App;
