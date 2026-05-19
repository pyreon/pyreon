/**
 * Compiler hardening — Round 15 (element-const that references a prop-derived
 * var) — consolidated, deterministic JS-backend characterization.
 *
 * Original finding: `const cls = props.x + '-b'; const el = <i class={cls}/>;`
 * used as a bare `{el}` child sat at the intersection of R2 (prop-derived
 * inlining) and R9 (element-const → `_mountSlot`). The JS backend substitutes
 * the element-const's whole initializer into the mount call with the
 * prop-derived part inlined reactively:
 *   `_mountSlot((<i class={(props.x + '-b')}/>), …)`
 *
 * It was previously tracked by two duplicate, environment-fragile `it.fails`
 * JS↔Rust divergence locks. The R13 gate/collector fix
 * (`accesses_props` now recurses arrow/JSX → the element-const's prop-derived
 * ref is collected) realigned the native backend with JS — so the locks
 * correctly auto-flipped and were removed (lock→resolved, same lifecycle as
 * R7/R11/R13). JS↔Rust byte-equivalence is now gated generally by the R20
 * sweep + R13's own contract; this file keeps only the DETERMINISTIC,
 * native-independent JS-backend assertions (no `transformJSX` native call →
 * no build-artifact fragility, stable on every runner).
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const emit = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''

const PD_ELEM = `function C(p){ const cls=p.x+'-b'; const el=<i class={cls}/>; return <div>{el}<span class={cls}/></div> }`
const SIMPLE = `function C(){ const h=<h1>T</h1>; return <div>{h}<p>x</p></div> }`
const REUSED = `function C(){ const ic=<svg/>; return <div>{ic}<span>{ic}</span></div> }`

describe('Round 15 — element-const × prop-derived (JS backend characterization)', () => {
  it('JS inlines a prop-derived-referencing element-const into _mountSlot with a reactive class', () => {
    const out = emit(PD_ELEM)
    expect(out).toContain("_mountSlot((<i class={(p.x+'-b')}/>)")
    // the prop-derived class is the reactive form, not the frozen const ref
    expect(out).not.toMatch(/_mountSlot\(\s*el\b/)
  })

  it('a simple element-const child routes through _mountSlot (R9 baseline)', () => {
    expect(emit(SIMPLE)).toContain('_mountSlot(h')
  })

  it('an element-const reused at two sites routes both through _mountSlot', () => {
    const out = emit(REUSED)
    expect(out).toMatch(/_mountSlot\(\s*ic\b/)
  })
})
