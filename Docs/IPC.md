# IPC contract and bitmap ownership

## Boundary

TypeScript owns UI state, pointer events, viewport state and editor-session
coordination. Rust owns native file access and image codecs. The boundary is
explicit Tauri commands; no Rust command is called for pointer move, brush
interpolation, compositing or canvas repaint.

## Commands

| Command           | Input                                           | Output                    | Ownership                                                                                           |
| ----------------- | ----------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `open_png`        | selected file path                              | `{ width, height, rgba }` | Rust decodes into an owned buffer; frontend copies it into a new `RasterSurface`.                   |
| `save_png`        | selected path, dimensions, final RGBA composite | final output path         | Frontend owns the composite until IPC serialization; Rust owns the encoder buffer and written file. |
| Future `export_*` | export options and final composite              | final output path         | Export never mutates the active document or its layer surfaces.                                     |

`open_png` and `save_png` are explicit file boundaries, so transferring one
full bitmap is allowed. Their commands must not be used from a hot input or
render path.

## Bitmap rules

1. `RasterSurface` and composite cache are owned by `EditorSession`, outside
   React state.
2. A tool changes only the active `RasterSurface`; it reports invalidation via
   a dirty rectangle.
3. Canvas reads the Session composite cache. Export reads the same composite,
   so preview and output use identical pixels.
4. History stores dirty patches (`before/after`) rather than full-layer
   snapshots for pointer tools. Tile storage is the next step when a patch is
   too large or documents exceed the memory budget.
5. Do not convert RGBA to `number[]` or JSON in a pointer/render path. The
   current PNG file boundary is the only temporary whole-bitmap IPC path;
   future large-file work should use a binary transport or native temporary
   storage rather than introducing repeated JSON transfers.

## Error contract

Every Rust command failure serializes to:

```ts
interface AppError {
  code: string;
  message: string;
  context: {
    operation: string;
    details: string;
  };
}
```

`message` is safe to show in the UI. `context.details` is diagnostic context
for logs and troubleshooting and must not be parsed for control flow. Frontend
behavior switches on stable `code`, never on Rust error text.
