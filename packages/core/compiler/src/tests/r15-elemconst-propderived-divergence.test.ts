/**
 * Compiler hardening — Round 15 (PROVEN JS↔Rust divergence; characterized,
 * not rush-fixed — both backends are runtime-correct).
 *
 * When an element-valued const's JSX initializer READS PROPS, the binding is
 * BOTH `elementVars` (R9: JSX initializer) AND prop-derived (R2: its init
 * reads `props.*`). The two mechanisms resolve it differently per backend:
 *
 *   const h = <h1>{p.t}</h1>;  return <div>{h}<p>x</p></div>
 *
 *   JS  : _mountSlot((<h1>{p.t}</h1>), …)   (R9 _mountSlot routing, but the
 *                                           prop-derived init is substituted
 *                                           in — a fresh h1 per mount)
 *   Rust: _mountSlot(h, …)                  (R9 _mountSlot routing with the
 *                                           element-const ref — ONE element,
 *                                           its internal _bind patches p.t)
 *
 * Both are reactive-correct, but the codegen DIVERGES — violating #687's
 * "native 1:1 with JS" contract — and the runtime behavior differs (JS
 * recreates the DOM subtree; Rust patches in place, which is arguably the
 * better behavior). The correct unification direction is debatable (likely
 * make JS match Rust's patch-in-place, NOT the reverse), so this is locked
 * and characterized rather than speculatively fixed in a hardening sweep —
 * picking a side here risks regressing the very common
 * `const header = <h1>{props.title}</h1>` pattern. `it.fails` flips the
 * moment a deliberate unification lands.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const j = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''
const r = (c: string): string => transformJSX(c, 'c.tsx').code ?? ''
const SRC = `function C(p){ const h = <h1>{p.t}</h1>; return <div>{h}<p>x</p></div> }`

describe('Round 15 — element-const whose initializer reads props (JS↔Rust)', () => {
  it('JS _mountSlots the substituted prop-derived initializer (fresh element)', () => {
    const out = j(SRC)
    expect(out).toContain('_mountSlot((<h1>{p.t}</h1>)')
  })

  it('native backend _mountSlots the element-const reference (patch-in-place)', () => {
    const out = r(SRC)
    expect(out).toMatch(/_mountSlot\(\s*h\b/)
    expect(out).not.toContain('_mountSlot((<h1>{p.t}</h1>)')
  })

  // Self-discriminating divergence lock — both runtime-correct today; flips
  // when a deliberate JS↔Rust unification lands (then delete .fails + the
  // pin above and assert the chosen single shape).
  it.fails('KNOWN DIVERGENCE: prop-reading element-const differs JS vs Rust (flip on unify)', () => {
    expect(j(SRC)).toBe(r(SRC))
  })

  // Control: a NON-prop-reading element-const is identical in both (R9 parity
  // — proven in Round 15's probe; this guards the lock isn't vacuous).
  it('CONTROL: a static element-const child is identical JS↔Rust', () => {
    const s = `function C(){ const h=<h1>T</h1>; return <div>{h}<p>x</p></div> }`
    expect(j(s)).toBe(r(s))
  })
})
