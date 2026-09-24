---
'@pyreon/atlas': patch
---

Correctness fixes across discovery, verification and the dev server:

- `verify-browser` no longer turns a scan-time `ssrParity` failure into `ok: true`, counts a screenshot that threw as a visual failure, and writes the catalog atomically.
- Props types written as `x?: 'a' | 'b' | undefined`, `boolean | undefined`, `'aria-label': string`, `interface P extends Base` and `type P = A & {…}` are read in full, and `export const A = …, B = …` catalogues both.
- Same-named components in one package get distinct scenario ids, and `atlas verify` accepts the qualified key (`Card@src/b`) instead of silently picking the first `Card`. Collision-free catalogs are byte-identical.
- Discovery's ignore patterns match relative to the scan root, so a project under e.g. `my.test.app/` is no longer empty.
- `[Pyreon]` framework dev warnings emitted while a scenario mounts or hydrates are recorded as `framework-warning` findings on that scenario instead of printed mid-scan.
- A check that did not run names its real cause — `load-failed` (with the import error) or `mount-disabled` (new `mountDisabledPlugin()`) — and the report no longer prints "not run" twice.
- The scan's embedded Vite runs without HMR/WebSocket and without its own logging (`ATLAS_VITE_LOG=1` restores it), and a project that cannot resolve `@pyreon/core` / `runtime-dom` gets an install command.
- `atlas dev` rescans in a child process (a second in-process scan was 7× slower with false failures and +420 MB), and rescans on saves in every `projects` directory and on `atlas.config.*` edits.

The scan summary now shows these too: `--no-mount` reports its skipped checks as a choice rather than "no plugin claimed this check"; a project that cannot resolve `@pyreon/core` gets the install command instead of a per-file import error; and framework dev warnings raised while scenarios mounted are listed with the scenarios that raised them.
