---
"@pyreon/sync": patch
---

perf: single-observer fast path in the CRDT adapter's commit/op notify

`PyreonCrdtDoc`'s `_notify` (fired per transaction commit) and its op-listener
broadcast both snapshotted their subscriber set with `[...set]` before iterating.
The keyed dispatcher installs exactly ONE observer per map, so that snapshot was
a throwaway array on every commit; one op-listener is likewise the common case.

Fast-path `set.size === 1`: capture the sole subscriber and fire it (matching the
snapshot's "subscribers present at notify start" semantics) without the array allocation.
The `[...set]` snapshot is kept for the multi-subscriber case. Completes the
subscriber-snapshot class fixed in the CRDT dispatcher (#3087).

Bisect-verified: no-op'ing the fast path fails a single-observer fire spec
(`expected +0 to be 1`); the multi-observer snapshot path still fires everyone.

Stated precisely, because the obvious reading is wrong: this is not
zero-allocation. Reading the sole entry via `values().next()` still allocates a
Set iterator plus its result object, and V8 does not escape-analyze those away
(measured in #2973). One allocation of three is removed, not three of three.
