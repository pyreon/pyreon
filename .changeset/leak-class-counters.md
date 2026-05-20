---
'@pyreon/zero': patch
'@pyreon/solid-compat': patch
'@pyreon/svelte-compat': patch
'@pyreon/vite-plugin': patch
---

feat(perf-harness): 6 leak-class diagnostic counters across the #725-#741 fix sites

Adds dev-gated perf-harness counters at every site fixed during the
8-PR leak-class sweep (#725-#741). The counters are zero-cost in
production (`process.env.NODE_ENV` gate folds to `false`; the optional-
chain on `globalThis.__pyreon_count__?.()` short-circuits when no
consumer is installed) and free in dev unless `perfHarness.install()`
is called by the consumer.

Diagnostic shape: each counter emits at a load-bearing point in the
fix's code path. If the fix regresses (clearTimeout falls out of a
finally, refcount guard fails, sweep doesn't fire), the counter
either stops emitting OR diverges from its expected pair. CI's
nightly perf-results comparison via `bun run perf:diff` will surface
the regression before it ships.

### 6 new counters

| Counter | Class | Fix site | Healthy shape |
|---------|-------|----------|---------------|
| `isr.revalidate.timerClear` | I | #734 `isr.ts revalidate()` | = revalidate-attempt count |
| `theme.initRefAcquire` | D | #734 `theme.tsx initTheme()` | bounded by # of mounted ThemeToggles |
| `theme.initRefRelease` | D | same | paired with acquire, monotonic |
| `solid-compat.createResource.staleDiscarded` | F | #737 `createResource` | non-zero under refetch races |
| `solid-compat.createStore.signalEvicted` | C | #737 `createStore` sweep | spikes during sweep cycles |
| `svelte-compat.subscribe.cachedRePush` | D | #739 `writable.subscribe` cached path | non-zero during parent re-renders |
| `vite-plugin.watchChange.delete` | C | #741 watchChange hook | grows with file-deletion count |

### Catalog wiring

`COUNTERS.md` gains 7 new entries (6 counters + the `theme.initRef*` pair).
Each documents:
- Exact source file
- "Healthy number looks like" description (the diagnostic semantics)
- The leak-class label + originating PR

`catalog-drift.test.ts` `INSTRUMENTED_PACKAGE_ROOTS` adds 3 new entries:
- `packages/tools/solid-compat/src`
- `packages/tools/svelte-compat/src`
- `packages/tools/vite-plugin/src`

The existing `packages/zero/zero/src` entry is unchanged (already
present for the `ssg.*` namespace). The bidirectional catalog gate
(every emit must be cataloged; every cataloged name must have an
emit) enforces the link going forward.

### Validation

- 1555/1556 tests pass across the 5 modified packages (1 pre-existing
  zero skip):
  - `@pyreon/zero` 953/954
  - `@pyreon/solid-compat` 218/218
  - `@pyreon/svelte-compat` 55/55
  - `@pyreon/vite-plugin` 104/104
  - `@pyreon/perf-harness` 225/225 (including the catalog-drift gate)
- Lint + typecheck clean across all 5 packages
- Zero public-API surface change — counters are dev-only sink emissions

### Closes the MEDIUM followup recommendation

Per the post-#743 review. Production monitoring stories for leak-class
regressions are now structurally observable via the existing
`perfHarness.snapshot()` / `perf:diff` flow. The LOW followup
(`scripts/audit-leak-classes.ts` static-analysis tool) follows in a
separate PR.
