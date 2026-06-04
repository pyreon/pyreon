---
"@pyreon/reactivity": patch
---

test(reactivity): add 17 real tests; branches 94.22% → 95.04% (clears MINIMUM_BRANCH_FLOOR=95)

`branch-coverage-95-floor.test.ts` covers previously-uncov arms:

- Signal idempotent dispose — second call hits `else if (self._d)` falsy arm (line 228)
- Computed idempotent dispose for both computedLazy + computedWithEquals paths (lines 202, 342)
- `NODE_ENV='production'` false arms in computedWithEquals via `vi.stubEnv` + `options.equals` dispatch (lines 268, 292, 358) — covers dev-counter `_rdRecordFire` and post-factory `_rdRegister` gates
- renderEffect disposed-during-batch hits early-return (line 453 truthy arm) — write + dispose within same batch, run() flushes with disposed=true

Threshold bumped: `branches: 94 → 95` in vitest.config.ts. Reactivity now clears the planned `MINIMUM_BRANCH_FLOOR=95` (PR #1329).
