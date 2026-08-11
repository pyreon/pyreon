---
"@pyreon/sync": patch
---

Two hot-path optimizations, each locked by new bench cells in `scripts/bench/core/sync.ts`:

- `syncedText.set` no longer re-materializes the whole document (`ytext.toString()`, an O(docLen) tree walk + allocation) to compute `prev` on every keystroke — it reads the base signal's mirror (`base.peek()`), which the Y.Text observer already materialized at the last transaction end. Guarded: falls back to `toString()` inside an outer `doc.transact` (observers deferred), during the observer/cleanup phase (a sibling observer may run before ours), and after `dispose()` (observer detached) — the three windows where the mirror premise does not hold, each locked by a premise test.
- The WebSocket transport's inbound handler now decodes + applies already-binary frames (ArrayBuffer / Node Buffer — every frame in practice, since the transport sets `binaryType = 'arraybuffer'`) synchronously via the new `toBytesSync` fast path, removing a promise allocation + microtask hop per remote op; Blob / fragmented frames keep the async normalization.
