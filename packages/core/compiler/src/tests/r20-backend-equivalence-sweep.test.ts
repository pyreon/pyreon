/**
 * Compiler hardening — Round 20 (JS↔Rust equivalence sweep, R11–R19 corpus).
 *
 * The dual backends MUST emit byte-identical output. This sweep locks the
 * adversarial corpus surfaced in rounds 11–19 where BOTH backends agree, so a
 * future one-backend change that introduces a divergence (the recurring
 * R7/R13/R15 one-backend-change failure mode) is caught immediately. R11's
 * and R13's fixes CONVERGED the backends (R11 brought JS onto the
 * already-correct Rust; R13's gate/collector fix realigned native with JS,
 * which also resolved the R15 element-const×prop-derived divergence) — those
 * shapes must now stay identical, asserted here. The earlier self-
 * discriminating `it.fails` divergence locks auto-flipped on resolution and
 * were removed; R15's residual is a deterministic JS-backend
 * characterization (r15-elemconst-propderived.test.ts).
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const EQUIVALENT: Array<[string, string]> = [
  // R11 — signal-auto-call shadowing (JS converged to Rust)
  ['r11-destructured-param', `function C(){ const x = signal(0); return <ul>{[{x:1}].map(({x}) => <li>{x}</li>)}</ul> }`],
  ['r11-filter-obj-param', `function C(){ const id = signal(0); return <ul>{[{id:1}].filter(({id}) => id > 0).map(r => <li>{r}</li>)}</ul> }`],
  ['r11-plain-param-shadow', `function C(){ const s = signal(0); return <ul>{[1].map(s => <li>{s}</li>)}</ul> }`],
  ['r11-direct-signal', `function C(){ const s = signal(0); return <div>{s}</div> }`],
  ['r11-signal-shadow-sibling', `function C(){ const s = signal(0); return <div>{[1].map(s => <i>{s}</i>)}<b>{s}</b></div> }`],
  // R16 — knownSignals (cross-module signal) path
  ['r16-knownsignal-shadow', `function C(){ return <ul>{[{count:1}].map(({count}) => <li>{count}</li>)}</ul> }`],
  // R15 — element-const interactions that DO converge
  ['r15-simple-elem-const', `function C(){ const h=<h1>T</h1>; return <div>{h}<p>x</p></div> }`],
  ['r15-elem-const-reused', `function C(){ const ic=<svg/>; return <div>{ic}<span>{ic}</span></div> }`],
  // R17 — spread depth
  ['r17-root-spread-reactive', `function C(p){ const s=signal(0); return <div {...p} onClick={()=>s.set(1)}>{s}</div> }`],
  ['r17-component-spread-pd', `function C(p){ const c=p.x+'-b'; return <Comp {...p} class={c}/> }`],
  ['r17-double-spread', `function C(p){ return <div {...p.a} {...p.b}>{p.c}</div> }`],
  // R18 — hoisting × elementVars
  ['r18-hoist-vs-elemconst', `function C(){ const e=<b>x</b>; return <div>{<i/>}{e}</div> }`],
  ['r18-elemconst-reused-3x', `function C(){ const e=<hr/>; return <div>{e}{e}{e}</div> }`],
  // R13 — the convergent control (return-body callback)
  ['r13-return-cb', `function C(p){ const c=p.x+'-b'; return <ul>{p.i.map(i => { return <li class={c}>{i}</li> })}</ul> }`],
  // general
  ['mixed', `function C(p){ const a=p.x; return <section><h1>{a}</h1>{p.i.map(i=><p key={i.id}>{i.t}</p>)}</section> }`],
]

describe('Round 20 — JS↔Rust byte-equivalence (R11–R19 corpus)', () => {
  for (const [name, code] of EQUIVALENT) {
    it(`${name}: JS ≡ Rust`, () => {
      expect(transformJSX(code, 'c.tsx').code).toBe(transformJSX_JS(code, 'c.tsx').code)
    })
  }
})
