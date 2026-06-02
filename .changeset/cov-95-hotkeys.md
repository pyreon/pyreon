---
'@pyreon/hotkeys': patch
---

Lift node-side coverage to ≥95% statements. Add 4 edge-case tests: `mod` → ctrl on non-Mac (line 46 in `parse.ts`), `mod` → meta on Mac, empty-string + whitespace-only shortcuts both throw (line 194 in `registry.ts`). Bump `coverageThresholds` 94 → 95.
