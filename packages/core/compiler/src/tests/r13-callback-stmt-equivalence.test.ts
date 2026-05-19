/**
 * Compiler hardening — Round 13 (REAL JS↔Rust divergence, FIXED + bisect).
 *
 * R7 (#687) taught the native `collect_prop_derived_idents` to recurse into
 * callback bodies — but its `collect_pd_in_stmt` only handled
 * Expression/Return/VarDecl/If/Block, with `_ => {}` skipping
 * For/While/DoWhile/Switch/Try/Labeled. So a prop-derived const used inside a
 * callback whose body is one of those shapes still lost reactivity in the
 * NATIVE backend (preferred in prod) while the JS backend inlined it — the
 * exact R7 reactivity-loss class, narrower shapes (e.g. `try { return <li
 * class={c}/> } catch …` in a render callback — plausible defensive render).
 *
 * Fix: native/src/lib.rs `collect_pd_in_stmt` now also handles
 * For/ForIn/ForOf/While/DoWhile/Switch/Try/Labeled, with the SAME
 * `pd_minus`/`collect_bind_pattern_names` shadow-filter discipline as the
 * Block/If arms (so loop/catch-param bindings shadow correctly and the
 * over-substitution clobber is NOT re-introduced — verified by the
 * catch-param spec).
 *
 * Bisect: replace the new arms with `_ => {}` + `bun scripts/build-native.ts`
 * → these specs fail (Rust emits `class={c}`, JS `class={(p.x+'-b')}`).
 * Restore + rebuild → all pass. The 180 native-equivalence tests + full
 * suite remain green (no regression).
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const j = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''
const r = (c: string): string => transformJSX(c, 'c.tsx').code ?? ''

const CASES: Array<[string, string]> = [
  ['while', `function C(p){ const c=p.x+'-b'; return <ul>{p.i.map(i => { while(i){ return <li class={c}/> } })}</ul> }`],
  ['switch', `function C(p){ const c=p.x+'-b'; return <ul>{p.i.map(i => { switch(i){ default: return <li class={c}/> } })}</ul> }`],
  ['labeled', `function C(p){ const c=p.x+'-b'; return <ul>{p.i.map(i => { lbl: { return <li class={c}/> } })}</ul> }`],
  ['try-catch', `function C(p){ const c=p.x+'-b'; return <ul>{p.i.map(i => { try { return <li class={c}/> } catch { return null } })}</ul> }`],
  ['for', `function C(p){ const c=p.x+'-b'; return <ul>{p.i.map(i => { for(let k=0;k<i;k++){ return <li class={c}/> } })}</ul> }`],
]

describe('Round 13 — prop-derived inlining inside callback statement shapes is JS≡Rust', () => {
  for (const [name, src] of CASES) {
    it(`${name}: native backend matches JS (inlines the prop-derived const)`, () => {
      expect(r(src)).toBe(j(src))
      expect(r(src)).toContain("class={(p.x+'-b')}")
    })
  }

  it('catch-param shadowing is NOT clobbered (filter discipline, both backends)', () => {
    const src = `function C(p){ const e=p.x+'-b'; return <ul>{p.i.map(i => { try {} catch (e) { return <li class={e}/> } })}</ul> }`
    expect(r(src)).toBe(j(src))
    expect(r(src)).not.toContain("class={(p.x+'-b')}") // `e` is the catch param
  })

  it('nested const inside a while body shadowing the prop-derived is NOT clobbered (no R2 regression)', () => {
    const src = `function C(p){ const c=p.x; return <ul>{p.i.map(i => { while(i){ const c=2; return <li>{c}</li> } })}</ul> }`
    expect(r(src)).toBe(j(src))
    expect(r(src)).not.toContain('{(p.x)}') // inner `const c=2` shadows — must stay `{c}`
  })
})
