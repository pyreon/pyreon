---
'@pyreon/reactivity': minor
'@pyreon/runtime-dom': minor
---

feat(reactivity): "why did this update?" — source-anchored causal traces

`getUpdateCause(nodeId)` + `formatUpdateCause(cause)` reconstruct the exact causal chain that led to a reactive node's most recent update, at the source line — the thing React DevTools' whole-component "why did this render?" can't do. Pyreon can, because it holds both a precise dependency graph and a timestamped fire timeline.

```text
Why did effect#4 (effect) update?
  qty (signal) changed  src/Cart.tsx:7:13
  → total (derived) recomputed  src/Cart.tsx:9:9
  → effect#4 (effect) ran   ← explained
```

`getUpdateCause` returns `{ target, chain, rootReached }` — `chain` is root-first (`chain[0]` is the originating signal write), each `CauseLink` carries `{ id, kind, name, loc, ts }`. Also surfaced on `window.__PYREON_DEVTOOLS__.reactive.getUpdateCause` / `.formatUpdateCause`.

**Zero hot-path cost** — purely read-time reconstruction over the existing `getReactiveGraph()` + `getReactiveFires()`. The dependency graph is the causal structure (not the fire timeline: a lazy computed recomputes DURING its subscriber's read, so temporal order ≠ causal order); reconstruction walks the graph from the target through the deps that fired in the same synchronous cascade. Exact for a synchronous update, best-effort across interleaved interactions, `rootReached: false` when earlier fires aged out of the ring buffer. Dev/test only (the registry is tree-shaken in production).
