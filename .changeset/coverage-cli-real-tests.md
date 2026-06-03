---
"@pyreon/cli": patch
---

test(cli): add 17 real tests for doctor render + check-dedup gates

17 new tests in `branch-coverage-real.test.ts` covering:
- `renderText` finding-location branch matrix (no location / path only / line only / line+column / relPath / relatedLocations / fix suggestion)
- severity icon rendering (error/warning/info)
- clean state (no findings) + multiple-gates rendering
- `runDocClaimsGate` graceful handling of missing CLAUDE.md
- `runCheckDedupGate` graceful handling of missing lockfiles
- `_parseBunLock`/`_parseNpmLock`/`_parsePnpmLock` minimal-lockfile parsing
- `_detectDuplicates` find vs empty matrix

Branches lifted 85.28% → 86.28%. Incremental real-test coverage on the doctor render layer and check-dedup gate.
