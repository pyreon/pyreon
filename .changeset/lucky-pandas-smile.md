---
'@pyreon/reactivity': patch
---

`createSelector().subscribe()` — unsubscribe without touching the map

The `.subscribe()` channel is the compiler-emitted fast path for a `<For>` row's
reactive class, so its dispose path runs once per row on every list teardown. It
was `boundSubs.get(value)` + `boundSubs.delete(value)`: two hashed map operations
per row.

The map value is now a holder the disposer closes over, so unsubscribing writes
one field and touches no map, and the last unsubscribe drops the whole map in one
`clear()`. Dead holders are reclaimed on insertion, matching the amortisation the
tracked channel already used.

Measured on the 1000-row krausest shape in real Chromium: `clear rows` 140µs →
125µs (framework overhead over vanilla 60µs → 35µs), with the JS-side clear path
78.7µs → 60.7µs. Costs one small object per live subscribed key (148.8 → 180.8
B/key), fully reclaimed on teardown. No API change.
