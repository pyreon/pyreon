// PyreonStore — SwiftUI side of @pyreon/store's reactive singleton
// container. v1 (Gap 4 Strategy-B port) supports the most common
// shape: a setup function returning an object literal of signals.
//
// Web shape:
//     const useCounter = defineStore("counter", () => {
//       const count = signal(0)
//       return { count }
//     })
//
//     useCounter().store.count()         // read
//     useCounter().store.count.set(5)    // write — deferred to v2
//
// Native v1 emits a per-store singleton class extending this base
// pattern. PMTC generates a `PyreonStore_counter` class with @Observable
// properties for each signal, plus a static `shared` accessor for
// singleton lifecycle.
//
// This file exists as the SHARED base concept and namespace anchor.
// The actual per-store classes are emitted by PMTC at module scope
// (mirror of how enums + structs already emit at module scope today).
//
// ## v1 scope
//
// - Setup body: ONLY `const X = signal(...)` declarations
// - Returned object: ONLY shorthand keys `{ x, y, z }` matching
//   local signal names
// - Use-site shape: `useStoreName().store.signalName()` (read) +
//   `useStoreName().store.signalName.set(v)` (write); the
//   `useStoreName().store` chain is parsed and rewritten as a single
//   pattern, so the `store` indirection works end-to-end without
//   diverging from web source syntax
//
// ## v2+ deferred
//
// - Computeds in setup body
// - Methods in setup body
// - `patch({ ... })` batched updates
// - `subscribe(listener)` watchers
// - Destructure use form `const { store, patch } = useStoreName()`

import Foundation
import Observation

/// Marker protocol — each PMTC-emitted per-store class conforms so
/// the type relationship is documented + future polymorphic helpers
/// have a hook.
@available(iOS 17.0, macOS 14.0, *)
public protocol PyreonStoreProtocol: AnyObject {}
