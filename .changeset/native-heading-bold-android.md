---
'@pyreon/native-compiler': patch
'@pyreon/primitives': patch
---

`<Heading>` is bold on Android, as it already was on the web and iOS. PMTC lowered it to a Material 2 typography role (`h4`, `h5`, …), and most of those roles are regular weight, so every Android heading rendered regular. The Compose emit now adds `fontWeight = FontWeight.Bold` at every level. The `@pyreon/primitives` docs for `<Heading>` now name the real Android mapping (they named Material 3 roles the emit does not use).
