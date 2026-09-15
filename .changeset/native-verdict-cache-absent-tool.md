---
'@pyreon/native-compiler': patch
---

The native compile-verdict cache no longer serves or stores a verdict when the compiler is absent (an empty compiler version). A runner without `kotlinc` or `swiftc` now skips as intended instead of reading a stale verdict from a restored cache.
