---
'@pyreon/styler': patch
---

Lift node-side coverage to pass its own gate + raise functions / lines to ≥95%. Add 11 tests covering SSR-mode `injectRules` buffering + idempotency, `resetSSRBuffer`, `getStyleRules` return-copy contract, `buildProps` reactive-class-getter merging (3 cases: with generated, generated-only, user-only), and `injectRules` insertRule-throw warn path. Coverage 93.16% → 94.83% statements, 83.55% → 85.11% branches, 93.33% → 97.33% functions, 94.48% → 96.03% lines. Bump thresholds: branches 80 → 85, functions 94 → 95, lines 94 → 95.
