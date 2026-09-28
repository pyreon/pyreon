---
'@pyreon/cli': minor
---

`pyreon upgrade` now runs versioned codemods for the breaking changes an upgrade crosses: every codemod introduced after the project's lowest declared `@pyreon/*` version and at or before the target, oldest first. A dry run lists the files each would change; `--write` applies them; `--json` reports them under `codemods`. The first codemod, `zero-remove-vite-option` (0.52.0), removes the never-read `vite` option from `zero({...})` and keeps its value as a comment.
