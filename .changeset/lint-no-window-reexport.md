---
'@pyreon/lint': patch
---

`no-window-in-ssr` no longer reports an export specifier whose name spells a browser global (`export { location } from './x'`, `export * as window from './x'`). A specifier always names a module binding, never the global.
