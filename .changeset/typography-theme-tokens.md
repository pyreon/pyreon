---
'@pyreon/native-compiler': patch
---

Typography theme tokens now lower: `defineTheme` gains `fontSize`/`fontWeight` groups (plural aliases `fontSizes`/`fontWeights`; canonical names mirror `@pyreon/ui-theme`), so `font-size: ${(t) => t.fontSize.display}` in a `styled()` template bakes into `.font(.system(size:))` / `fontSize = N.sp` instead of warn-dropping. Two gaps closed: the groups were absent from the resolver's alias table, and `collectTheme` hand-enumerated color/spacing/radius so app-declared entries in any OTHER group were silently discarded before merge — it now accumulates generically over whatever the theme parser returns.
