---
'@pyreon/native-cli': patch
---

Derive the androidx import for every `detect*Gestures` detector rather than
enumerating them. The hand-maintained arm covered `detectHorizontalDragGestures`
and neither `detectTapGestures` nor `detectTransformGestures`, so a chart host
emitting a tap handler failed the real Android build with `Unresolved reference
'detectTapGestures'` — invisible to the kotlinc stub gate, which concatenates
its stubs into one compilation unit where a symbol resolves with or without an
import.
