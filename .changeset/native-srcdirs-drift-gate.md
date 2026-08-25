---
'@pyreon/native-cli': patch
---

Gate an example's Gradle srcDirs against what `pyreon-native wire` resolves

The CLI resolves native co-source by walking an app's dependencies — the
mechanism a scaffolded consumer app uses. The repo's own examples instead
hardcode a `srcDir(...)` list, so the two can drift, and **no gate ran `wire` at
all**: the path consumers depend on shipped unproven.

Drift in the missing direction fails a real `gradle assembleDebug` with an
unresolved reference, which no stub, unit test or coverage check can see — that
happened for real with `PyreonSizedMap` and `PyreonCrdtDoc`, ~50 minutes into CI.

The new gate found drift in the other direction immediately: seven stale
`srcDir`s across two examples, for packages those apps no longer import or
declare. Removed.
