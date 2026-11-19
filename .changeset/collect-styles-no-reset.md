---
'@pyreon/server': patch
'@pyreon/styler': patch
---

Documentation fix: the `createHandler({ collectStyles })` example, the styler README and docs, and the `sheet.reset()` doc comment told you to call `sheet.reset()` between server requests. That drops the module-level `keyframes` and static `createGlobalStyle` rules from every later response, because they are inserted once, when their module evaluates. Per-request isolation is already automatic: `runWithRequestContext` gives every request its own styler scope. The docs now say to omit `collectStyles` (the default collector is correct) or to use `(nonce) => sheet.getStyleTag(nonce)`, and that `reset()` is only for tests and teardown. There is no runtime change.
