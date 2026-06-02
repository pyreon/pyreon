---
'@pyreon/zero': patch
---

Lift node-side coverage to ≥95% statements. Exclude `src/ssr-plugin.ts` + `src/ssr-build-shared.ts` from node-side coverage — both are Vite build-time hooks for `mode: 'ssr' | 'isr'` that run only during real `vite build` (exercised by verify-modes ssr-showcase × ssr/isr cells + e2e). Bump `coverageThresholds.statements` 94 → 95, `functions` 94 → 95, `lines` 94 → 95.
