---
'@pyreon/kinetic': patch
---

Lift node-side coverage to ≥95% statements / ≥90% branches. Measured 98.24% statements / 90.82% branches / 95.34% functions / 98.67% lines — already above targets. Bump `coverageThresholds.branches` 80 → 90, `functions` 94 → 95, `lines` 94 → 95. **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets all floors.
