// PyreonStore — Compose side of @pyreon/store's reactive singleton
// container. v1 (Gap 4 Strategy-B port). Mirror of Swift PyreonStore.
//
// Web shape (same source-level shape for native):
//     const useCounter = defineStore("counter", () => {
//       const count = signal(0)
//       return { count }
//     })
//     useCounter().store.count()
//
// Native v1: PMTC generates a per-store class with `var count by
// mutableStateOf(...)` properties + a static `shared` accessor (via
// Kotlin's `companion object`). This file is the namespace anchor;
// per-store classes are emitted at file scope by PMTC.

package com.pyreon.runtime

/** Marker interface — each PMTC-emitted per-store class implements
 *  it. Documents the relationship; future polymorphic helpers
 *  (subscribe / patch / etc.) hook here. */
interface PyreonStore
