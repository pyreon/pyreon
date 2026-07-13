---
"@pyreon/lint": patch
---

Restore `@pyreon/lint` to its 95% statement-coverage floor (the
`no-unbatched-updates` hardening in the previous release added an uncovered
`isNonSignalSetCall` branch). Behavior-preserving: simplified the
`isNonSignalSetCall` receiver guard to optional chaining (the `!obj` early
return was unreachable — the helper only runs after `isSetCall` proves a member
callee) and added behavioral tests for the inline `new Map().set()` receiver
plus the `maxPathSets` counting across sequence / labeled-loop / else-early-return
branches. No rule behavior change.
