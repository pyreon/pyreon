---
'@pyreon/styler': patch
'@pyreon/ui-core': patch
---

`<PyreonUI>` under `init({ cssVariables: true })` no longer appends a `:root` variables block for every distinct theme. Swapping theme A -> B -> A used to keep showing B, because variable names depend only on the theme path, the last inserted block won, and A's block counted as already injected. The sheet now owns one replaceable root-variables slot (`sheet.setRootVariables(css)`): it is replaced in place on the client, re-applied after `sheet.clearAll()`, kept per request on the server and emitted ahead of every other rule, and no longer goes missing from SSR output after `sheet.clearCache()`.
