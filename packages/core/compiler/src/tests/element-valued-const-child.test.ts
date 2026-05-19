/**
 * Compiler hardening — Round 9 (REAL bug, FIXED + bisect-verified).
 *
 *   const header = <h1>T</h1>
 *   return <div>{header}<p>x</p></div>
 *
 * Pre-fix the compiler lowered the const to `_tpl(...)` (so it KNEW `header`
 * was a `NativeItem` element) yet still emitted
 * `document.createTextNode(header)` for the `{header}` child — `createTextNode`
 * string-coerces the NativeItem → "[object Object]" instead of the `<h1>`.
 * Only `props.children` / `own.children` reached the correct `_mountSlot`.
 *
 * Fix (jsx.ts): an `elementVars` set tracks `const`/`let` bindings whose
 * initializer is a JSX element/fragment (optionally parenthesized); a bare
 * `{el}` child of such a binding routes through `_mountSlot` — the same
 * general child-insert `props.children` uses. Tight by construction: only a
 * DIRECT JSX initializer reclassifies, so string/number/prop-derived/inline-
 * hoisted children keep their existing (correct) paths. Routing is safe even
 * under later same-name shadowing — `_mountSlot` renders strings/numbers
 * correctly too; the only cost of imprecision is skipping the text fast path.
 *
 * NOT contradicted by `jsx.test.ts:777` `createTextNode(label)` — that pins
 * the FREE undeclared identifier default (genuinely ambiguous); this fix only
 * fires when the binding's initializer is provably JSX.
 *
 * Bisect: revert the `isElementValuedIdent` clause in `processOneChild`
 * (jsx.ts) → the CONTRACT specs fail (emit reverts to `createTextNode(header)`)
 * while every CONTROL spec stays green (proving the fix doesn't touch the
 * text/reactive fast paths). Restore → all pass.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const emit = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''
const ELEMENT_CONST = `function C(){ const header = <h1>T</h1>; return <div>{header}<p>x</p></div> }`

describe('Round 9 — element-valued const used as a bare JSX child', () => {
  it('CONTROL: string/number const child still uses the correct text fast path', () => {
    expect(emit(`function C(){ const t = 'T'; return <div>{t}<p>x</p></div> }`)).toContain('createTextNode(t)')
    expect(emit(`function C(){ const n = 5; return <div>{n}</div> }`)).toContain('textContent = n')
  })

  it('CONTROL: an INLINE element child is correctly hoisted (not text-coerced)', () => {
    const out = emit(`function C(){ return <div>{<h1>T</h1>}<p>x</p></div> }`)
    expect(out).toMatch(/const _\$h\d+ =/)
    expect(out).not.toMatch(/createTextNode\(_\$h\d+\)/)
  })

  it('CONTRACT: element-valued const child is mounted via _mountSlot, not text-coerced', () => {
    const out = emit(ELEMENT_CONST)
    expect(out).toContain('const header = _tpl("<h1>T</h1>"')
    expect(out).not.toContain('createTextNode(header)')
    expect(out).toMatch(/_mountSlot\(\s*header\b/)
  })

  it('CONTRACT: single bare element-const child, parenthesized init, and let all mount', () => {
    expect(emit(`function C(){ const el = <span>hi</span>; return <div>{el}</div> }`)).toMatch(/_mountSlot\(\s*el\b/)
    expect(emit(`function C(){ const el = (<b>x</b>); return <div>{el}</div> }`)).toMatch(/_mountSlot\(\s*el\b/)
    expect(emit(`function C(){ let el = <a/>; return <div>{el}</div> }`)).toMatch(/_mountSlot\(\s*el\b/)
  })
})
