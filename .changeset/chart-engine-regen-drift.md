---
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Regenerate the native chart engine so the committed Swift and Kotlin match
their generator again. Three redundant numeric conversions are dropped
(`Double(plot.h)` on two Swift sites, a `.toDouble()` on an already-Double
`Math.abs` in Kotlin); the geometry is unchanged.
