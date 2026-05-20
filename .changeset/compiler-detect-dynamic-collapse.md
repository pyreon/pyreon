---
'@pyreon/compiler': patch
---

feat(compiler): add `detectDynamicCollapsibleShape` — PR 2 of the dynamic-prop partial-collapse build

Compiler detector for the next-bigger bite after the just-shipped
`on*`-handler partial-collapse: collapsible call sites where ONE
dimension prop is a **ternary-of-two-literals** dynamic expression.

```jsx
// Pre-fix: bails on `state={...}` non-literal → full 5-layer mount
// Post-fix (with PR 3 emit): collapses with a value dispatcher
<Button state={cond ? 'primary' : 'secondary'} size="medium" onClick={go}>
  Save
</Button>
```

## What this PR ships (PR 2 of 4 — detector only)

Mirrors `detectPartialCollapsibleShape`'s "extend bail catalogue with ONE
relaxation" pattern. The single relaxation: a `JSXExpressionContainer`
wrapping a `ConditionalExpression` with BOTH branches being `StringLiteral`
is acceptable as a `DynamicCollapsibleProp { name, condStart, condEnd,
valueTruthy, valueFalsy }`.

- Composes with the existing `on*`-handler relaxation (same call can
  carry one ternary AND any number of handlers — matches real-corpus
  shape where Buttons with `state={cond ? ...}` almost always have
  `onClick`)
- Constraint: AT MOST ONE ternary per site (multi-axis combinatorics is
  separable scope, not this PR)
- Constraint: branches MUST be `StringLiteral` (template literal,
  identifier, numeric literal all bail — keeps the static-resolvable
  set narrow + provable)
- Returns `null` for zero ternaries (defers to full / on*-only paths
  so the three detectors never both/all-three claim the same site —
  same load-bearing separation as the rest of the family)

## Bisect verification

Neutralized `detectDynamicCollapsibleShape` (`if (node) return null`):
- 5 POSITIVE specs fail with `expected null not to be null`
- 8 NEGATIVE specs pass (they always assert null — asymmetry proof
  that the positive assertions are load-bearing on the ternary-
  relaxation logic, not on a generic null short-circuit)
- Restored → 13/13 pass

## What's NOT in this PR (follow-up scope)

- **PR 3**: resolver extension (resolve EACH literal value via existing
  SSR pipeline, assert structural-template parity) + emit
  `__rsCollapseDyn(...)` from `tryRocketstyleCollapse` falling through
  to the new path when full + partial both bail + plugin scan hookup
- **PR 4**: bail-census update (assert dynamic-prop addressable count
  flips `collapsible`; coverage moves 73.2% → ~88%) + verify-modes
  cell + real-Chromium e2e gate

This PR is structurally analogous to PR 1 of the `on*`-handler sequence
(the detector, before the emit landed) — pure AST function, unit-testable
in isolation, no compiler-pipeline coupling.

## Surfaces updated

- `packages/core/compiler/src/jsx.ts` — `detectDynamicCollapsibleShape`
  + `DynamicCollapsibleProp` interface (new exports)
- `packages/core/compiler/src/tests/dynamic-collapse-detector.test.ts`
  — 13 bisect-verified specs (POSITIVE + NEGATIVE)

## Related

- **#765** (merged) — PR 1: `_rsCollapseDyn` runtime helper
- **#761** (closed spike) — surfaced the recommendation
- **on*-handler partial-collapse** PRs (1-3 already shipped) — the
  precedent this PR mirrors
