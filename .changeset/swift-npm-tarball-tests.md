---
'@pyreon/native-runtime-swift': patch
'@pyreon/native-router-swift': patch
---

Ship the `Tests/` directory in the npm tarball. Both packages' `Package.swift` declare a `.testTarget`, but `files` omitted `Tests`, so SwiftPM aborted with `target 'PyreonRuntimeTests' has overlapping sources` and consumer Xcode package resolution failed (#3787). The published manifest is now valid as shipped; a new `check-native-tarballs` gate packs the real tarballs and runs `swift package describe` against them.
