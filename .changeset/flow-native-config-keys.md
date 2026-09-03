---
'@pyreon/native-compiler': patch
'@pyreon/flow': patch
---

`createFlow`'s config takes 17 keys. The native reader took two — `nodes` and `edges` — and the other fifteen lowered to nothing, silently. So `createFlow({ nodes, edges, minZoom: 0.5, maxZoom: 2 })` clamped zoom to 2x on web and 4x on iOS/Android from the same source line: code that compiles, runs, and is simply wrong on one target, with no diagnostic anywhere. The IR's own doc comment acknowledged the gap; nothing surfaced it to the person writing the app.

`minZoom`/`maxZoom` now thread through when written as numeric literals. Both native constructors already accepted them, so the runtime was never the blocker — only the reader was. Kotlin renders them as Double literals, because `maxZoom: 2` emitting `maxZoom = 2` is an "argument type mismatch: actual type is 'Int', but 'Double' was expected", while Swift takes the identical source without complaint — the per-target asymmetry that hides this class until a real Kotlin compile.

Every other key now WARNS by name (`fitView`, `snapToGrid`, `defaultEdgeType`, …), including a `minZoom`/`maxZoom` written as a non-literal, rather than being dropped in silence. Guessing a native equivalent for `snapToGrid` would be worse than saying it does not cross.
