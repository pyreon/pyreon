/**
 * Compiler hardening — Round 14 (SSR-mode robustness; no bug found).
 *
 * Rounds 1–13 were all client-mode. SSR mode (`{ ssr: true }`) disables
 * template emission (`if (ssr) return false`) and leaves JSX as
 * accessor-wrapped expressions for the SSR renderer. Probed 8 adversarial
 * shapes — all emit parseable code, and the correctness-critical contracts
 * hold in SSR exactly as in client mode: prop-derived consts still inline,
 * signals still auto-call, and the R11 shadow fix still suppresses a
 * destructured callback param. This locks SSR-mode parity for the bug fixes
 * so a future SSR-path change can't silently regress them.
 */
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const ssr = (c: string): string => transformJSX_JS(c, 'c.tsx', { ssr: true }).code ?? ''
const parses = (o: string): boolean => {
  try {
    return (parseSync('o.tsx', o).errors?.length ?? 0) === 0
  } catch {
    return false
  }
}

describe('Round 14 — SSR-mode codegen parity', () => {
  it('SSR never throws / always emits parseable code (8 adversarial shapes)', () => {
    const shapes = [
      `function C(p){ return <div class={p.c}>{p.t}</div> }`,
      `function C(p){ return <div {...p}>{p.k}</div> }`,
      `function C(p){ return <>{p.a}<span>{p.b}</span></> }`,
      `function C(){ const h=<h1>T</h1>; return <div>{h}<p>x</p></div> }`,
      `function C(p){ return <section><h1>{p.t}</h1><p>{p.b}</p></section> }`,
    ]
    for (const s of shapes) expect(parses(ssr(s)), s).toBe(true)
  })

  it('prop-derived const still inlines in SSR (R2/R7 parity)', () => {
    expect(
      ssr(
        `function C(p){ const c=p.x+'-b'; return <ul>{p.i.map(i=><li class={c}>{i}</li>)}</ul> }`,
      ),
    ).toContain("class={(p.x+'-b')}")
  })

  it('signal still auto-calls in SSR', () => {
    expect(ssr(`function C(){ const s=signal(0); return <div>{s}</div> }`)).toContain('s()')
  })

  it('R11 shadow fix applies in SSR (destructured param NOT auto-called)', () => {
    expect(
      ssr(`function C(){ const x=signal(0); return <ul>{[{x:1}].map(({x})=><li>{x}</li>)}</ul> }`),
    ).not.toContain('{x()}')
  })
})
