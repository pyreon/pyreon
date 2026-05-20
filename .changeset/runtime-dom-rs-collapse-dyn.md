---
'@pyreon/runtime-dom': patch
---

feat(runtime-dom): add `_rsCollapseDyn` — runtime half of the dynamic-prop partial-collapse build (PR 1 of 4)

Compiler-emitted runtime helper that generalises `_rsCollapse`'s 2-class
(light/dark) dispatch to N-class for collapsed rocketstyle call sites
where ONE dimension prop is an enumerable dynamic expression — most
commonly a ternary of two literals:

```jsx
<Button state={cond ? 'primary' : 'secondary'}>Save</Button>
```

would compile to:

```js
__rsCollapseDyn(
  "<button>Save</button>",
  ["btn-primary-light", "btn-primary-dark", "btn-secondary-light", "btn-secondary-dark"],
  () => cond ? 0 : 1,
  () => __pyrMode() === "dark"
)
```

Class layout is **stride-2, value-major**: index = `2 * valueIndex + (isDark ? 1 : 0)`.
Both accessors are reactive — a value flip OR a mode flip patches
className IN PLACE on the SAME node (no remount), preserving
`_rsCollapse`'s mode-flip contract.

## Why

Per the `collapse-bail-census` measurement on the real `@pyreon/ui-components`
corpus (`packages/core/compiler/src/tests/collapse-bail-census.test.ts`),
the bail buckets sit at:

- dynamic-prop: **15.3%** ← targeted by this PR's sequence
- element-child: 9.2% (recursive collapse, harder)
- `on*`-handler-only: 7.8% (just shipped via `_rsCollapseH` + PRs 1-3)
- spread: 0.4%, boolean-attr: 0.2%

Dynamic-prop is the largest remaining bail bucket. The ternary-of-literals
shape is the syntactically-clearest, statically-enumerable subset — no
type info needed, no Cartesian explosion (max 2 values per dim prop).

## What this PR ships

- `_rsCollapseDyn(html, classes, valueIndex, isDark, bind?)` in
  `packages/core/runtime-dom/src/template.ts`
- Re-exported from `@pyreon/runtime-dom`
- 7 real-Chromium browser specs covering:
  - cold mount picks `value=0 + light` defaults (real CSS)
  - value flip swaps class on the SAME node (no remount)
  - mode flip swaps class on the SAME node (no remount) —
    preserves `_rsCollapse` mode contract
  - combined value + mode flip lands on right `(value, mode)` class —
    stride-2 layout proof across all 4 combinations
  - out-of-range `valueIndex` coerces to empty className (no crash) —
    documented graceful-degradation contract
  - children binder runs alongside class binder and disposes cleanly
  - single-value (valueCount=1) reduces to `_rsCollapse`-equivalent
    shape (proves the generalisation as a strict superset)

## What's NOT in this PR (explicit follow-up scope)

Mirrors the established `on*`-handler partial-collapse 4-PR sequence
(also referenced in `.claude/plans/open-work-2026-q3.md` → #1):

- **PR 2**: `detectDynamicCollapsibleShape` compiler detector
  (ternary-of-two-literals AST shape on ≤1 dimension prop; mirrors
  `detectPartialCollapsibleShape`'s "extend bail catalogue with one
  relaxation" pattern). Pure AST function, unit-testable in isolation.
- **PR 3**: resolver extension (resolve EACH literal value via the
  existing SSR pipeline, assert structural-template parity across
  values) + emitter in `tryRocketstyleCollapse` (call site falls
  through to dynamic path when full + partial detectors both bail)
  + plugin scan hookup
- **PR 4**: bail-census update (assert dynamic-prop addressable count
  flips `collapsible`; coverage moves 73.2% → ~88%) + verify-modes
  `ui-showcase × spa` probe route + real-Chromium e2e gate (parity vs
  the 5-layer mount on both value branches)

PR 1 is structurally analogous to PR 2 of the `on*`-handler sequence
(the `_rsCollapseH` runtime helper) — a self-contained, layer-pure,
bisect-verifiable runtime addition that lays the foundation without
delivering user-visible benefit until the compiler half lands.

## Bisect verification

Neutralised the value-dispatch in `_bindDirect` callback (made it
ignore `valueIndex()` and only dispatch on `isDark()` — the
pre-existing `_rsCollapse` shape):

| Spec | Pre-bisect | Bisected | Notes |
|---|---|---|---|
| cold mount value=0 + light | PASS | PASS | Either dispatch is correct at value=0 |
| value flip same node | PASS | **FAIL** | `expected 'rd2-v0-light' to be 'rd2-v1-light'` |
| mode flip same node | PASS | **FAIL** | `expected 'rd3-v0-light' to be 'rd3-v1-light'` |
| combined value+mode (stride-2) | PASS | **FAIL** | `expected 'rd4-v0-dark' to be 'rd4-v1-dark'` |
| out-of-range graceful | PASS | **FAIL** | `expected 'rd5-v0-light' to be ''` |
| children binder cleanup | PASS | PASS | Orthogonal to dispatch |
| single-value degenerate | PASS | PASS | At value=0 the two dispatches converge |

Restored → 7/7 pass. The 3 specs that pass in both states are
documented additive controls (single-value, defaults, child binder).

## Surfaces updated

- `packages/core/runtime-dom/src/template.ts` — `_rsCollapseDyn` (new)
- `packages/core/runtime-dom/src/index.ts` — re-export
- `packages/core/runtime-dom/src/tests/rs-collapse-dyn.browser.test.ts`
  — 7 bisect-verified browser specs (new)
- `CLAUDE.md` — section under "Compile-time rocketstyle collapse"
  documenting the PR 1 helper + the 3-PR follow-up scope
