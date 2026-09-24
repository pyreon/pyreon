---
'@pyreon/state-tree': minor
'@pyreon/store': minor
---

**@pyreon/state-tree**

- Replacing a field-nested model (`app.profile.set(Profile.create())`) now rewires patch/snapshot propagation: the new child's writes reach the parent's `onPatch` / `onSnapshot` / `getSnapshot`, and the detached old child can no longer emit phantom `/profile/...` patches on its former parent. `destroy(parent)` tears down exactly the children currently held.
- `applyPatch` over a model-typed field reconciles the snapshot into the live instance instead of writing a plain object over it, so replaying recorded patches (undo/redo, time-travel, sync) no longer breaks with `profile().name is not a function`.
- A node removed from its parent (array/object container removal, field replacement, overwriting a bare model in a plain field) now has its parent pointer cleared — `getParent` / `getRoot` / `getPath` no longer report a stale ancestor. A node moved to another parent keeps its new parent.
- Schema-mode `reset()` deep-clones its baseline with `structuredClone` instead of a JSON round-trip: `Date`, `Map`, `Set`, `bigint` and `undefined` fields now reset correctly (bigint used to throw).
- `applySnapshot` with `null` for a nested-model key writes `null` instead of throwing a `TypeError`; a non-object top-level snapshot throws a `[Pyreon]` error.
- **Behaviour change:** every error message now uses the `[Pyreon] state-tree <fn>:` prefix; the remaining `[@pyreon/state-tree]` messages (`onPatch`, `applyPatch`, `getSnapshot`, `applySnapshot`, `addMiddleware`) changed. Code matching on the old text must update.

**@pyreon/store**

- New per-store SSR opt-out: `defineStore(id, setup, { ssr: false })` (schema stores: `ssr: false` in the config). Such a store is never serialized into the page's `window.__PYREON_STORE_STATE__`, and on the client it ignores any server snapshot. Use it for sessions, tokens and other user-private state.
- `api.dispose()` only removes the registry entry while it still belongs to that instance — a stale handle disposed after `resetStore(id)` + re-create no longer evicts the new, live store.
- SSR hydration reads only OWN keys of the snapshot, so a store id such as `valueOf` / `toString` is no longer "seeded" from `Object.prototype` (which threw).
- **Behaviour change:** `reset()` with `subscribe()` listeners emits ONE `patch` mutation carrying every changed field instead of one `direct` notification per field.
- `addStorePlugin(plugin)` now returns an unregister function (idempotent).
