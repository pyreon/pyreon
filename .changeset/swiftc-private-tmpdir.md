---
'@pyreon/native-compiler': patch
---

Swift validation no longer leaves an empty `TemporaryDirectory.*` folder in the shared temp directory on every `swiftc` call. Each Swift toolchain spawn now gets a private `TMPDIR` that is removed when the process exits.
