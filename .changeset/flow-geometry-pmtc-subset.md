---
'@pyreon/flow': patch
---

The edge-geometry engine is now expressible in the multiplatform (PMTC)
subset, which is the prerequisite for crossing it to iOS/Android: the five
path builders take NAMED, exported param interfaces (`BezierPathParams`,
`SmoothStepPathParams`, `StepPathParams`, `StraightPathParams`,
`WaypointPathParams`) instead of inline object types, read their fields
explicitly rather than through defaulted destructuring, and
`getHandlePosition` / `getEdgePath` return once instead of per switch case.
Structurally identical types and identical output — a docs win on the web
side, and PMTC warnings over the geometry drop from 10 to 4 (the remaining
four are type-SHAPE issues in the shared types, named in the flow native
route notes).
