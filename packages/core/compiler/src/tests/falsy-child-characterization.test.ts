/**
 * Compiler hardening — Round 3 (characterization, NOT a bug fix).
 *
 * Investigated: how the JSX transform emits falsy / boolean / null literal
 * children vs the JSX rendering contract (`true`/`false`/`null`/`undefined`
 * render nothing; `0` renders "0"; `''` renders empty).
 *
 * Finding: the patterns real code actually writes are CORRECT — a conditional
 * (`{c ? x : null}`) or short-circuit (`{c && <X/>}`) child routes through
 * `_mountSlot` with a `() =>` accessor (the wrapper keeps the `_tpl` fast path),
 * and the null/boolean is filtered by runtime `mountChild`, so nothing renders
 * (Pyreon's documented `VNodeChildAtom` `&&` contract holds).
 *
 * A CONTRIVED bare literal child (`<div>{false}</div>`) used to take the static
 * path and emit `_setChild(__root, false)` → the DOM stringified "false"; that
 * divergence was pinned here rather than fixed. It is now CLOSED as a side
 * effect of baking literal expression children into the template at compile
 * time (done for hydration adoption — see `literalChildText` in jsx.ts): a
 * boolean/null/undefined literal bakes nothing, `0` bakes "0", exactly the JSX
 * contract. The specs below lock the baked forms.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const emit = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''

describe('Round 3 — conditional/short-circuit children are accessor-wrapped (the contract that matters)', () => {
  it('ternary with a null branch routes through _mountSlot with a reactive accessor (runtime filters null)', () => {
    const out = emit(`function C(p){ return <div>{p.cond ? <a/> : null}</div> }`)
    // Element-conditional → wrapper keeps _tpl, child routes through _mountSlot
    // with a reactive accessor; mountChild filters the null branch at runtime.
    expect(out).toContain('_mountSlot(() => (p.cond ? <a/> : null)')
    expect(out).not.toContain('createTextNode(null)')
  })

  it('&& short-circuit routes through _mountSlot with a reactive accessor (the documented && pattern)', () => {
    const out = emit(`function C(p){ return <div>{p.show && <b/>}</div> }`)
    expect(out).toContain('_mountSlot(() => (p.show && <b/>)')
    expect(out).not.toContain('createTextNode(false)')
  })
})

describe('Round 3 — bare literal falsy children: pinned current behavior (contrived input)', () => {
  it('numeric 0 child renders "0" (JSX-correct) — baked into the template', () => {
    expect(emit(`function C(){ return <div>{0}</div> }`)).toContain('_tpl("<div>0</div>"')
  })

  // A bare `{false}` literal used to take the static child path
  // (`_setChild(__root, false)`) — a pinned divergence. A literal child now
  // BAKES at compile time, and a boolean literal bakes NOTHING, which is the
  // JSX-correct rendering; the divergence is closed rather than pinned.
  it('bare {false} literal bakes nothing (JSX-correct)', () => {
    const out = emit(`function C(){ return <div>{false}</div> }`)
    expect(out).toContain('_tpl("<div></div>"')
    expect(out).not.toContain('_setChild')
  })
})
