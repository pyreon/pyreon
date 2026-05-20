---
'@pyreon/react-compat': patch
'@pyreon/preact-compat': patch
---

fix(react-compat, preact-compat): unwrap compiler-emitted function children in `Children.*` / `toChildArray`

`@pyreon/react-compat`'s `React.Children.map` / `forEach` / `count` /
`toArray` / `only` AND `@pyreon/preact-compat`'s `toChildArray`
silently produced wrong results when children went through the Pyreon
compiler's prop-inlining accessor wrap. Same bug class as PR #197
(connector-document silent metadata drop) and PR #736 (kinetic /
Iterator function-shape iteration), now also closed for the React /
Preact compat layers.

## The bug class

The Pyreon vite-plugin's compiler rewrites
`<MyComp>{data.map(fn)}</MyComp>` (or any non-stable children
expression — `CallExpression`, `ConditionalExpression`, etc.) as
`MyComp({ children: () => data.map(fn) })`. The transform is
pragma-agnostic — it fires for components under `@pyreon/react-compat`
and `@pyreon/preact-compat` too, not just the native `@pyreon/core`
pragma. PR #732's "stable references" carve-out only skips the wrap
for bare identifiers and simple member-expression chains; everything
else still gets the function wrap.

Pre-fix, `React.Children.map(props.children, fn)` (or `toChildArray`)
saw the wrapping function as a single child. `flattenChildren` /
`flatten` fell through to "not array → push value" — returning
`[function]` instead of expanding to the N real children. The
downstream `fn(function, 0)` either crashed, rendered nothing, or
silently corrupted the output depending on what the user's callback
did with the function-shaped child.

Real-world impact: any React-port that uses `React.Children.*` to
render dynamic lists would silently lose every child after position 0
when the children expression isn't a bare identifier. The bug shipped
from package inception on both compat layers.

## The fix

Mirrors PR #731 / #736 / Iterator's pattern — unwrap the function at
helper entry:

```ts
// react-compat
function flattenChildren(children: VNodeChild | VNodeChild[]): VNodeChild[] {
  if (children == null) return []
  if (typeof children === 'function') {
    children = (children as () => VNodeChild | VNodeChild[])()
    return flattenChildren(children as VNodeChild | VNodeChild[])
  }
  if (!Array.isArray(children)) return [children]
  // ... existing array-flatten path
}

// preact-compat
function flatten(value: NestedChildren, out: VNodeChild[]): void {
  if (value == null || typeof value === 'boolean') return
  if (typeof value === 'function') {
    flatten((value as () => NestedChildren)(), out)
    return
  }
  // ... existing array-flatten path
}
```

The recursion handles every shape the compiler can emit (function
wrapping array / single VNode / nested arrays / null). The fix is
additive — plain (non-wrapped) children paths are unchanged.

## Bisect verification

**react-compat**: 9 new specs added covering `Children.map` /
`forEach` / `count` / `toArray` / `only` against function-wrapped
children + the additive control. Reverted the `typeof children ===
'function'` branch from `flattenChildren` → 8 of 9 specs fail with
"expected 2 to be 1" / "expected [Function] to throw" / etc. The 9th
control spec ("plain children still work") stays green either way.
Restored → 233/233 specs pass.

**preact-compat**: 5 new specs added covering `toChildArray` against
function-wrapped children + the additive control. Reverted the
`typeof value === 'function'` branch from `flatten` → 3 of 5 specs
fail with "expected length 2 but got 1" / "expected length 3 but got
1" / "expected [Function] to deeply equal []". The 2 control specs
("single child unwraps", "plain children still work") stay green
either way. Restored → 162/162 specs pass.

## Surfaces updated

- `packages/tools/react-compat/src/index.ts` — `flattenChildren`
  function-unwrap branch + recursion
- `packages/tools/preact-compat/src/index.ts` — `flatten` function-
  unwrap branch
- `packages/tools/react-compat/src/tests/new-apis.test.ts` — 9 new
  specs in `describe('Children utilities — compiler function-wrap unwrap')`
- `packages/tools/preact-compat/src/tests/new-apis.test.ts` — 5 new
  specs in nested `describe('compiler function-wrap unwrap')` under
  the existing `toChildArray` describe block

## Why the lint rule didn't catch this

`pyreon/no-iterate-children-without-resolve` flags `cloneVNode(EXPR)`,
inline-or-bound `(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)`, and
`EXPR.props` reads where EXPR ends with `.children`. The compat helpers
iterate the children parameter via `if (Array.isArray(children))`
followed by a `for...of` loop (an `IfStatement`-guarded shape that's
deliberately out-of-scope to avoid false-positives on framework
primitives like `Dynamic` / `Show` / `Switch`). Manual sweep — exactly
the precision trade-off PR #751 documented.
