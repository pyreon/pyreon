---
'@pyreon/native-compiler': patch
---

The native audit (`pyreon doctor --check-native`, MCP `validate`) no longer reports a string enum or a literal numeric enum as `native-unsupported-decl`: PMTC has lowered those since #4146. It now asks the compiler's own enum classifier, so only the enums PMTC cannot lower (mixed string / number members, computed initializers, `declare enum`) are reported, with a fix that says how to make them lower.
