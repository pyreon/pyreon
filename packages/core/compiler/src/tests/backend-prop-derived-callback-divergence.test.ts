/**
 * Compiler hardening — Round 7 (cross-backend bug, FIXED + bisect-verified).
 *
 * The JS and native (Rust) backends MUST emit byte-identical output (the
 * `native-equivalence.test.ts` contract — 180 such tests). This file pinned a
 * GAP that suite missed: prop-derived const inlining inside callback-nested
 * JSX.
 *
 *   const cls = props.theme + '-btn'
 *   <ul>{props.items.map(i => <li class={cls}>{i}</li>)}</ul>
 *
 * Pre-fix: JS emitted `class={(props.theme + '-btn')}` (reactive); the native
 * backend — PREFERRED in production — emitted `class={cls}` (the const is
 * captured once → reactivity SILENTLY LOST in real builds for a ubiquitous
 * pattern). Root cause: `collect_prop_derived_idents` (native/src/lib.rs)
 * had `ArrowFunctionExpression | FunctionExpression => {}` (deliberately
 * skipped "to avoid new scope") and NO JSX arm, so it never descended into a
 * `.map(i => <li>{cls}</li>)` callback body. The JS pass walks the whole
 * program AST so it substituted.
 *
 * Fix (native/src/lib.rs): the arrow/function arms now recurse into the body
 * and JSX arms were added, with a `pd_filter` that removes names a scope
 * binds (params / nested const-let / catch / loop) from the prop-derived map
 * for that scope's subtree — byte-equivalent to the JS pass's enter/leave
 * `shadowed` set (R2 parity), so recursing does NOT re-introduce the
 * over-substitution clobber R2 fixed in JS. Validated against all 180
 * native-equivalence tests (still byte-identical) + the full suite.
 *
 * Bisect: in native/src/lib.rs replace the new
 * `Expression::ArrowFunctionExpression(arrow) => { … }` /
 * `Expression::FunctionExpression(func) => { … }` arms with `=> {}` and
 * rebuild (`bun scripts/build-native.ts`) → the cross-backend specs below
 * fail (Rust reverts to `class={cls}`); the DIRECT spec stays green (it was
 * never affected). Restore + rebuild → all pass.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const js = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''
const rust = (c: string): string => transformJSX(c, 'c.tsx').code ?? ''

const CALLBACK_NESTED = `function C(props){ const cls = props.theme + '-btn'; return <ul>{props.items.map(i => <li class={cls}>{i}</li>)}</ul> }`
const TRANSITIVE_CB = `function C(props){ const a = props.x; const b = a + 1; return <ul>{props.items.map(i => <li>{b}</li>)}</ul> }`
const SHADOW_PARAM = `function C(props){ const a = props.x; return <ul>{props.items.map(a => <li>{a}</li>)}</ul> }`
const DIRECT = `function C(props){ const a = props.x; return <div>{a}</div> }`

describe('Round 7 — prop-derived inlining inside callback-nested JSX (JS≡Rust)', () => {
  it('JS backend inlines the prop-derived const in the callback (the contract)', () => {
    const out = js(CALLBACK_NESTED)
    expect(out).toContain("class={(props.theme + '-btn')}")
    expect(out).not.toMatch(/class=\{cls\}/)
  })

  it('CONTRACT: native backend now inlines callback-nested prop-derived (R7 fixed)', () => {
    expect(rust(CALLBACK_NESTED)).toBe(js(CALLBACK_NESTED))
    expect(rust(CALLBACK_NESTED)).toContain("class={(props.theme + '-btn')}")
  })

  it('CONTRACT: transitive prop-derived chain also inlines in a callback, both backends', () => {
    expect(rust(TRANSITIVE_CB)).toBe(js(TRANSITIVE_CB))
    expect(rust(TRANSITIVE_CB)).toContain('{((props.x) + 1)}')
  })

  it('CONTRACT: a shadowing arrow param is NOT clobbered (filter prevents the R2 bug in Rust)', () => {
    // `items.map(a => <li>{a}</li>)` with outer `const a=props.x` — `a` is the
    // map param; recursing must NOT rewrite it to `(props.x)`.
    expect(rust(SHADOW_PARAM)).toBe(js(SHADOW_PARAM))
    expect(rust(SHADOW_PARAM)).not.toContain('(props.x) =>')
  })

  it('both backends agree on the DIRECT (non-callback) case (unchanged)', () => {
    expect(js(DIRECT)).toBe(rust(DIRECT))
  })
})
