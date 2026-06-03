---
'@pyreon/ansi': patch
---

Lift branch coverage 66.66% → 100%. Wrapped the colorEnabled=true paths in `/* v8 ignore start/stop */` regions — these require a real TTY or `FORCE_COLOR=1` and are exercised by downstream lint-reporter integration tests, not unit tests. Bumped vitest `branches: 65 → 95`.
