---
'@pyreon/storage': minor
---

`PyreonSecureBackend` (Swift and Kotlin) gains `location`: where a backend persists, when two backend objects can share it. `KeychainSecureBackend` reports its keychain service, `KeystoreSecureBackend` its preferences file and Keystore alias; the default is `nil` / `null` (only that object holds its entries, as for an in-memory store). `@pyreon/auth` uses it to tell which native sessions are the same session. Existing conformers keep compiling: the member has a default.
