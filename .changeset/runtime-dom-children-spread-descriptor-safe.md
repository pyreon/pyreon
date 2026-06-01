---
'@pyreon/runtime-dom': patch
---

fix(runtime-dom): mount children-injection uses descriptor-copy instead of object spread (closes the reactive-prop-through-children bug class)

`mount.ts:404-410` did `{ ...vnode.props, children: ... }` when `h(Comp, props, ...children)` was called with children as separate positional args (the canonical JSX-compiled call shape). The JS-level object spread fired every getter on `vnode.props` BEFORE `makeReactiveProps` could install / re-install getter descriptors — collapsing compiler-emitted `_rp(() => signal())` wrappers (already converted to getters at the OUTER mount) to static values for every nested mount.

**Bug class symptom**: any framework or user-land component with reactive props used as children-bearing JSX siblings silently lost reactivity. `<RocketstyleButton href={signal() ? '/a' : '/b'} />` with `Element` as base never updated the `href` DOM attribute. The first investigations traced and fixed the rocketstyle pipeline + Wrapper helper; the leak survived because Element / Text / Content (wrapped INSIDE Wrapper) still bled. The sibling PR #1168 fixed those three components localized; **this PR closes the bug class at the framework root** so every other component (framework or user-land) using the canonical `<Comp {...rest}>children</Comp>` JSX pattern is also protected.

**Fix**: replace the spread with descriptor-copy via `Object.getOwnPropertyDescriptors` + per-key `Object.defineProperty`, then static assignment for the `children` override. Getters stay getters end-to-end through `h()` → component body → `applyProps` / `_bindText`.

Surgical scope:
- No-children path (control) unchanged: `vnode.children.length === 0` → returns `vnode.props` directly, byte-identical behavior to pre-fix.
- Children-present path: 1 object allocation (was 1 in the spread shape) + descriptor copy per key (vs value copy per key). Same big-O, negligible overhead.

API contract unchanged.

## Bisect-verify

3 new specs in `packages/core/runtime-dom/src/tests/mount-children-spread-reactive.browser.test.tsx`:
1. **Two-level forwarding chain with reactive `href` + children present** — triggers the buggy branch. PRE-FIX fails `expected '/a' to be '/b'`.
2. **Control: no children → branch skipped** — passes regardless of fix. Proves the fix is surgical.
3. **Reactive prop used as JSX text child via `_bindText`** — non-attribute consumer. PRE-FIX fails `expected 'first' to be 'second'`. Proves the bug class hits BOTH `applyProps` AND `_bindText` downstream consumers, not specific to one prop pipeline.

Reverting to the pre-fix spread: 2 of 3 specs fail with the documented assertions. Restoring → 3/3 green.

## Full validation

| Package | Tests | Status |
|---|---|---|
| `@pyreon/runtime-dom` (node + browser) | 683+1-skip + 58 = 741 | ✓ |
| `@pyreon/core` | 540 | ✓ |
| `@pyreon/router` | 559 | ✓ |
| `@pyreon/elements` (node + browser) | 497 + 23 = 520 | ✓ |
| `@pyreon/rocketstyle` | 309 | ✓ |

**2689 tests across 5 affected packages, all green.** Typecheck clean. Lint clean.

## Interaction with sibling PR #1168

#1168 applied a localized fix to Element / Text / Content (route children through `buildSpreadProps`'s overrides so `vnode.props.children !== undefined` → mount's spread branch is skipped). With this PR's mount.ts fix, the localized fix becomes redundant but harmless. The mount.ts fix alone is sufficient — proven by running `@pyreon/elements` browser tests against this branch WITHOUT #1168 (all green). Both ship for defense in depth.
