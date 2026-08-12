---
"@pyreon/storage": minor
"@pyreon/native-compiler": minor
"@pyreon/native-runtime-swift": minor
"@pyreon/native-runtime-kotlin": minor
---

Co-locate the @pyreon/storage native runtime.

Moves the storage-specific Swift/Kotlin runtimes (PyreonStorage,
PyreonSecureStorage + the Android impls) out of the monolith into
`@pyreon/storage/native/{swift,kotlin}`. `PyreonStorageBackends.kt` — the
shared persistence primitive (backend interface / registry / file backend /
codec, also used by PyreonCrashReporter) — deliberately STAYS in the base
monolith runtime; the co-located storage group references it via a new
`@base/<File>.kt` companion in the co-source gate.

Gate work (reusable for future batches): `verify-kotlin --files=<set>`
(per-service-group compile) + a companion-suppression filter that drops the
monolith companion append while keeping explicitly-listed `@base/` files;
`check-native-cosource` grows a `pyreon.native.kotlinServices` map (each group
compiles under one `--service` stub bundle) and a `@base/` prefix for
framework-base companions. The `PyreonSecureStorageAndroid` stub service now
also writes the compose-ui LocalContext stub so the whole storage graph
verifies as one group.

The six example apps whose shared source uses `useStorage`/`useSecureStorage`
(finance, router-demo, todomvc × android+ios) gain the co-located storage
source roots. No public API change — a native-source relocation.
