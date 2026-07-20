# Contributing to ChudoPaint

Thank you for helping build ChudoPaint. Contributions can include code, documentation, design,
translations, accessibility reviews, testing, issue triage, and constructive feedback.

## Before you start

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Search existing issues and discussions to avoid duplicate work.
- For substantial features or architectural changes, start a discussion or issue before writing
  code. This prevents wasted effort and lets maintainers and contributors agree on scope.
- Keep pull requests focused. Unrelated refactors belong in separate changes.

## Local setup

See the [development instructions in the README](README.md#development). Run these checks before
opening a pull request:

```sh
npm run format
npm run lint
npm run typecheck
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

## Pull requests

1. Create a branch from `main`.
2. Make a small, well-explained change with tests when behavior can be tested.
3. Use a clear, imperative commit subject. Conventional Commits are encouraged, for example:
   `feat: add viewport coordinate conversion`.
4. Complete the pull-request template and describe how you verified the change.
5. Be responsive and respectful during review. Maintainers may request changes to protect the
   project's architecture, quality, or accessibility.

By submitting a contribution, you agree that it is licensed under the
[Apache License 2.0](LICENSE).

## Reporting security issues

Do not file public issues for vulnerabilities. Until a dedicated security contact is published,
contact the maintainers privately through the repository's security-advisory feature.

## Decisions and roadmap

The project roadmap lives in [Docs/Plan.md](Docs/Plan.md). Maintainers make final decisions when
consensus is not possible, taking project goals, maintenance cost, and community feedback into
account.
