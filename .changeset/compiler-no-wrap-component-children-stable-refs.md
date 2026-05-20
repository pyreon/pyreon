---
'@pyreon/compiler': patch
---

fix(compiler): skip the `() => x` accessor wrap for stable-reference JSX children of component parents

The Pyreon compiler's prop-inlining pass rewrites `<Comp>{children}</Comp>`
(where `children` is a local `const` derived from a getter — typically
`const children = childHolder.children` after `splitProps`) as
`Comp({ ..., children: () => h.children })`. Receiving components see
`props.children` as a FUNCTION instead of the expected `VNode | VNode[]`.
DOM-consuming code routes through `mountChild` which handles function
children correctly via `mountReactive`, so the wrap is invisible there.
Libraries that iterate children at the VNode level or `cloneVNode` them
directly were silently broken — the function spread produced
`{type: undefined}` and the DOM rendered literal `<undefined>` tags. PR
#731 shipped the library-side workaround for `@pyreon/kinetic`; this is
the upstream compiler fix that catches the broader class.

## The carve-out

For JSX children of COMPONENT parents (uppercase tag), skip the wrap when:

1. The expression is a **stable reference** — bare `Identifier`, simple
   non-computed `MemberExpression` chain (`obj.x.y`), or any of the above
   wrapped in TS type-only layers (`as T` / `satisfies T` / `!` / parens).
2. The expression does **not** reference a tracked signal variable.

Both conditions matter:

- **(1)** restricts the carve-out to shapes whose value at JSX-emit time
  is identical to what an effect re-evaluation would produce — a bare
  property read resolves the underlying getter (if any) the same way once
  or N times. CallExpressions, BinaryExpressions, ConditionalExpressions,
  etc. keep the wrap because their re-evaluation semantics matter.
- **(2)** preserves `<Comp>{count}</Comp>` (bare signal identifier) as the
  user's deliberate "make this reactive at the call site" shape. The
  compiler auto-calls (`count` → `count()`) AND wraps (`() => count()`)
  so the receiving component re-evaluates inside its
  `mountReactive`/`mountChild` scope.

The slice is taken of the UNWRAPPED expression — TS type-only layers
strip because esbuild's next stage removes them anyway, and this keeps
cross-backend equivalence with the Rust path (whose `accesses_props`
doesn't recurse into `TSAsExpression`).

## Cross-backend parity

Both `transformJSX_JS` (TypeScript fallback) and the Rust `napi-rs`
native binary implement the carve-out byte-identically. The cross-backend
equivalence suite (`native-equivalence.test.ts`) gains 8 specs covering
every shape (stable-ref / call / binary / DOM parent / signal / TS cast
/ non-null / fragment-transparency / static-array form). All pass on both
backends.

## Relationship to PR #731 — complementary, not replacement

This compiler fix and PR #731's library-side `resolveChildren` are
COMPLEMENTARY layers:

- **The compiler fix** addresses the OUTER pass-through pattern — any
  library or user code that forwards children to a child component via
  `<Comp>{children}</Comp>` where `children` is a local binding. No more
  silent function-wrap surprises for the most common shape.
- **PR #731's library fix** addresses the INNER pattern — kinetic's
  StaggerRenderer / GroupRenderer emit JSX like
  `<TransitionItem>{cloneVNode(child, {style})}</TransitionItem>`. The
  inner expression is a CallExpression (`cloneVNode(...)`), NOT a stable
  reference, so the compiler carve-out (correctly) does not apply. The
  library-side unwrap is still needed for that case.

Verified end-to-end against the bokisch.com Intro reproducer:
- Compiler fix alone (kinetic at vanilla 0.22.0): bug still fires
  (`h1Count: 0`, 3 `<undefined>` tags from TransitionItem's
  `cloneVNode(function, {ref})`).
- PR #731 alone (no compiler fix): bug fixed (PR #731 verified end-to-end).
- Both layered: bug fixed AND the emitted bundle is cleaner
  (`children: h.children` bare instead of `children: () => h.children`).

## Bisect-verified at three layers

- **JS backend**: `packages/core/compiler/src/tests/component-child-no-wrap.test.ts`
  (10 specs). Reverting the `isComponentTag(...) && isStableReference(expr)`
  carve-out fails 5 CONTRACT specs; 5 CONTROL specs stay green.
- **Rust backend**: same carve-out mirrored in `native/src/lib.rs`
  (`is_stable_reference` + `unwrap_type_layers` + parent-component flag
  threading). Reverting fails the 8 new specs in `native-equivalence.test.ts`;
  244 pre-existing specs stay green.
- **Real-app**: bokisch.com Intro with PR #731's library fix + this
  compiler fix → `h1Count: 1`, "Hello" rendered, zero `<undefined>` tags,
  emitted bundle shows `children: h.children` (no wrap).

## Surfaces updated

- `packages/core/compiler/src/jsx.ts` — `handleJsxExpression(node, parentJsx?)`
  + `isComponentTag` + `isStableReference` + `unwrapTypeLayers`
- `packages/core/compiler/native/src/lib.rs` — same logic, byte-identical
  emit; `parent_is_component_jsx_element` Ctx flag threaded through
  `handle_jsx_element` and reset across `JSXFragment` boundaries (matches
  JS-backend semantics)
- `packages/core/compiler/src/tests/component-child-no-wrap.test.ts` —
  10 regression specs (5 CONTRACT + 5 CONTROL) with full bisect rationale
- `packages/core/compiler/src/tests/native-equivalence.test.ts` —
  8 new cross-backend specs
