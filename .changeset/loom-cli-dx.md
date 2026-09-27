---
'@pyreon/loom': patch
'@pyreon/zero': patch
---

`loom` now fails loudly where it used to give a wrong answer.

- A scan that finds no workspace packages exits 1 instead of reporting "fabric clean". Run from inside a member package, the error names the workspace root to scan instead.
- Unknown or misspelled flags and `loom` config keys are errors with a did-you-mean. Options accept `--out site` as well as `--out=site`; before, the spaced form was read as the directory argument.
- `--port` is validated. Without it, `loom dev` uses 5230 or the next free port instead of failing.
- `loom dev` reports with the same settings `loom scan` resolves from `pyreon.config.*`, shows an error page when a rescan fails, and keeps its own Vite dependency cache so it no longer invalidates the project's.
- `loom build` writes to `<dir>/loom-dist` by default, prints one line, and no longer ships `.vite/` or `_pyreon-ssg-paths.json`.
- Added `--version` and `loom <command> --help`; the help now documents `dev` and `--port`. `loom scan | head` no longer prints an EPIPE stack trace.

In `@pyreon/zero`, informational build output (the prerender line, the route-mode table, the build summary) now goes through Vite's logger and respects `logLevel`. The SSG server bundle's chunks use `.mjs` like its entry, so Node no longer asks you to add `"type": "module"` to your own `package.json`.
