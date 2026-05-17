---
'@pyreon/react-compat': minor
'@pyreon/vue-compat': minor
'@pyreon/solid-compat': minor
---

compat: close genuine missing-by-omission public APIs (near-full parity)

Audited the four compat layers (unit 770 → 804, browser smoke 4/4, e2e
compat-layers 12/12 all green). Added the commonly-used public APIs that
were missing by omission (not the intentional documented limitations like
React class setState or Vue Options API):

- **react-compat**: `useOptimistic` (React 19) — passthrough reduced
  through pending optimistic actions; overlay clears when `passthrough`
  changes (the non-concurrent-mode equivalent of React discarding
  optimistic state when the action settles).
- **vue-compat**: `Transition`, `TransitionGroup` (← @pyreon/runtime-dom),
  `Suspense` (← @pyreon/core), `getCurrentInstance`, `useSlots`,
  `useAttrs`; `KeepAlive` upgraded from a no-op stub to wrap the real
  @pyreon/runtime-dom `KeepAlive`.
- **solid-compat**: `Dynamic`, `Portal` (← @pyreon/core), `render` /
  `hydrate` (← @pyreon/runtime-dom mount/hydrateRoot), `MountableElement`.

All additions map onto existing Pyreon primitives (no new deps), ship
with JSDoc `@example` + tests, and honestly document their compat
limitations in the JSDoc and docs pages. Backward-compatible.
