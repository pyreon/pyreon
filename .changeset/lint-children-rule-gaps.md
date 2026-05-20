---
'@pyreon/lint': patch
---

fix(lint): close the two scope gaps on `pyreon/no-iterate-children-without-resolve`

PR #736 shipped the rule with two deliberate scope deferrals: (a)
variable-bound iteration (`const xs = Array.isArray(X) ? X : [X];
xs.filter(…)`) was only caught at the inline `.METHOD(…)` call site,
(b) the inner-component foot-gun (outer unwraps `props.children`,
inner inline-defined component iterates its own `innerProps.children`)
relied on per-source-path mitigation tracking that was implemented but
not regression-tested. This PR closes both gaps with bisect-verified
unit specs.

## Gap 2 — variable-bound iteration

The risky shape now caught:

```js
const Stagger = (props) => {
  const [own] = splitProps(props, ['children'])
  const xs = Array.isArray(own.children) ? own.children : [own.children]
  const filtered = xs.filter(isVNode)   // ← FIRES (was silent pre-fix)
  return h('div', null, ...filtered)
}
```

Detection: a new per-scope `boundIterationTargets: Map<NAME, sourceKey>`
records `const NAME = Array.isArray(EXPR) ? EXPR : [EXPR]` bindings
(parenthesized form supported) at `VariableDeclarator` visit time. The
`CallExpression` visitor's `MemberExpression`/`ITER_METHODS` branch then
adds an `Identifier` case: if `obj.name` is in any enclosing scope's
`boundIterationTargets`, the same risky-iteration flag fires keyed on
the underlying source path.

The mitigation contract still wins by source-path:

```js
// Does NOT fire — mitigation tracked per-source-path, applies to bound forms too.
const resolved = resolveChildren(own.children)
const xs = Array.isArray(resolved) ? resolved : [resolved]
xs.filter(isVNode)
```

## Gap 3 — per-source-path mitigation precision

The contract was already correct in the rule's `isCovered` lookup (keys
on `exprKey`, not "any mitigation in scope"), but no regression spec
locked it in. Added the canonical Outer/Inner shape that exercises it:

```js
const Outer = (props) => {
  const child = resolveChildren(props.children)        // mitigates `props.children`
  const Inner = (innerProps) =>
    cloneVNode(innerProps.children, { ref })           // ← FIRES — different source path
  return Inner({})
}
```

`Outer`'s mitigation marks `unwrappedSources = {'props.children'}` +
`safeIdents = {'child'}`. `Inner` receives a fresh `innerProps`
parameter, so `innerProps.children` is a DIFFERENT source key the outer
mitigation never covered. The function-shape bug fires per-prop-source,
not per-component-tree, and now has the regression to prove it.

Bisect-verified at the over-permissive `isCovered` (returns true if ANY
mitigation exists in scope) — that spec fails; restored → 23/23 pass.

## Coverage

- 4 new unit specs (now 23 total, up from 19): 2 FIRES for Gap 2 + 1
  CONTROL for Gap 2 mitigation + 1 FIRES for Gap 3 cross-component
  precision.
- Repo sweep across 988 source files in `packages/**` (excluding tests,
  fixtures, manifest.ts) → **0 hits**: no new false positives from the
  broader Gap-2 detection, and no remaining real bugs (consistent with
  PR #736's library-side fixes leaving the tree clean).
- Gap 1 (Iterator-fallthrough shape: `if (Array.isArray(x)) return
  x.map(…); … return renderChild(x)`) remains intentionally out of
  scope — that shape is the precise pattern framework primitives
  (`Dynamic`, `Show`, `Switch`) use with direct `h()` rest args that
  never reach the auto-wrap, so detection would false-positive on
  every primitive's hot path.

## Surfaces updated

- `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts`
  — `ScopeFrame.boundIterationTargets` + `findBoundIteration` helper +
  `VariableDeclarator` extension + `CallExpression` `Identifier` branch
- `packages/tools/lint/src/tests/no-iterate-children-without-resolve.test.ts`
  — 4 new specs (3 in "FIRES" + 1 in "DOES NOT FIRE (mitigation present)")
