---
'@pyreon/kinetic': patch
---

Internal: drop an unreachable `props ?? {}` fallback in the child-shape helper (every VNode carries a props object) and cover the remaining branch arms, so the package's 98% branch-coverage floor holds again. No behaviour change.
