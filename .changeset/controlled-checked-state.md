---
"@pyreon/runtime-dom": patch
"@pyreon/compiler": patch
---

Fix controlled checkbox and radio inputs rendered through `h()` so signal resets update live checked state after user interaction. Preserve the initial form-reset default and honor explicit `defaultChecked` props. Add guidance for diagnosing stale controlled input state.
