---
"@pyreon/reactivity": minor
"@pyreon/core": minor
"@pyreon/runtime-dom": patch
---

refactor(core): owner-based context — replace the global context stack

Context resolution moved from a global mutable `Map[]` stack to an **owner
chain**: each mounted component's `EffectScope` doubles as a context owner
(`_parent` + `_contexts`), linked by the renderer so the chain mirrors the
component tree. `provide()` writes onto the current owner; `useContext()` walks
the owner chain; context is released when the scope is disposed.

This deletes ~190 lines of snapshot / restore / dedup / identity-removal
machinery whose only job was to fake tree-position across deferred mounts
(`<Show>` / `<For>`) — and which was itself the source of the 321k-frame leak,
the position-pop bug, and orphan frames. `@pyreon/core/src/context.ts` shrank
425 → 236 lines, and the entire context-stack bug class is now structurally
impossible.

- **`@pyreon/reactivity`** (minor): `EffectScope` gains `_parent` / `_contexts`
  + `provideContext` / `lookupContext`; new exports `getContextOwner`,
  `setContextOwner`, `runWithContextOwner`.
- **`@pyreon/core`** (minor): `provide` / `useContext` are owner-based
  (owner-first, stack-fallback for SSR + the `*-compat` layers' own
  stack-based provide/inject). The internal `captureContextStack`,
  `restoreContextStack`, and the `ContextSnapshot` type are no longer exported.
- **`@pyreon/runtime-dom`** (patch): `mount` / `hydrate` establish the owner
  chain per component; `mountReactive` captures a single owner reference
  instead of a deduped stack snapshot.

SSR is unchanged — it keeps the request-scoped stack (a synchronous top-down
walk needs no band-aids). `provide` / `useContext` user APIs are unchanged.

Perf (tight A/B vs the stack model): headline component create is neutral
(within noise); the deferred-mount `<Show>` path is ~4% faster (the dedup +
restore work is gone). Verified: ~3,200 unit tests + verify-modes 19/19 + 156
real-Chromium e2e. A latent cross-test context leak (a `RouterContext` frame
bleeding between tests) was exposed and fixed by the per-mount isolation.
