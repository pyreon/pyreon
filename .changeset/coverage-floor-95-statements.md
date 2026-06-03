---
'@pyreon/compiler': patch
---

Coverage floor: raise `MINIMUM_FLOOR` 94 → 95 (statements) in `scripts/check-coverage.ts`. Every published `@pyreon/*` package now configures `statements ≥ 95` except two documented exemptions: `@pyreon/compiler` (jsx.ts ~3000-line file, long-tail edge-case branches; multi-PR effort) and `@pyreon/styler` (94.83% — 0.17pp gap from styled.tsx WeakMap fallback + SSR hydration paths needing targeted DOM-replay tests). Compiler `vitest.config.ts` now declares `statements: 92` explicitly (matches actual 92.38%). The `MINIMUM_BRANCH_FLOOR` stays at 85% for now — universal 95% branch coverage is multi-week per-package work tracked separately.
