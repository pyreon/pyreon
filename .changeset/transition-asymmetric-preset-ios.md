---
'@pyreon/native-compiler': patch
---

`<Transition>` with separate enter/leave timing (`enterDuration`, `leaveDuration`, `enterEasing`, `leaveEasing`) now keeps its preset on iOS. The Swift emit hard-coded `AnyTransition.opacity` on both sides of `.asymmetric(insertion:removal:)`, so adding `enterDuration` to a `name="slideUp"` or `name="scale"` transition silently turned it into a fade on iOS while Android kept the slide or scale.
