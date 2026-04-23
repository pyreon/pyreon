import { describe, expect, it } from 'vitest'
import { diffSnapshots, formatDiff } from '../diff'

describe('diffSnapshots', () => {
  it('produces delta + pct for entries present in both snapshots', () => {
    const d = diffSnapshots({ a: 10, b: 5 }, { a: 15, b: 5 })
    const a = d.entries.find((e) => e.name === 'a')
    expect(a).toMatchObject({ before: 10, after: 15, delta: 5, pct: 50 })
    const b = d.entries.find((e) => e.name === 'b')
    expect(b).toMatchObject({ before: 5, after: 5, delta: 0, pct: 0 })
  })

  it('returns null pct when before is 0', () => {
    const d = diffSnapshots({}, { new: 7 })
    expect(d.entries[0]).toMatchObject({ name: 'new', before: 0, after: 7, pct: null })
  })

  it('categorises added / removed names', () => {
    const d = diffSnapshots({ keep: 1, gone: 1 }, { keep: 1, fresh: 1 })
    expect(d.added).toEqual(['fresh'])
    expect(d.removed).toEqual(['gone'])
  })

  it('sorts entries by |delta| descending', () => {
    const d = diffSnapshots({ a: 1, b: 1, c: 1 }, { a: 11, b: 2, c: 100 })
    expect(d.entries.map((e) => e.name)).toEqual(['c', 'a', 'b'])
  })
})

describe('formatDiff', () => {
  it('renders a fixed-width table', () => {
    const d = diffSnapshots({ small: 1 }, { small: 3 })
    const out = formatDiff(d)
    expect(out).toContain('metric')
    expect(out).toContain('small')
    expect(out).toContain('+2')
    expect(out).toContain('+200.0%')
  })

  it('reports empty diff distinctly', () => {
    expect(formatDiff(diffSnapshots({}, {}))).toBe('(no counters recorded)')
  })

  it('renders null pct as em-dash', () => {
    const d = diffSnapshots({}, { added: 5 })
    expect(formatDiff(d)).toContain('—')
  })
})
