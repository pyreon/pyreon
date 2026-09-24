Run tests for one package or all packages.

Usage:

- `/test` — all package tests
- `/test reactivity` — one package
- `/test runtime-dom --coverage` — with coverage

Steps:

1. If $ARGUMENTS names a package, run `bun run --filter='@pyreon/<name>' test` (packages live at `packages/<category>/<name>`, so filter by name rather than `cd`).
2. If `--coverage` is present, append `-- --coverage`.
3. With no arguments, run `bun run test` from the repo root.
4. Do not pipe the run through `tail`/`head` — that hides the exit code.
5. Report failures with the test name and error.
