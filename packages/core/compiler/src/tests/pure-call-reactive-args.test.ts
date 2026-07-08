/**
 * Compiler hardening — Round 4 (contract lock; hypothesis disproven = no bug).
 *
 * Hypothesis probed: does a "pure" call (Math.* / JSON.* / Object.* / String /
 * Number — the ~40 fns `isPureStaticCall` treats as side-effect-free) get
 * mis-classified as STATIC when its ARGUMENTS are reactive (signal / prop)?
 * That would silently drop reactivity (the value renders once, never updates).
 *
 * Result: NOT a bug — `shouldWrap`/`isDynamic` correctly inspect arguments, so
 * a pure callee with a dynamic arg is still reactively wrapped. This file is
 * the self-discriminating regression gate for that contract: if someone later
 * "optimizes" pure-call detection to skip wrapping by callee name alone, these
 * specs fail (the exact stale-render bug that optimization would introduce).
 *
 * Bisect: make `isPureStaticCall` short-circuit `shouldWrap` regardless of
 * args → every spec here fails (emit becomes `_setChild(__root,
 * Math.max(n(),0))`, no `bindPolymorphicText`). Restore → all pass. The
 * fully-static control proves the gate does not just assert "always reactive".
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const emit = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''
const isReactive = (o: string): boolean => /bindPolymorphicText\(|_bindText\(/.test(o)

describe('Round 4 — pure call with a DYNAMIC argument must stay reactive', () => {
  it('Math.max(signal(), 0) is reactively wrapped', () => {
    expect(isReactive(emit(`function C(){ const n=signal(0); return <div>{Math.max(n(),0)}</div> }`))).toBe(true)
  })
  it('Math.round(props.x) is reactively wrapped', () => {
    expect(isReactive(emit(`function C(p){ return <div>{Math.round(p.x)}</div> }`))).toBe(true)
  })
  it('JSON.stringify(props.o) is reactively wrapped', () => {
    expect(isReactive(emit(`function C(p){ return <div>{JSON.stringify(p.o)}</div> }`))).toBe(true)
  })
  it('Object.keys(props.o).length is reactively wrapped', () => {
    expect(isReactive(emit(`function C(p){ return <div>{Object.keys(p.o).length}</div> }`))).toBe(true)
  })
  it('String(props.x) is reactively wrapped', () => {
    expect(isReactive(emit(`function C(p){ return <div>{String(p.x)}</div> }`))).toBe(true)
  })

  // Control: a pure call with ONLY static args is correctly STATIC (proves
  // the gate is not vacuously "everything is reactive").
  it('Math.max(1,2,3) with only static args is NOT wrapped', () => {
    const o = emit(`function C(){ return <div>{Math.max(1,2,3)}</div> }`)
    expect(isReactive(o)).toBe(false)
    expect(o).toContain('_setChild(__root, Math.max(1,2,3))')
  })
})
