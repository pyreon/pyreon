/**
 * Compiler hardening — Round 6 (state-isolation lock; no leak found).
 *
 * Probed: does the JS transform leak across calls? All per-transform caches
 * (`_isDynamicCache`, `resolvedCache`, `resolving`, `warnedCycles`) are
 * declared INSIDE `transformJSX_JS` (function scope → GC'd per call); the only
 * module-level state is immutable constant lookup Sets (`PURE_CALLS`,
 * `VOID_ELEMENTS`, `SKIP_PROPS`, …). Empirically 8000 transforms added
 * ~0.2KB/call of short-lived (collectable) allocation — no retention path.
 *
 * Not a heap-threshold test (those are flaky under parallel vitest / GC
 * timing — the project explicitly avoids them). Instead this locks the
 * DETERMINISTIC structural guarantee a leak/contamination regression would
 * break: cross-call output isolation + constant-Set integrity. If someone
 * later hoists a per-transform cache to module scope (the classic leak
 * regression), the same input would start producing drifting output and/or
 * the constant Sets would mutate — caught here without heap timing.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const emit = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''

describe('Round 6 — transform state is per-call isolated (leak/contamination gate)', () => {
  it('identical input → byte-identical output across 500 interleaved calls', () => {
    const a = `function A(p){ const v=p.x; return <ul>{p.items.map(i => <li>{v}{i}</li>)}</ul> }`
    const b = `function B(){ const s=signal(0); return <button onClick={()=>s.set(1)}>{s()}</button> }`
    const a0 = emit(a)
    const b0 = emit(b)
    for (let i = 0; i < 500; i++) {
      // Interleave different shapes so any module-level cache keyed by
      // node.start (collides across files) would drift the output.
      expect(emit(b)).toBe(b0)
      expect(emit(a)).toBe(a0)
    }
  })

  it('constant lookup Sets are not mutated by transforms', () => {
    // PURE_CALLS / VOID_ELEMENTS behavior must be stable after heavy use.
    for (let i = 0; i < 200; i++) {
      emit(`function C(p){ return <div>{Math.max(p.x, 0)}</div> }`)
      emit(`function C(){ return <br /> }`)
    }
    // br stays verbatim (VOID/self-closing contract) and Math.max with a
    // dynamic arg stays reactive (PURE_CALLS not corrupted to "always pure").
    expect(emit(`function C(){ return <br /> }`)).toContain('<br />')
    expect(emit(`function C(p){ return <div>{Math.max(p.x,0)}</div> }`)).toContain('_bind(')
  })
})
