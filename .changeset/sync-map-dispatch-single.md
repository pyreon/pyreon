---
"@pyreon/sync": patch
---

perf: skip the snapshot-array allocation in the single-handler CRDT dispatch path

`observeMapKey`'s dispatch loop snapshotted each changed key's handler set with
`[...set]` before invoking. That runs once per committed CRDT transaction (every
synced-field write, local and remote) — the hottest per-update path in sync — and
the dominant shape is exactly one handler per key (one `syncedSignal` bound to a
key), where there is no sibling to protect and the array is pure garbage.

Fast-path `set.size === 1`: capture the sole handler and fire it, preserving the
snapshot's exact "handlers present at dispatch start" semantics (fires once even
if the handler disposes or re-registers itself mid-dispatch) without allocating.
The `[...set]` snapshot is kept for the multi-handler case, where it protects
against a handler disposing a SIBLING mid-iteration.

Bisect-verified: a naive bare `for (const h of set) h()` fast path fires a sibling
re-registered mid-dispatch and fails the parity spec; the capture does not.
