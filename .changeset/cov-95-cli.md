---
'@pyreon/cli': patch
---

Lift node-side coverage to ≥95% statements / ≥85% branches. Export `_mapLintSeverity` from `doctor/gates/lint.ts` for unit testing; add 8 targeted tests covering severity mapping, distribution gate package-discovery edge cases (no packages/ dir, malformed package.json, non-string name, private packages), and doctor's `--check-islands` + `--check-ssg` legacy flag mapping + non-`ci` exit code path. Bump thresholds: statements 94 → 95, branches 80 → 85, functions 94 → 95, lines 94 → 95. **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets all floors.
