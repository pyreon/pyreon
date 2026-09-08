---
'@pyreon/flow': minor
'@pyreon/native-compiler': minor
---

Flow: the edge geometry becomes crossable to Swift/Kotlin — markers split out, handle anchoring lifted into the PMTC subset, and two compiler misclassifications fixed

Measured with the real PMTC transform, the geometry bundle went from **19
warnings on each target to 1** (the last is a dev-only diagnostic, which has no
native meaning). Three changes got it there:

- `edges.ts` was two things: pure geometry, and arrowhead resolution for the SVG
  `<defs>` block. The second is web-only work and accounted for 8 of the 19
  warnings on its own — it reaches for `typeof`, a regex, the `in` operator and
  a `Map` with a non-scalar value. It now lives in `markers.ts`. No API change:
  every symbol is still exported from the package root.

- `resolveHandleAnchor`'s two inner arrows are now top-level functions, and its
  return type is the named `HandleAnchor` (newly exported). This is a bug fix,
  not only a shape change: the native emit was **silently dropping** the spread
  in `{ ...getHandlePosition(…), position }`, so the compiled geometry would
  have returned an anchor with no coordinates, with no warning.

- Two PMTC classification fixes, each of which made a pure helper emit as a
  view — whose top-level `if` statements are DROPPED, i.e. the logic gutted. A
  parameter typed with a locally-declared string-literal union warned that its
  props type was unresolvable (it lowers to a native enum, so it resolves
  fine), and a helper whose last statement is `return null` was classified by
  the value it returns when its return ANNOTATION had already stated its kind.
