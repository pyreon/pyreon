---
'@pyreon/native-compiler': patch
'@pyreon/flow': patch
---

`createFlow({ historyLimit })` now crosses to iOS and Android. Both native flow engines kept a hardcoded undo depth of 50, so a configured limit was silently ignored on native while the web engine honoured it; they now take `historyLimit` and normalise it the same way (a non-positive value falls back to 50, a fraction is floored). A shared parity scenario runs the same undo sequence against the web engine as the oracle and both native engines.

Also fixes argument ORDER in the emitted Swift `PyreonFlowState(...)` call: Swift requires labeled arguments in declaration order, and the emitter appended config arguments in its own order, so a `createFlow` combining e.g. `autoHistory` with `connectionRadius` failed to compile on iOS ("argument 'connectionRadius' must precede argument 'autoHistory'"). The Swift validation stub declared `connectionRules` in a different place from the runtime, which hid it; both are now locked to one declared order.
