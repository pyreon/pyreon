/**
 * `diffComponents` — which components' contract lines changed between two
 * derived agent guides.
 *
 * The gate could simply say "out of date", and the first version did. But the
 * guide is ~110 blocks long and the reader's next question is always "which
 * one?", so naming the changed components is the difference between a finding
 * and a chore. This is the pure half, unit-tested; the gate itself is
 * bisect-verified end to end (renaming Button's `danger` state to
 * `destructive` makes it exit 1 and report `changed: Button`).
 */
import { describe, expect, it } from 'vitest'
import { diffComponents } from '../../../../../scripts/atlas-contract'

const guide = (blocks: Record<string, string>): string =>
  ['# Agent Guide', '', ...Object.entries(blocks).map(([n, b]) => `## ${n}\n${b}`)].join('\n')

describe('diffComponents', () => {
  it('is empty for identical guides', () => {
    const g = guide({ Button: 'optional: state(primary|danger)', Card: 'optional: pad(sm)' })
    expect(diffComponents(g, g)).toEqual([])
  })

  it('names a component whose ALLOWED VALUES changed — the rename case', () => {
    // The drift this whole mechanism exists for: a dimension value renamed in
    // `.states()` while the AI-facing doc keeps teaching the old one.
    const before = guide({ Button: 'optional: state(primary|danger)', Card: 'optional: pad(sm)' })
    const after = guide({ Button: 'optional: state(primary|destructive)', Card: 'optional: pad(sm)' })
    expect(diffComponents(before, after)).toEqual(['Button'])
  })

  it('names an ADDED and a REMOVED component', () => {
    const before = guide({ Button: 'a', Card: 'b' })
    const after = guide({ Button: 'a', Dialog: 'c' })
    expect(diffComponents(before, after)).toEqual(['Card', 'Dialog'])
  })

  it('reports every changed component, sorted, not just the first', () => {
    const before = guide({ Alert: 'x', Button: 'x', Card: 'x' })
    const after = guide({ Alert: 'y', Button: 'x', Card: 'z' })
    expect(diffComponents(before, after)).toEqual(['Alert', 'Card'])
  })

  it('ignores preamble changes — only component blocks are the contract', () => {
    const before = `# Agent Guide\n\nsome preamble\n\n## Button\noptional: state(a)`
    const after = `# Agent Guide\n\nDIFFERENT preamble\n\n## Button\noptional: state(a)`
    expect(diffComponents(before, after)).toEqual([])
  })

  it('handles a guide with no components at all', () => {
    expect(diffComponents('# Agent Guide\n', '# Agent Guide\n')).toEqual([])
  })
})
