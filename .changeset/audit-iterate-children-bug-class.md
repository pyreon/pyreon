---
'@pyreon/kinetic': patch
'@pyreon/elements': patch
'@pyreon/lint': patch
---

fix(kinetic, elements, lint): audit + defense-in-depth for the iterate-children bug class

PR #731 fixed the kinetic-mode `StaggerRenderer` + `TransitionItem` against
the Pyreon-compiler-prop-inlining + iterate-children bug. PR #732 added the
compiler-side carve-out for stable references at the JSX call site. This PR
closes the **3 parallel library sites** the audit found and ships a lint
rule (`pyreon/no-iterate-children-without-resolve`) to prevent recurrence
in any future library code.

## Background — the bug class

The Pyreon vite-plugin's prop-inlining pass rewrites `<Comp>{children}</Comp>`
(where `children` is a local `const` derived from a getter — typically
`const children = childHolder.children` after `splitProps`) as
`Comp({ ..., children: () => h.children })`. Receiving components see
`props.children` as a FUNCTION instead of the expected `VNode | VNode[]`.

DOM-consuming code routes through `mountChild` which handles function
children correctly via `mountReactive` — invisible bug for the common
forwarding pattern. Libraries that iterate children at the VNode level
or `cloneVNode` them directly are silently broken: the function spread
produces `{type: undefined}` and the DOM renders literal `<undefined>`
tags. Real-app reproducer: `examples/bokisch.com` Intro section.

## Library fixes (3 sites — parallel to PR #731's renderers fix)

PR #731 fixed the kinetic-mode renderers under `packages/ui-system/kinetic/src/kinetic/`.
It missed the parallel TOP-LEVEL components in the same package + a
subtle Iterator shape.

- **`@pyreon/kinetic` top-level `Stagger.tsx`** — `(Array.isArray(own.children) ? own.children : [own.children]).filter(isVNode)` collapsed to `[]` when `own.children` is a function. Fixed by calling `resolveChildren(own.children)` at body entry (same helper PR #731 shipped in `kinetic/src/utils.ts`).
- **`@pyreon/kinetic` top-level `Transition.tsx`** — 3 × `cloneVNode(props.children, …)` + 1 × `(props.children.props ?? {})` reads. The cloneVNode-on-function shape produces `<undefined>` tags; the `.props` read returns undefined and silently drops the merge-ref. Fixed by resolving once at body entry (`const child = resolveChildren(props.children)`).
- **`@pyreon/elements` `Iterator`** — falls through to `renderChild(function)` which calls `render(function, props)` and interprets the function as a component. Doesn't crash but loses per-item metadata (`first`/`last`/`position`/`index`/`odd`/`even`). Fixed by unwrapping at body entry with the inline `typeof rawChildren === 'function' ? rawChildren() : rawChildren` ternary.

## Lint rule — `pyreon/no-iterate-children-without-resolve`

New error-level rule under the `reactivity` category. Detects:

1. **`cloneVNode(EXPR, …)`** where EXPR ends with `.children`.
2. **`(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)`** where METHOD is one of `filter` / `map` / `forEach` / `reduce` / `every` / `some` / `find` / `findIndex` / `flatMap`.
3. **`EXPR.props`** reads where EXPR ends with `.children` (the merge-ref pattern from `Transition.tsx`).

**Acceptable mitigations** (per-function scope, inherits through nested arrow functions):

- `resolveChildren(…)` call.
- `typeof EXPR === 'function' ? EXPR() : EXPR` ternary.
- `typeof EXPR === 'function'` guard anywhere.
- `const NAME = <mitigation expression>` — marks NAME as safe-aliased.

**Out of scope** (deliberate precision trade-offs):

- Pass-through `...(Array.isArray(EXPR) ? EXPR : [EXPR])` SpreadElement → mountChild handles function children. Naturally not flagged by the call-site detection.
- `if (Array.isArray(X)) return X.map(…)` IfStatement-guarded iteration. Framework primitives (`Dynamic`, `Show`, `Switch`) use this with direct h() rest args that never reach the auto-wrap; out of scope.
- Variable-bound iteration patterns (`const xs = COND; xs.METHOD(…)`). Out of scope — detection at the inline `.METHOD(…)` call site.

**Bisect-verified at two layers**: 19 unit specs (10 FIRES + 9 CONTROL + real-world shapes), reverting the rule fails all 10 FIRES; full repo sweep against `packages/**` after library fixes → 0 hits (zero false positives, zero remaining real bugs).

## Surfaces updated

- `packages/ui-system/kinetic/src/Stagger.tsx` — top-level Stagger fix
- `packages/ui-system/kinetic/src/Transition.tsx` — top-level Transition fix
- `packages/ui-system/elements/src/helpers/Iterator/component.tsx` — Iterator fix
- `packages/ui-system/kinetic/src/__tests__/top-level-transition-stagger-function-children.test.tsx` — 4 regression specs (2 FIRES per component + 2 CONTROL)
- `packages/ui-system/elements/src/__tests__/iterator-function-children.test.tsx` — 2 regression specs (1 FIRES + 1 CONTROL)
- `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts` — new rule
- `packages/tools/lint/src/tests/no-iterate-children-without-resolve.test.ts` — 19 unit specs
- `packages/tools/lint/src/rules/index.ts` — register rule + bump reactivity count to 14
- `packages/tools/lint/src/tests/runner.test.ts` — update rule count assertions (80 → 81, reactivity 13 → 14)
- `CLAUDE.md`, `packages/tools/lint/README.md`, `packages/tools/lint/src/manifest.ts`, `docs/docs/lint.md` — rule count claims updated (locked by `check-doc-claims`)
- `.claude/rules/anti-patterns.md` — new bug-class entry under Architecture Mistakes

## Validation

- All 3 library packages pass tests (kinetic 220, elements 463 → +new regression specs)
- All 650 lint tests pass (19 new specs)
- `check-doc-claims` clean (count claims locked)
- Real-app sweep: 0 hits across 1041 source files (rule is precision-tuned to avoid false positives on framework primitives, pass-through patterns, and unrelated `Array.isArray` shapes in non-VNode domains)
