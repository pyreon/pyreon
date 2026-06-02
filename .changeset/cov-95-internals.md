---
'@pyreon/ansi': patch
'@pyreon/manifest': patch
'@pyreon/vitest-config': patch
---

Lock coverage thresholds at ≥95% statements / lines on internals tooling packages.
- `ansi`: was reporting 0% (default exclude on `src/**/index.ts`). Set `includeIndexInCoverage: true` + v8-ignore on env-detection branches that need real TTY. Measured 100% statements / 66% branches (env-dep paths).
- `manifest`: 98.73% statements / 90.47% branches — lock thresholds.
- `vitest-config`: 96.92% statements / 77.77% branches — lock thresholds.
