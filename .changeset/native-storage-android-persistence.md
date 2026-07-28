---
'@pyreon/native-compiler': patch
---

`useStorage()` did not persist on Android.

`PyreonStorageRegistry.backend` defaulted to an in-memory map; the docs pointed
at a `DataStoreBackend` for "actual cross-launch persistence"; that class did
not exist anywhere in the repo, and no example app ever assigned the registry.
So the most-used hook in the framework silently lost every value on process
death — on the platform where process death is routine. iOS was unaffected
(`@PyreonAppStorage` is UserDefaults-backed), so the same shared source
persisted there and not here: a parity break that only shows up when you RUN
the app on both platforms.

It looked proven. The Android device gate asserted
`todosPersistAcrossActivityRecreation`, and activity recreation keeps the
PROCESS — so the in-memory map survived it. A green test named "persist" was
measuring the one form of persistence that needs no persistence layer at all.

`FileStorageBackend` (one JSON file under the app's private `filesDir`, atomic
write-then-rename) now installs itself the first time `rememberPyreonStorage`
runs, so a scaffolded app persists with no wiring. It only ever replaces the
UNCONFIGURED in-memory backend: an app that assigned its own store in
`Application.onCreate` keeps it, and the factory is not even constructed in
that case.

The backend layer (interface, in-memory, file, registry, install policy) moved
into a dependency-free file so the Kotlin test gate actually RUNS it —
`rememberPyreonStorage` needs Compose, and modules importing `androidx.*` are
typecheck-only there. "Does a value survive the process" and "does installing a
default clobber the app's own backend" are precisely the questions a typecheck
cannot answer.

Also fixed on the way: `PyreonStorage.kt` was never in any verify list, so it
had never been typechecked by the package's own gates. It is now, along with
the two new modules.

Bisect-verified (three, each restored): removing the remove()-flush →
"removed key must not come back"; removing the install guard → "an app that
chose a backend must keep it"; the codec's escaping has its own
adversarial-string round trip.

Still owed, and stated plainly: no device test asserts survival of real
process death on Android. That is R3, not R4, and the matrix says so.
