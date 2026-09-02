---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

`<PlotChart dataZoom>` lowers to native: a pinch (SwiftUI `MagnificationGesture`, Compose `detectTransformGestures`) and a pan drive the engine's fraction window (`zoomWindow` / `panWindow`), the rows are sliced through `sliceRange`, accessors keep their GLOBAL index and `onSelect` reports global indices. `zoom.ts` is rewritten in the crossing subset (`sliceRange` returns a named `SliceRange` computed without `Math.floor` / `Math.ceil`) and crosses into the generated engine; `brushRange` moves to `./brush` (web). The Swift emitter gains a host-state splice: an expression host can register `@State` properties on its component.
