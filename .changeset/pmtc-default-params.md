---
'@pyreon/native-compiler': minor
---

Defaulted helper parameters (`places: number = 0`) cross as native default
parameters — Swift and Kotlin both have them, so nothing is desugared.
Previously the parameter silently VANISHED from the emitted signature while
the body kept reading it (`func currency(_ symbol: String)` with `places`
unresolved inside — the chart engine's formatter shapes). Call sites omit,
partially supply, or fully supply, all verbatim.
