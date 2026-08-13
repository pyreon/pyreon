---
"@pyreon/sync": minor
---

Ship `@pyreon/sync`'s native ports, and add the `PyreonSyncedSignal` facade.

Two things:

- **Fix: the native CRDT port was built but never published.** Every other
  co-located package lists `native/swift` + `native/kotlin` in its `files`
  array; `@pyreon/sync` did not, so its `PyreonCrdt` port (the LWW-CRDT engine)
  shipped to npm missing — a native app installing `@pyreon/sync` could not
  find it. Added the two entries so the ports actually reach a scaffolded
  iOS/Android app (the `pyreon.native` field was already declared).

- **New: `PyreonSyncedSignal`** — the native `Signal<T>` facade over a shared
  `PyreonCrdtDoc`, the iOS/Android counterpart to `syncedSignal({ doc, key,
  initial })`. Scalar values (`String` / `Double` / `Bool`), local-first
  create-if-missing, and CRDT-backed reactivity: a remote op applied to the doc
  updates the signal's value through the doc observer (so a remote edit repaints
  the UI with no diff). Behaviourally byte-aligned across web/iOS/Android and
  verified by the co-source gate (compiled + run).

The compiler lowering that emits this from a plain `syncedSignal()` call in
shared `.tsx`, and the cross-device WebSocket transport bridge, are the tracked
follow-ups.
