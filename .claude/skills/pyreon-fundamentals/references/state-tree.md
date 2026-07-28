# @pyreon/state-tree

- **@pyreon/state-tree**:
  - `model({ state })` or `model({ schema, initial? })` — chainable `.views()/.actions()/.volatile()/.lifecycle()` then `.create()` or `.asHook(id)`.
  - Schema mode is validation-driven AND strictly typed from the schema (pass `s.object()`/zod/valibot/arktype directly; installs bare-name `set/patch/deepPatch/update/reset` helpers that validate before writing).
  - `destroy()`/`isAlive()`, `clone()`/`getType()`, `getSnapshot()`/`applySnapshot()` (schema mode re-validates), `onPatch()`/`applyPatch()` (replace-only), `onSnapshot()` (microtask-coalesced), `onAction()`/`addMiddleware()`, tree traversal (`getParent`/`getRoot`/`getPath`), `identifier()`/`reference(Type)`/`resolveIdentifier()`.
  - Nested models compose in PLAIN mode; schema mode is flat.
