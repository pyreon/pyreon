---
'@pyreon/ui-core': patch
---

Lift node-side coverage to ≥95% statements / ≥90% branches. Add 14 tests covering `isPyreonComponent` (Tier 1 framework markers + Tier 2 naming convention, all branches) and `resolveSlot` (static atoms, null, reactive accessor, marked component). Bump `coverageThresholds.statements` 94 → 95, add `branches: 90`, `lines` 94 → 95.
