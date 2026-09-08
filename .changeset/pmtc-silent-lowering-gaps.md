---
'@pyreon/native-compiler': minor
'@pyreon/flow': minor
---

PMTC: four shapes that lowered to invalid Swift/Kotlin with no warning

All four were found by generating `@pyreon/flow`'s edge geometry and then
COMPILING the result — which the generator's own "zero warnings" precondition
had reported as clean. Every new spec runs the real `swiftc` and `kotlinc`
rather than asserting on the emitted string alone.

- `a?.b?.filter(…)` dropped its second link on both targets, so a method call
  landed on an optional receiver.
- `if (nullableObject)` emitted the bare optional as a Swift condition. It now
  binds (`if let x`). Kotlin was already correct.
- `return 'bottom'` where the return type is an enum emitted a raw string on
  both targets. (The comparison position was fixed separately.)
- A Swift enum is now declared `Codable`, so a struct holding an enum-typed
  field conforms. The old failure named the struct and pointed nowhere near the
  enum that caused it.

A fifth shape — a function returning an ANONYMOUS object — now WARNS on Kotlin
instead of emitting two different data classes and returning the wrong one. The
remedy is a one-line source fix, so `@pyreon/flow` takes it: the return types of
`getSmartHandlePositions` and `getFloatingEndpoints` are the newly exported
`SmartHandlePositions`, `NodeBoxDimensions` and `FloatingEndpoints`.
