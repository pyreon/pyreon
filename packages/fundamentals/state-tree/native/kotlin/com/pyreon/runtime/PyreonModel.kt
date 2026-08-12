// PyreonModel — Compose side of @pyreon/state-tree's reactive model
// container. v1 (Gap 4 Strategy-B port) supports the most common
// shape: a model with literal initial state.
//
// Web shape:
//     const Counter = model({ state: { count: 0 } })
//     const counter = Counter.create()
//
//     counter.count          // reactive read
//
// Native v1 emits a per-model singleton class extending this base
// pattern. PMTC generates a `PyreonModel_Counter` class with
// `mutableStateOf`-backed properties for each state field, plus a
// factory `create()` matching the web .create() API.
//
// This file exists as the SHARED base concept and namespace anchor.
// The actual per-model classes are emitted by PMTC at module scope
// (mirror of how PyreonStore + PyreonMachine emit at module scope
// today).
//
// ## v1 scope
//
// - Definition shape: `model({ state: { <literal>: <value>, ... } })`
// - Instantiation: `.create()` (no-arg form using the literal default state)
// - Field reads: `instance.field` (reactive via mutableStateOf delegate)
// - String, number, boolean state values
//
// ## v2+ deferred (each its own PR)
//
// - `actions: { methodName() { ... } }` — action methods that mutate state
// - `views: { viewName() { ... } }` — derived/computed accessors
// - `.create(initialOverride)` — passing custom initial state
// - `.asHook(id)` — singleton hook form
// - `getSnapshot(instance)` / `applySnapshot(...)` — serialization
// - `onPatch(...)` / `applyPatch(...)` — record/replay middleware
// - Nested model composition

package com.pyreon.runtime

/**
 * Marker interface — each PMTC-emitted per-model class implements so
 * the type relationship is documented + future polymorphic helpers
 * have a hook.
 */
public interface PyreonModelProtocol
