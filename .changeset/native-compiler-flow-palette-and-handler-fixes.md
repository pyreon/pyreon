---
"@pyreon/native-compiler": patch
---

Flow chrome lowering stops baking light-only colours: `<Background>` without `color` and `<MiniMap>` without a static `nodeColor` now emit `nil`/`null` so the renderer's palette decides per colour mode, and a `<Flow colorMode>` with `<Panel>` overlays wraps the stacked overlays in the same scoped colour mode. Two bugs found on the way are fixed: a block-bodied handler holding a SINGLE assignment (`() => { flow.config.reducedMotion = false }`) emitted an empty closure on both targets (the two-statement spelling worked), and a `defineStore` id that is not an identifier (`'native-flow-probe'`) emitted a class name neither compiler parses — ids are sanitised to identifiers. A flow listener subscriber that ignores its argument (`flow.onConnectStart(() => …)`) emitted a zero-parameter Swift closure where the port's callback takes one, so the same source built on Android and failed on iOS; it now emits `{ _ in … }`.
