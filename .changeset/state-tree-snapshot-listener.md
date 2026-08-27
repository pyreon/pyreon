---
"@pyreon/state-tree": patch
---

perf: single-listener fast path in the snapshot-notify microtask

The coalesced snapshot-notify microtask snapshotted `meta.snapshotListeners` with
`[...]` before iterating, even though the common shape is one `onSnapshot(model,
fn)`. (The sibling `patchListeners` loop already iterates the live set directly.)

Fast-path `size === 1`: capture the sole listener and fire it (matching the
snapshot's "listeners present at notify start" semantics) with no allocation. The
`[...]` snapshot is kept for the multi-listener case. Completes the
subscriber-snapshot class across `@pyreon/sync` (#3087, #3099) and
`@pyreon/url-state` (#3098).

Bisect-verified: no-op'ing the fast path fails a single-listener fire spec
(`expected +0 to be 1`).
