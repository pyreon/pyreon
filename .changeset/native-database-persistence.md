---
'@pyreon/native-compiler': patch
---

`useDatabase()` did not persist — on either platform.

Both native runtimes' `PyreonDatabase` defaulted to an in-memory backend, and
the compiler emit constructed exactly that default. An app that inserted
records and relaunched found them gone: no warning, no error, nothing failing.
The entire reason `useDatabase` exists over `useStorage` is structured data
that OUTLIVES the process, so an ephemeral default was not a conservative
starting point — it was silent data loss wearing the word "default".

`FileDatabaseBackend` is now the default on both platforms — one JSON file per
collection, written atomically, under `Application Support` (iOS) / the app's
private `filesDir` (Android). The Kotlin emit threads `LocalContext.current`
into the constructor, because Android cannot resolve app-private storage
without a `Context`; Swift needs no equivalent, since Foundation resolves
Application Support unaided. The spelling is asymmetric on purpose (Swift's
no-arg initialiser IS the persistent one; Kotlin has no no-arg form at all, so
the shortest thing you can write can no longer be the one that loses data), and
the on-disk bytes are identical — locked by a cross-language format test that
asserts the same string from Swift's `JSONSerialization` and Kotlin's
hand-written codec.

Foundation/JVM-only, no SQLite: a record is an id plus string fields, and a
SQLite module map differs between Apple platforms and Linux — the toolchain
split that has broken this runtime's CI before. Apps that outgrow the file
store inject Room / SQLDelight / Core Data through the same constructor.

Failure is non-fatal: a corrupt file reads as an empty collection and a failed
write is dropped after `onError`. Collection names are percent-encoded before
touching a path, so an app-supplied `"../escape"` cannot leave the store
directory.

Behaviour changes worth knowing: `PyreonDatabase()` on Swift now persists (it
previously did not), and Kotlin's `PyreonDatabase()` no longer exists — pass a
`Context`, an `InMemoryDatabaseBackend()`, or your own backend. Tests that
want no filesystem should pass `InMemoryDatabaseBackend()` explicitly.

Bisect-verified. Still open, and stated plainly: no device-gated app renders
FROM the database yet, so the capability's matrix row moves R2 → R3, not R4.
