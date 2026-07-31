---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
'@pyreon/hooks': minor
---

`useSecureStorage` is real on all three targets — the encrypted secret store
(iOS Keychain / Android Keystore AES-GCM / web in-memory), device-proven.

The sub-capability was three-quarters missing: the PMTC emit was a warn-drop
("deferred v1"), the Kotlin runtime shipped no real backend (in-memory only,
behind an app-injection requirement the compiler could not satisfy), and the
web half did not exist, so the shared import resolved on neither web app.

- **`@pyreon/native-runtime-kotlin`**: `KeystoreSecureBackend(context)` —
  AndroidKeyStore AES-256-GCM over app-private SharedPreferences (no new
  gradle dependency; androidx security-crypto is deprecated and wrapped
  exactly this surface) + a `PyreonSecureStorage(context)` factory, the
  `PyreonDatabase(context)` shape. Fail-closed reads (tampered/undecryptable
  → null).
- **`@pyreon/native-runtime-swift` + `-kotlin` (BREAKING, pre-1.0)**:
  `write` is now KEY-FIRST — `write(key:value:)` / `write(key, value)`. The
  old `write(value, key)` order was a live hazard: both parameters are
  String, so a positional lowering of the natural TS call
  `sec.write('auth', token)` would have compiled with the arguments crossed
  and stored the secret under the wrong key.
- **`@pyreon/native-compiler`**: `useSecureStorage()` lowers on both targets
  (Swift `PyreonSecureStorage()` Keychain default; Kotlin Context-threaded
  Keystore default); method calls emit with Swift labels
  (`write(key:value:)`), making a crossed positional call uncompilable.
  Validate stubs mirror the real key-first surface on both toolchains.
- **`@pyreon/hooks`**: the web `useSecureStorage()` — a module-scoped
  in-memory store (the web has no OS secret store; persisting secrets to
  localStorage would be the exact bug the hook prevents), same key-first
  surface.

Device-proven in router-demo and bisect-verified on both platforms by
swapping the defaults to the in-memory backend: iOS's secret survives a
genuine terminate+relaunch only with the real Keychain; Android's cold
`PyreonSecureStorage(context)` decrypts the UI's write and the raw prefs
value is asserted to be ciphertext, not plaintext (encryption at rest).
