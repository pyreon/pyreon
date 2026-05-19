/**
 * Compiler hardening — Round 2.
 *
 * The prop-derived reactive-props inlining pass (`resolveIdentifiersInText`
 * in jsx.ts) used to substitute every identifier matching a prop-derived
 * const NAME, with zero lexical-scope analysis. Idiomatic code that reuses a
 * short name (`a` / `x` / `i` / `item`) as a callback param or nested local
 * while a prop-derived const of the same name exists was MISCOMPILED:
 *
 *   const a = props.x
 *   items.map(a => <li>{a}</li>)
 *     →  items.map((props.x) => <li>{(props.x)}</li>)   // un-parseable JS
 *
 * Two cases emitted literally un-parseable JavaScript (arrow-param,
 * catch-param); the rest silently rebound the wrong identifier. The
 * signal-auto-call pass was already scope-aware (`shadowedSignals`); the fix
 * gives the prop-derived pass the same block-accurate shadow discipline.
 *
 * Bisect: revert `scopeBoundPropDerived` / the `!shadowed.has(...)` guard in
 * jsx.ts → the SHADOW specs fail (un-parseable emit / wrong substitution);
 * the no-shadow + transitive specs keep passing (they are the over-suppression
 * guard — the fix must NOT stop inlining where there is no shadow). Restore →
 * all pass.
 */
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const emit = (code: string): string => transformJSX_JS(code, 'c.tsx').code ?? ''
const parses = (out: string): boolean => {
  try {
    return (parseSync('o.tsx', out).errors?.length ?? 0) === 0
  } catch {
    return false
  }
}

describe('prop-derived inlining — lexical shadowing is respected', () => {
  it('arrow-function parameter shadowing a prop-derived const is NOT rewritten (was un-parseable)', () => {
    const out = emit(`function C(props){ const a = props.x; return <ul>{props.items.map(a => <li>{a}</li>)}</ul> }`)
    expect(parses(out)).toBe(true)
    expect(out).not.toContain('(props.x) =>')
    expect(out).toContain('.map(a => <li>{a}</li>)')
  })

  it('catch-clause parameter shadowing a prop-derived const is NOT rewritten (was un-parseable)', () => {
    const out = emit(`function C(props){ const e = props.err; const h = () => { try {} catch (e) { return e } }; return <i>{h()}</i> }`)
    expect(parses(out)).toBe(true)
    expect(out).toContain('catch (e)')
    expect(out).toContain('return e')
  })

  it('named-function parameter shadowing a prop-derived const keeps the parameter binding', () => {
    const out = emit(`function C(props){ const x = props.x; function row(x){ return <td>{x}</td> } return <table>{props.rows.map(row)}</table> }`)
    expect(parses(out)).toBe(true)
    expect(out).toContain('function row(x)')
    expect(out).toMatch(/__t0\.data = x\b/) // the row PARAM, not (props.x)
  })

  it('nested const shadowing a prop-derived const is not clobbered', () => {
    const out = emit(`function C(props){ const a = props.x; const g = () => { const a = 7; return a }; return <b>{g()}</b> }`)
    expect(parses(out)).toBe(true)
    expect(out).toContain('const a = 7; return a')
    expect(out).not.toContain('const a = 7; return (props.x)')
  })

  it('block-scoped shadow does NOT over-suppress an outer-scope reference (block accuracy)', () => {
    const out = emit(`function C(props){ const a = props.x; { const a = 'inner'; } return <div>{a}</div> }`)
    expect(out).toContain('(props.x)') // {a} is OUTSIDE the shadowing block → still inlined
  })
})

describe('prop-derived inlining — no-shadow paths still inline (over-suppression guard)', () => {
  it('non-shadowing callback still inlines the prop-derived const', () => {
    const out = emit(`function C(props){ const a = props.x; return <ul>{props.items.map(it => <li>{a}{it}</li>)}</ul> }`)
    expect(out).toContain('(props.x)')
    expect(out).toContain('it') // the genuine callback param is untouched
  })

  it('transitive chain still resolves through to props', () => {
    const out = emit(`function C(props){ const a = props.x; const b = a + 1; const c = b * 2; return <div>{c}</div> }`)
    expect(out).toContain('(((props.x) + 1) * 2)')
  })

  // Scope PRECISION: a `for (let i=…)` head block-scopes `i` to the loop. A
  // `return i` AFTER the loop is out of the loop's scope and resolves to the
  // OUTER prop-derived `const i` — so it MUST still inline. (Proven: in plain
  // JS, `const i='OUTER'; (() => { for(let i=0;i<3;i++){} return i })()` ===
  // 'OUTER'.) This guards against an over-broad shadow heuristic that would
  // wrongly treat the non-escaping loop var as a shadow at the post-loop use.
  it('does NOT over-suppress: post-loop reference is the outer prop-derived const', () => {
    const out = emit(`function C(props){ const i = props.start; const f = () => { for (let i=0;i<3;i++){} return i }; return <s>{f()}</s> }`)
    expect(parses(out)).toBe(true)
    expect(out).toContain('return (props.start)')
  })
})
