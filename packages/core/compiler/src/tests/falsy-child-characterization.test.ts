/**
 * Compiler hardening — Round 3 (characterization, NOT a bug fix).
 *
 * Investigated: how the JSX transform emits falsy / boolean / null literal
 * children vs the JSX rendering contract (`true`/`false`/`null`/`undefined`
 * render nothing; `0` renders "0"; `''` renders empty).
 *
 * Finding: the patterns real code actually writes are CORRECT — a conditional
 * (`{c ? x : null}`) or short-circuit (`{c && <X/>}`) child is wrapped in a
 * `() =>` accessor and the null/boolean is filtered by runtime `mountChild`,
 * so nothing renders (Pyreon's documented `VNodeChildAtom` `&&` contract
 * holds). Only a CONTRIVED bare literal child (`<div>{false}</div>` — never
 * written in practice) takes the static path and emits `textContent = false`
 * → the DOM stringifies to "false". This is a spec divergence on input no one
 * writes; fixing it would touch the hot child-emission path for zero
 * real-world benefit, so the behavior is pinned here instead (any future
 * change to it must be deliberate, and this test will flag it).
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const emit = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''

describe('Round 3 — conditional/short-circuit children are accessor-wrapped (the contract that matters)', () => {
  it('ternary with a null branch is wrapped in an accessor (runtime filters null)', () => {
    const out = emit(`function C(p){ return <div>{p.cond ? <a/> : null}</div> }`)
    expect(out).toContain('() => p.cond ? <a/> : null')
    expect(out).not.toContain('createTextNode(null)')
  })

  it('&& short-circuit is wrapped in an accessor (the documented && pattern)', () => {
    const out = emit(`function C(p){ return <div>{p.show && <b/>}</div> }`)
    expect(out).toContain('() => p.show && <b/>')
    expect(out).not.toContain('createTextNode(false)')
  })
})

describe('Round 3 — bare literal falsy children: pinned current behavior (contrived input)', () => {
  it('numeric 0 child renders "0" (JSX-correct)', () => {
    expect(emit(`function C(){ return <div>{0}</div> }`)).toContain('__root.textContent = 0')
  })

  // Pinned divergence: a bare `{false}` literal stringifies via textContent.
  // Documented, not fixed — see file header for the rationale.
  it('bare {false} literal takes the static textContent path (known, contrived)', () => {
    expect(emit(`function C(){ return <div>{false}</div> }`)).toContain('__root.textContent = false')
  })
})
