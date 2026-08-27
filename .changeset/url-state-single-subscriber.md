---
"@pyreon/url-state": patch
---

perf: skip the snapshot-array allocation in the single-subscriber notify path

`notifyKey` fires on every URL change (navigation, back/forward, `.set()`) and
snapshotted each key's subscriber set with `[...set]` before iterating. The
dominant shape is one `useUrlState` bound to a given key, where there is no
sibling to protect and the array is pure garbage on every notify.

Fast-path `set.size === 1`: capture the sole subscriber and fire it — still
honouring the `except` filter (the writer must not be re-notified) — with no
allocation. The `[...set]` snapshot is kept for the multi-subscriber case, where
it protects against a re-read creating/disposing a sibling mid-iteration. Same
pattern as `@pyreon/sync`'s CRDT dispatch (#3087).

Bisect-verified: dropping the fast path's `except` check re-notifies the writer
(`expected 1 to be +0`).
