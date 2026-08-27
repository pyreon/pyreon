---
'@pyreon/native-compiler': patch
---

The Kotlin `PyreonSizedMap` stub was missing, so a SizedMap emit did not compile

The Swift stub gained it earlier and the Kotlin one never did, so a snippet using
`SizedMap` compiled on one target and not the other. Found by teaching the
multiplatform coverage gate to compile the Kotlin emit, not just the Swift one.
