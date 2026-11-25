---
'@pyreon/vite-plugin': patch
---

`pyreon({ projectContext: false })` turns off the dev server's `.pyreon/context.json` project map. A tool that runs its own app under the dev server (`atlas dev` roots at the workbench app inside its install) no longer writes a map of itself into `node_modules`.
