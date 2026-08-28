---
'@pyreon/native-compiler': patch
---

`<Audio>` is now exercised by a gated native example, and a new
`check-native-primitive-coverage` gate fails if any primitive drops back out of
that set.

A primitive no example uses is one the device gates never compile, and the
device gates are the only configuration without stubs. `<Audio>` was the single
primitive in that position, and it turned out to be the single primitive that
had never compiled on either platform.
