# @pyreon/state-tree

- `model({ state })` or `model({ schema, initial? })`, then chain `.views()`, `.actions()`, `.volatile()`, `.lifecycle()`, and finish with `.create()` or `.asHook(id)`.
- Schema mode validates every write and is typed from the schema. Pass `s.object()`, zod, valibot or arktype directly. It installs `set`/`patch`/`deepPatch`/`update`/`reset` helpers that validate before writing.
- API: `destroy()`/`isAlive()`, `clone()`/`getType()`, `getSnapshot()`/`applySnapshot()` (schema mode re-validates), `onPatch()`/`applyPatch()` (replace-only), `onSnapshot()` (microtask-coalesced), `onAction()`/`addMiddleware()`, `getParent`/`getRoot`/`getPath`, `identifier()`/`reference(Type)`/`resolveIdentifier()`.
- Nested models compose in plain mode only; schema mode is flat.
