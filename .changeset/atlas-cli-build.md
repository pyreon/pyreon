---
'@pyreon/atlas': patch
---

`atlas` refuses what it used to get wrong in silence, and `atlas build` ships a production site a fraction of the size.

- `atlas build --out <dir>` no longer empties a directory it did not write. `--out .` deleted the project and `--out src` replaced the components with the site. The project, the source directory, and any non-empty directory without the `.atlas-build-output` marker are now refused before anything is touched.
- `atlas build` output: each component's baked Docs source and Lens answer is a small JSON file under `_atlas/rpc/`, fetched on demand, instead of 1.4 MB of inline script copied into every page. On `ui-components` the site went from about 149 MB to 4.2 MB and each page from 1.4 MB to 4.5 KB. File paths in it are project-relative. The site is now a production build; it had inherited `NODE_ENV=development` from the scan, which shipped the dev build and a 266 ms boot task.
- Unknown options are errors with a did-you-mean on every command; before, `atlas scan --json` printed text and a typo'd `--outt` built into the default location. `--dir` now works as documented, and surplus arguments (`atlas verify Button app`) are rejected with a pointer to `--cwd`.
- `atlas scan --json` prints one JSON document. A component whose module fails to load makes `scan` exit non-zero instead of 0.
- `atlas verify <Component> --check` compares against that component's slice of the baseline, so a catalog of two or more components no longer always reads as regressed; `--check --json` ratchets instead of silently skipping; a "REGRESSED" verdict names removed scenarios.
- `atlas dev` falls back to the next free port unless `--port` is given, validates `--port`, and keeps its own Vite dependency cache, so it no longer makes the project's own dev server re-optimize.
- Added `--version` and `atlas <command> --help`. `atlas init`'s template suggests `h()` instead of JSX, which a `.ts` config cannot parse. The help documents `--dir`, `--port`, `--cwd` and the real `verify` shape.
