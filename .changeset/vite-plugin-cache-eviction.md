---
'@pyreon/vite-plugin': patch
---

fix(vite-plugin): evict per-instance caches on file delete in long-running `vite dev` sessions (#733 followup)

Closes the last MEDIUM pattern from #733's audit byproducts.

### The leak

Four per-instance caches accumulated entries for the lifetime of a
`vite dev` session, with no eviction path for deleted/renamed files:

- `signalExportRegistry: Map<moduleId, Set<signalName>>` — populated
  by `prescanSignalExports` + `scanSignalExports` on every transform.
- `resolveCache: Map<\`${importer}::${source}\`, resolvedId>` —
  populated by `resolveImportedSignals`.
- `islandRegistry: Map<filePath, IslandDecl[]>` — populated by
  `prescanIslandDeclarations` + `scanIslandDeclarations`.
- `pyreonWorkspaceDirCache: Map<dir, boolean>` — populated by
  `isPyreonWorkspaceFile`.

When the developer deleted / renamed / moved a source file during a
long-running session, the corresponding entries stayed in memory
until process exit. Bounded by total source-tree size in practice
(realistic dev session: tens of MB at most), but a real Class C
leak — every file you touch and later delete leaks one entry per
applicable cache.

### Fix

Subscribe to Vite's `watchChange(id, change)` hook (native API for
filesystem events). On `'delete'` events, evict:

1. `signalExportRegistry.delete(normalizedId)`
2. `islandRegistry.delete(id)` (and `.delete(normalizedId)` if they
   differ) — covers both shapes the registry might be populated with.
3. `resolveCache` — sweep entries where the deleted file is EITHER
   the importer (key prefix `${normalized}::`) OR the resolved value.
   Both directions matter: a deleted file's resolved imports go
   stale, AND other files importing the deleted file need to
   re-resolve (so they see `null` next time, not the now-invalid
   path).
4. `pyreonWorkspaceDirCache` — intentionally NOT touched. Keyed by
   DIRECTORY, not file; a single file deletion doesn't invalidate
   the directory's workspace status (other files may live there).
   Bounded by source-tree directory count anyway — small + finite.

`'create' | 'update'` events are no-ops at the hook level — the
existing transform-time `scanSignalExports` / `scanIslandDeclarations`
calls re-populate the registry on every transform, overwriting any
stale entry. So watchChange only needs to handle `'delete'`.

### Regression tests + bisect

`packages/tools/vite-plugin/src/tests/cache-eviction-on-delete.test.ts`
(5 specs):

1. **signalExportRegistry entry evicted on delete** — populates
   the registry via transform, fires delete, asserts entry gone.
2. **resolveCache entries pointing at deleted file evicted** —
   populates both importer-side and value-side entries, asserts
   no entry references the deleted path post-delete.
3. **islandRegistry entry evicted on delete** — defensive shape
   (passes if scanner populated registry OR if delete is a safe
   no-op).
4. **watchChange ignores create/update events** — populates entry,
   fires create + update + delete in sequence, asserts entry only
   evicts on delete.
5. **Deleting an untracked file is a safe no-op** — defensive.

**Bisect-verified**: replaced the whole `watchChange` body with a
no-op → 3/5 specs fail (signalExportRegistry survives, islandRegistry
survives, "only delete evicts" assertion fires). Restored → 5/5
pass.

### Validation

- `@pyreon/vite-plugin` 104/104 tests pass (+5 new regression specs)
- Lint + typecheck clean
- No public-API surface change — `watchChange` is a Vite plugin hook,
  not user-facing
- New `Symbol.for('pyreon/vite-plugin:caches')` debug accessor is
  `@internal` (test-only)

### Closes the #733 / #734 sweep

This finishes the audit-byproducts trail from #733. All 4 MEDIUM
patterns from that PR (vue-compat-A from #733 itself, then #735's
ssg/csp, #737's solid-compat, #739's svelte-compat, this one) are
now closed. The 6 LOW patterns from #733 remain documented but
deliberately deferred — none have real-impact magnitude to
justify the implementation cost.
