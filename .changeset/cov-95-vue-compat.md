---
'@pyreon/vue-compat': patch
---

Lift node-side coverage to ≥95% statements / ≥85% branches. Add 9 tests covering computed() with `{get, set}` setter (inside + outside component), reactive() proxy `set` / `deleteProperty` trap firing scheduleRerender, readonly() / shallowReadonly() write + delete throw. Bump `coverageThresholds.statements` 94 → 95, `branches` 84 → 85. **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets both floors.
