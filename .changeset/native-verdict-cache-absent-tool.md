---
'@pyreon/native-compiler': patch
---

An absent `swiftc` or `kotlinc` now always skips validation instead of being answered by a stored verdict from a restored cache. The skip check runs before the verdict cache in every validator, matching `validateSwiftWithStubs`.
