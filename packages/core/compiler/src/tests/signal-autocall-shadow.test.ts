/**
 * Compiler hardening — Round 11 (REAL bug, FIXED + bisect-verified).
 *
 * The signal-auto-call rewrite (`autoCallSignals` → `findSignalIdents`,
 * jsx.ts) inserts `()` after every active-signal-named identifier. Its
 * skip-list handled MemberExpr / VarDeclarator / Property-key|shorthand but
 * NOT callback parameter binding positions, and `findSignalIdents` did its
 * OWN scope-blind recursive walk over the wrapped expression. So a
 * destructured/plain callback param reusing a signal's name was wrongly
 * auto-called:
 *
 *   const x = signal(0)
 *   <ul>{[{x:1}].map(({x}) => <li>{x}</li>)}</ul>
 *     →  …map(({x}) => <li>{x()}</li>)   // x is the map item (1) → 1()
 *                                        // → runtime TypeError
 *
 * Trigger: an inline object/array literal in the expr whose property name
 * collides with a signal makes `referencesSignalVar` fire, invoking the
 * scope-blind `autoCallSignals` over the whole expression. This is the exact
 * signal twin of R2's prop-derived scope-blind inlining.
 *
 * Fix: `findSignalIdents` is now block-accurate scope-aware (mirrors R2's
 * `findIdents`): a `scopeBoundSignals(node)` collects signal-named bindings a
 * scope introduces (params incl. nested/destructured patterns, nested const,
 * catch/loop vars), threaded through a `shadowed` set with enter/leave so a
 * shadowed name is never auto-called. Legitimate (non-shadowed) signal reads
 * still auto-call — proven by the CONTROL specs.
 *
 * Bisect: drop `&& !shadowed.has(node.name)` from the `findSignalIdents`
 * active-signal guard → the SHADOW specs fail (emit `{x()}` / `id()`); the
 * CONTROL specs stay green (no over-suppression). Restore → all pass.
 */
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const emit = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''
const parses = (o: string): boolean => {
  try {
    return (parseSync('o.tsx', o).errors?.length ?? 0) === 0
  } catch {
    return false
  }
}

describe('Round 11 — signal auto-call respects lexical shadowing', () => {
  it('destructured-shorthand callback param shadowing a signal is NOT auto-called', () => {
    const out = emit(
      `function C(){ const x = signal(0); return <ul>{[{x:1}].map(({x}) => <li>{x}</li>)}</ul> }`,
    )
    expect(parses(out)).toBe(true)
    expect(out).not.toContain('{x()}')
    expect(out).toContain('({x}) => <li>{x}</li>')
  })

  it('destructured param shadowing a signal in a filter predicate is NOT auto-called', () => {
    const out = emit(
      `function C(){ const id = signal(0); return <ul>{[{id:1}].filter(({id}) => id > 0).map(r => <li>{r}</li>)}</ul> }`,
    )
    expect(parses(out)).toBe(true)
    expect(out).not.toMatch(/\(\{id\}\) => id\(\)/)
  })

  it('renamed destructured value param shadowing a signal is NOT auto-called', () => {
    const out = emit(
      `function C(){ const v = signal(0); return <ul>{[{k:1}].map(({k: v}) => <li>{v}</li>)}</ul> }`,
    )
    expect(out).not.toContain('{v()}')
  })

  it('plain callback param shadowing a signal is NOT auto-called', () => {
    const out = emit(
      `function C(){ const s = signal(0); return <ul>{[1].map(s => <li>{s}</li>)}</ul> }`,
    )
    expect(out).not.toContain('{s()}')
  })

  // ── CONTROL: legitimate signal reads MUST still auto-call ──
  it('CONTROL: a direct non-shadowed signal child still auto-calls', () => {
    expect(emit(`function C(){ const s = signal(0); return <div>{s}</div> }`)).toContain(
      '__t0.data = s()',
    )
  })

  it('CONTROL: a non-shadowed signal SIBLING of a shadowing callback still auto-calls', () => {
    const out = emit(
      `function C(){ const s = signal(0); return <div>{[1].map(s => <i>{s}</i>)}<b>{s}</b></div> }`,
    )
    expect(out).not.toContain('<i>{s()}</i>') // the shadowing param — not called
    expect(out).toContain('__t0.data = s()') // the real signal sibling — called
  })

  it('CONTROL: signal.set in a handler is not auto-called but its arg is', () => {
    const out = emit(
      `function C(){ const s = signal(0); return <button onClick={() => s.set(s() + 1)}>{s}</button> }`,
    )
    expect(out).toContain('s.set(s() + 1)')
    expect(out).toContain('__t0.data = s()')
  })
})
