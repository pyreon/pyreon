---
'@pyreon/native-runtime-swift': patch
'@pyreon/native-router-swift': patch
---

The `build`, `test` and `typecheck` scripts run SwiftPM through the repo's `scripts/swift-package.ts`, which gives each `swift` run a private `TMPDIR` and deletes it afterwards, so a workspace install no longer leaves `TemporaryDirectory.*` folders in the shared temp directory. No change to the shipped Swift sources.
