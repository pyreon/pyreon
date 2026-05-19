/**
 * Compiler hardening — Round 15 (PROVEN JS↔Rust divergence in the R2×R9
 * interaction; design-decision scoped, not a rushed fix).
 *
 *   const cls = props.x + '-b'        // prop-derived (R2)
 *   const el  = <i class={cls}/>      // element-valued const (R9)
 *   return <div>{el}<span class={cls}/></div>
 *
 *   JS  : _mountSlot((<i class={(props.x+'-b')}/>), …)   // R2 inlines el's
 *         whole JSX initializer (reactive class) into the mountSlot arg
 *   Rust: _mountSlot(el, …)                              // mounts the const
 *         NativeItem (class frozen at component init)
 *
 * Two distinct behaviours: JS is more-reactive but inlines/duplicates the
 * element JSX (an element-const used at N sites would be re-created N times);
 * Rust mounts the single const but its prop-derived class is frozen. Neither
 * is obviously "the contract" — element-const ALSO transitively prop-derived
 * is an unspecified corner where R2's inlining and R9's _mountSlot routing
 * collide. The simple element-const case (`const h=<h1/>; {h}`) and
 * element-const-reused-twice are IDENTICAL across backends (proven below) —
 * the divergence is specifically the prop-derived-referencing element-const.
 *
 * Resolving it needs a deliberate semantic decision (should an element-const
 * be inlined-and-duplicated when it references a prop-derived var, or mounted
 * once with the prop-derived part still reactive?) — a design call for a
 * focused follow-up, not a tail-of-sweep guess. `it.fails` locks the
 * divergence and auto-alerts when the semantics are unified.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const js = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''
const rust = (c: string): string => transformJSX(c, 'c.tsx').code ?? ''

const PD_ELEM = `function C(p){ const cls=p.x+'-b'; const el=<i class={cls}/>; return <div>{el}<span class={cls}/></div> }`
const SIMPLE = `function C(){ const h=<h1>T</h1>; return <div>{h}<p>x</p></div> }`
const REUSED = `function C(){ const ic=<svg/>; return <div>{ic}<span>{ic}</span></div> }`

describe('Round 15 — element-const × prop-derived interaction (JS↔Rust)', () => {
  it('CONVERGENT: a simple element-const child agrees in both backends', () => {
    expect(rust(SIMPLE)).toBe(js(SIMPLE))
    expect(rust(SIMPLE)).toContain('_mountSlot(h')
  })

  it('CONVERGENT: an element-const reused at two sites agrees in both backends', () => {
    expect(rust(REUSED)).toBe(js(REUSED))
  })

  it('JS inlines the prop-derived-referencing element-const (reactive class)', () => {
    expect(js(PD_ELEM)).toContain("_mountSlot((<i class={(p.x+'-b')}/>)")
  })

  it('pins native: mounts the const identifier (frozen class) — delete when unified', () => {
    expect(rust(PD_ELEM)).toContain('_mountSlot(el')
  })

  it.fails('KNOWN DIVERGENCE — element-const that references a prop-derived var (flip when unified)', () => {
    expect(rust(PD_ELEM)).toBe(js(PD_ELEM))
  })
})
