# @pyreon/state-tree

- `model({ state })` or `model({ schema, initial? })`, then chain `.views()`, `.actions()`, `.volatile()`, `.lifecycle()`, and finish with `.create()` or `.asHook(id)`.
- Schema mode validates every write and is typed from the schema. Pass `s.object()`, zod, valibot or arktype directly. It installs `set`/`patch`/`deepPatch`/`update`/`reset` helpers that validate before writing.
- API: `destroy()`/`isAlive()`, `clone()`/`getType()`, `getSnapshot()`/`applySnapshot()` (schema mode re-validates), `onPatch()`/`applyPatch()` (replace-only), `onSnapshot()` (microtask-coalesced), `onAction()`/`addMiddleware()`, `getParent`/`getRoot`/`getPath`, `identifier()`/`reference(Type)`/`resolveIdentifier()`, `arrayOf(Model)`/`mapOf(Model)`.
- A field holding model instances must be declared `arrayOf(Model)` / `mapOf(Model)` for snapshots and patches to recreate its elements; a plain `[] as Todo[]` default dev-warns. Child paths include the index / key (`/todos/1/done`), patch values are snapshots, and `applySnapshot` and `applyPatch` share one write rule (`restoreField` in `snapshot.ts`). Locked by the property test `patch-snapshot-roundtrip.test.ts`.
- Nested models compose in plain mode only; schema mode is flat.
