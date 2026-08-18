/**
 * Sibling-ref chaining: a K-child template must cost O(K) DOM property reads,
 * not O(K²).
 *
 * `childNodeAccessor` used to build every child ref as an INDEPENDENT walk from
 * its parent — `__root.firstElementChild`,
 * `__root.firstElementChild.nextElementSibling`, … — so child N cost N+1
 * pointer reads and a K-child row cost 1+2+…+K. Nesting compounded it, because
 * a non-dynamic element passes its own full walk down as its children's
 * `parentRef`. Chaining each phase-1 capture off the nearest node another
 * phase-1 const already holds makes each ref O(1).
 *
 * Measured ceiling (isolated, 10,000 rows, `examples/benchmark/probe-refwalk.ts`):
 * 2 referenced children 20µs · 4 children 335µs · 8 children 1.95ms. So it is
 * below the noise floor on a 2-cell krausest-style row and a real win on the
 * wide rows a real app renders — which is why the specs below assert the SHAPE
 * (hop counts) rather than a timing.
 *
 * SAFETY (the reason this is a pure win and not a trade): chaining is applied
 * ONLY to expressions emitted into `refLines` (phase 1). Every phase-1 const is
 * captured from the PRISTINE clone before any phase-2 mutation runs, so
 * `__e0.nextElementSibling` and `__root.firstElementChild.nextElementSibling`
 * are the same node by construction. `template-ref-hoist.test.ts` locks the
 * ordering contract that makes that true; this file locks the shortening.
 */
import { transformJSX_JS } from '../jsx'

/** Count `.nextSibling` / `.nextElementSibling` steps in the whole emit. */
function siblingHops(code: string): number {
  return (code.match(/\.next(?:Element)?Sibling/g) ?? []).length
}
/** Count `.firstChild` / `.firstElementChild` reads in the whole emit. */
function firstReads(code: string): number {
  return (code.match(/\.first(?:Element)?Child/g) ?? []).length
}

const t = (src: string) => transformJSX_JS(src, 'test.tsx').code

describe('template sibling-ref chaining — O(K) walks, not O(K²)', () => {
  it('an 8-cell row walks each sibling exactly once', () => {
    const code = t(
      '<tr>' +
        Array.from({ length: 8 }, (_, i) => `<td>{c${i}()}</td>`).join('') +
        '</tr>',
    )
    // 8 cells: one `firstElementChild` to reach cell 0, then 7 single hops.
    // The pre-chaining emit needed 1+2+…+8 = 36 reads for the same refs.
    expect(siblingHops(code)).toBe(7)
    // 8 `firstElementChild` walks collapse to ONE, plus the 8 per-cell
    // `.firstChild` text captures.
    expect(firstReads(code)).toBe(9)
    // Every cell still gets its own binding — the shortening must not merge refs.
    for (let i = 0; i < 8; i++) expect(code).toContain(`_bindText(c${i},`)
  })

  it('chains off the immediately preceding captured sibling', () => {
    const code = t('<tr><td>{a()}</td><td>{b()}</td><td>{c()}</td></tr>')
    expect(code).toContain('const __e0 = __root.firstElementChild;')
    expect(code).toContain('const __e2 = __e0.nextElementSibling;')
    expect(code).toContain('const __e4 = __e2.nextElementSibling;')
    // No ref re-walks from the root past the first.
    expect(code).not.toContain('__root.firstElementChild.nextElementSibling')
  })

  it('chains a nested subtree off its own captured parent, not the root', () => {
    const code = t('<div><section><span>{a()}</span><span>{b()}</span></section></div>')
    expect(code).toContain('const __e0 = __root.firstElementChild.firstElementChild;')
    // The second span hangs off the first's ref — NOT a fresh two-level descent.
    expect(code).toContain('const __e2 = __e0.nextElementSibling;')
    expect(code).not.toContain('__root.firstElementChild.firstElementChild.nextElementSibling')
  })

  it('chains a mixed-content placeholder off the preceding placeholder', () => {
    const code = t('<div><span>{a()}{b()}</span></div>')
    expect(code).toContain('const __p0 = __e0.firstChild;')
    expect(code).toContain('const __p1 = __p0.nextSibling;')
    expect(code).not.toContain('__e0.firstChild.nextSibling')
  })

  it('still prefers the indexed getter past 8 SIBLING hops', () => {
    // Index 9 with nothing captured in between: chaining would need 9 pointer
    // reads, which is exactly the case the `children[]` fallback exists for.
    const code = t(
      `<ul><li>{a()}</li>${'<li>x</li>'.repeat(8)}<li>{b()}</li></ul>`,
    )
    expect(code).toContain('const __e2 = __root.children[9];')
  })

  it('reaches a far sibling by ONE hop when a nearer ref is already captured', () => {
    // Indices 0..9 all bound: index 9 is one hop off index 8's capture, so the
    // cutoff must NOT fire — the chain is cheaper than the indexed getter here.
    const code = t(
      `<ul>${Array.from({ length: 10 }, (_, i) => `<li>{c${i}()}</li>`).join('')}</ul>`,
    )
    expect(code).not.toContain('children[9]')
    expect(siblingHops(code)).toBe(9)
  })

  it('leaves a single-child template byte-identical (no chaining to do)', () => {
    const code = t('<div><span>{a()}</span></div>')
    expect(code).toContain('const __e0 = __root.firstElementChild;')
    expect(code).toContain('const __t1 = __e0.firstChild;')
    expect(siblingHops(code)).toBe(0)
  })
})
