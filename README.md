# ChudoPaint

ChudoPaint is a community-built, cross-platform raster image editor. It aims to provide a familiar
Paint-like workflow with a capable layer system, while remaining fast, approachable, and open
source.

> **Status:** early foundation. The first milestone establishes the Tauri + React application,
> quality gates, and contributor workflow. The editor itself is not available yet.

## Goals

- Run natively on Windows, macOS (Intel and Apple Silicon), and Linux.
- Build an accessible raster editor for everyday image work.
- Support transparent layers, PNG import/export, drawing tools, and undo/redo.
- Keep the editor core independent from the React UI where practical.
- Make decisions and development welcoming to contributors.

The initial scope and future milestones are documented in [Docs/Plan.md](Docs/Plan.md).

## Technology

- [Tauri 2](https://v2.tauri.app/) and Rust for the desktop shell and native operations
- [React](https://react.dev/) and TypeScript for the interface
- [Vite](https://vite.dev/) for frontend development and builds

## Prerequisites

Install the following before developing locally:

- [Node.js](https://nodejs.org/) 22 or newer
- [Rust](https://www.rust-lang.org/tools/install) stable toolchain
- Tauri's platform-specific prerequisites from the
  [official guide](https://v2.tauri.app/start/prerequisites/)

On Linux, install the required WebKitGTK development packages for your distribution.

## Development

```sh
npm install
npm run tauri dev
```

Useful checks:

```sh
npm run format
npm run lint
npm run typecheck
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Create a distributable package locally with:

```sh
npm run tauri build
```

## Contributing

Contributions of code, design, documentation, testing, and feedback are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) and follow the [Code of Conduct](CODE_OF_CONDUCT.md) before
participating. For larger changes, open an issue or discussion first so the community can align on
the approach.

## License

ChudoPaint is licensed under the [Apache License 2.0](LICENSE).
