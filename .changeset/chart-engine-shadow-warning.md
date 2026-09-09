---
'@pyreon/native-compiler': minor
---

Warn when a user type shadows a generated chart-engine type

PMTC merges the generated chart engine's 137 struct and enum declarations into
any file importing `@pyreon/charts/plot`, and the emit constructs them by BARE
name (`Slice(value:label:)`). A page declaring its own `interface Slice`
therefore shadowed the pie datum's — `invalid redeclaration of 'Slice'` in the
single-file compile gates, a type mismatch at every engine call in a real
two-module app — with no warning at all.

`gen-chart-engine.ts` now publishes `CHART_ENGINE_DECLARED_NAMES` beside the
struct list, from the same parse, and `transform()` names any collision with
the mechanism and the fix. Only TYPES are listed: engine functions can overload
on both targets, and the engine's module constants are emitted `private`, so
warning on either would ask a user to rename working code.
