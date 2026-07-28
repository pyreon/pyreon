---
'@pyreon/native-compiler': patch
---

`useDatabase` reaches R4 on iOS — a record that survives a real relaunch.

The shared counter source gains a `useDatabase()` store, a Save Note button,
and a rendered count; the iOS XCUITest taps Save, asserts the count advanced by
one (so `db.insert` ran on-device and the record landed), then TERMINATES the
app, relaunches, and asserts the count survived. On the relaunched process
`onMount`'s `db.count()` is the only source of that number, so an in-memory
backend renders 0 — bisect-verified: reverting the Swift default to
`InMemoryDatabaseBackend` fails with `("0") is not equal to ("1") — the
database is not persisting`.

The assertion is RELATIVE to the count at launch, never absolute: the Simulator
keeps the app container between test runs, so the store legitimately
accumulates records. An absolute `Notes: 1` would pass once and fail forever
after — the classic way a persistence test gets deleted instead of fixed.

The Android counter compiles from the SAME shared source, so its instrumented
test asserts the WRITE path on an emulator: tap → the rendered count advances,
proving the emit compiles, `PyreonDatabase(LocalContext.current)` resolved a
real file-backed store, the record landed, and `db.count` read it back. That is
the half that never compiled. A second Android test then proves DURABILITY: a
freshly-constructed `PyreonDatabase` over the app's own `filesDir` reads what
the UI just wrote, and a fresh instance carries no in-memory state, so the
record demonstrably came off the device's disk — eliminating the cache
explanation the previous Android "persistence" assertion could not.

The remaining delta versus iOS is narrow and named rather than glossed:
AndroidJUnitRunner executes instrumented tests INSIDE the app process, so an
`am force-stop` would kill the test runner along with the app. The cold-LAUNCH
`onMount` re-read is therefore iOS-only; the disk round trip — the part that
was actually broken — is covered on both.

Matrix: Storage 0.3 → 0.45, with the Android scope written into the row rather
than rounded away.

The headline moves ≈52% → ≈50%, DOWN, because the same pass added a
`Styling & design system` row (weight 6, R4 fraction 0.0) that had been missing
entirely. The whole `styled` / `elements` / `coolgrid` / `attrs` / rocketstyle /
theme-token surface lowers to both targets and is documented as supported — yet
no native example instantiates any of it and no device test asserts a rendered
style. Omitting a track a real app leans on heavily made every percentage on
that page flattering rather than true, and the table is supposed to BE the
denominator. The drop is a correction to the measurement, not a regression in
the product.
