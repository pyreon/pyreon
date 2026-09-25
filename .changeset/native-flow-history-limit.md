---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

`historyLimit` now works on iOS and Android. The native `PyreonFlowState` engines had a fixed undo depth of 50. They now expose a mutable `historyLimit` with the web clamp: a positive finite value is floored, and anything else means 50. PMTC lowers `createFlow({ historyLimit })` and `flow.config.historyLimit` reads and writes. Before this, the key was dropped with a warning.

The web engine now reads `config.historyLimit` each time it records a checkpoint, the same way it already reads `autoHistory`. A write to `flow.config.historyLimit` therefore takes effect, as it does natively. A lowered limit trims the extra checkpoints on the next push.

Two emit fixes found while testing this:

- Swift `PyreonFlowState(...)` arguments are now emitted in the init's declaration order. Before, a config combining `autoHistory` with `fitViewPadding`, or `connectionRules` with any later key, did not compile.
- A whole-number write to a `Double` Flow config property, such as `flow.config.minZoom = 1`, now compiles on Kotlin.
