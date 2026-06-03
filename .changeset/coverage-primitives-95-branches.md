---
'@pyreon/primitives': patch
---

Lift branch coverage 93.4% → 95.43%. Added fallback tests for `resolveSpace` / `resolveColor` / `resolveRadius` covering the out-of-range numeric index, unknown semantic name, unknown color token, and unknown radius defensive `?? '0'` / `?? text` paths in `web/tokens.ts`. Bumped vitest `branches: 85 → 95`.
