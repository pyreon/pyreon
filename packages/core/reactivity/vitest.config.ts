import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // Statements 98 / lines 99 / branches 94 after the real-test coverage-hardening
  // suite (`branch-coverage-real.test.ts`, 96 tests). Branches stops at 94.22% rather
  // than 95% because the remaining ~6 branches are STRUCTURALLY UNREACHABLE from
  // the public API (NOT v8-ignored — left honestly visible in coverage reports):
  //
  //  - `notifyDirect` non-batching else arm (signal.ts:254): `signal.set` always
  //    auto-wraps in `batch()` so the inner `notifyDirect` always sees `isBatching=true`.
  //  - First-subscriber disposer's `else if (self._d)` false arm (signal.ts:228):
  //    requires `_d` Set existing while updater isn't in `_d1` AND _d was externally
  //    cleared — the disposer captures `updater` via closure so this can't happen.
  //  - `if (this._l)` false arm in Cell.listen (cell.ts:49): inside the `else` of
  //    `!_l && !_s`, at least one of them is set; the inner `if (!_s)` true arm
  //    implies `_l` is set (the only escape), so the `if (this._l)` false arm is
  //    structurally unreachable.
  //  - `if (!bucket)` false arm in createSelector (createSelector.ts:155): reached
  //    only if `hosts` was cleared without clearing `subs` — dispose clears both.
  //  - Multi-deps cleanup `deps.length === 0` arm (effect.ts:411): only called on
  //    re-runs which need deps to notify; empty deps can't notify.
  //  - typeof process undefined arms (lpih.ts:62, singleton-sentinel.ts:104):
  //    browser-only paths, the test env runs in Node.
  //
  // These are defense-in-depth or environment-only branches. The honest target is
  // 94% — pushing to 95% would require v8-ignore annotations (gaming the gate)
  // or removing the defensive code (riskier than the gain).
  coverageThresholds: { statements: 98, lines: 99, branches: 94 },
})
