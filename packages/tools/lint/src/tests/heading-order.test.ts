/**
 * Tests for the opt-in frontend a11y rule `pyreon/heading-order`.
 *
 * Flags a heading whose level jumps by more than one from the previous
 * heading in the SAME function scope (the axe-core "heading-order"
 * check). Function-scoped so sibling components in one file don't
 * false-positive against each other.
 */
import { describe, expect, it } from 'vitest'
import { headingOrder } from '../rules/frontend/heading-order'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULE = 'pyreon/heading-order'
const ON: LintConfig = { rules: { [RULE]: 'warn' } }

function ids(source: string, config: LintConfig = ON): string[] {
  return lintFile('App.tsx', source, [headingOrder], config).diagnostics.map((d) => d.ruleId)
}

describe('pyreon/heading-order', () => {
  // ── FIRES ──────────────────────────────────────────────────────────────
  it('FIRES on h1 → h3 (h2 skipped)', () => {
    expect(ids(`export default () => <div><h1>Title</h1><h3>Sub</h3></div>`)).toContain(RULE)
  })

  it('FIRES on h2 → h4', () => {
    expect(ids(`export default () => <section><h2>A</h2><h4>B</h4></section>`)).toContain(RULE)
  })

  // ── DOES NOT FIRE ────────────────────────────────────────────────────────
  it('does NOT fire on a sequential h1 → h2 → h3', () => {
    expect(ids(`export default () => <div><h1>A</h1><h2>B</h2><h3>C</h3></div>`)).not.toContain(RULE)
  })

  it('does NOT fire on repeated same-level headings (h1 → h2 → h2)', () => {
    expect(ids(`export default () => <div><h1>A</h1><h2>B</h2><h2>C</h2></div>`)).not.toContain(RULE)
  })

  it('does NOT fire when going back UP (h3 → h2)', () => {
    expect(ids(`export default () => <div><h2>A</h2><h3>B</h3><h2>C</h2></div>`)).not.toContain(RULE)
  })

  it('does NOT fire across two sibling components in one file (function-scoped)', () => {
    // Component A ends at h1; component B opens at h3 — each has its own
    // outline, so this is NOT a skip.
    const src = `function A() { return <h1>A</h1> }
function B() { return <h3>B</h3> }
export { A, B }`
    expect(ids(src)).not.toContain(RULE)
  })

  it('does NOT fire on a dynamic-level component (<Heading level={3} />)', () => {
    // Uppercase component — the level isn't a literal `hN` tag.
    expect(ids(`export default () => <div><h1>T</h1><Heading level={3}>S</Heading></div>`)).not.toContain(RULE)
  })

  // ── OPT-IN ───────────────────────────────────────────────────────────────
  it('does NOT fire when the rule is disabled (opt-in default OFF)', () => {
    expect(ids(`export default () => <div><h1>T</h1><h3>S</h3></div>`, { rules: {} })).not.toContain(
      RULE,
    )
  })
})
