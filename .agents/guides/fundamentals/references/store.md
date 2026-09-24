# @pyreon/store

- `defineStore(id, setup)`: a singleton per id. Setup returns are classified (signals → state, functions → actions). `StoreApi<T>`: `.store`, `.state`, `patch()`, `subscribe()`, `onAction()`, `reset()`, `dispose()`. Type helpers `StoreState`/`StoreActions`.
- `setup()` runs in a store-owned `effectScope`. Its computeds and effects belong to the store, not to the component that first created it, so that component's unmount cannot freeze them. `dispose()` stops the scope. A plugin may return a cleanup that runs on `dispose()`.
- `patch()` hot path:
  - With no subscribers, the object form writes the field signals directly.
  - With subscribers, it suspends each patched field's own change detector during its write (`@pyreon/reactivity` `_suspendSoleSubscriber`, falling back per listener when the detectors were re-wired mid-patch), then emits one mutation. A re-entrant write from an effect during the drain is merged into the same notification.
  - The suspend/resume window is exception-safe: read `arg[key]` before suspending, resume in `finally`, and reset the in-progress flag and flush events in `finally` (`src/tests/patch-exception-safety.test.ts`).
  - Per-field `store.x.set()` is the fastest write path.
- Dev warnings: unknown patch keys; redefining an id with a different setup (the HMR stale shape).
- Persistence is composition: return `useStorage()` signals from setup. A store family is a derived id (`` defineStore(`doc:${id}`) ``) with manual lifecycle.
- Schema overload `defineStore(id, { schema, initial, setup? })`: the schema is a `@pyreon/validation` adapter or any raw Standard Schema (zod, valibot, arktype). Every write is validated, and `SchemaStoreApi` is typed through `InferSchema<S>` (`_infer` for an adapter, else `~standard.types.output`), so `state`, `set`, `patch`, `deepPatch` and `update(key, fn)` are typed without annotations.
- Unvalidated by design: the functional `patch(fn)` form and direct `store.field.set(v)`. Async validators throw at definition time.
