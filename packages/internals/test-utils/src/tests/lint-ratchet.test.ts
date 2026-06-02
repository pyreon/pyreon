import { describe, expect, it } from 'vitest'
import {
  buildBaseline,
  compareToBaseline,
  countWarnFindings,
} from '../../../../../scripts/check-lint-ratchet'

describe('check-lint-ratchet — countWarnFindings', () => {
  it('counts only warning-severity diagnostics, grouped by code', () => {
    const parsed = {
      diagnostics: [
        { code: 'a', severity: 'warning' },
        { code: 'a', severity: 'warning' },
        { code: 'b', severity: 'warning' },
        { code: 'c', severity: 'error' }, // errors are gated at 0 by oxlint — not ratcheted
      ],
    }
    expect(countWarnFindings(parsed)).toEqual({ a: 2, b: 1 })
  })

  it('accepts a top-level array shape', () => {
    expect(countWarnFindings([{ code: 'x', severity: 'warning' }])).toEqual({ x: 1 })
  })

  it('returns {} for empty / null / garbage', () => {
    expect(countWarnFindings(null)).toEqual({})
    expect(countWarnFindings({})).toEqual({})
    expect(countWarnFindings({ diagnostics: [] })).toEqual({})
  })
})

describe('check-lint-ratchet — compareToBaseline', () => {
  it('flags a rule that grew above baseline as a regression', () => {
    const r = compareToBaseline({ a: 5 }, { a: 4 })
    expect(r.regressions).toEqual([{ rule: 'a', baseline: 4, current: 5 }])
    expect(r.improvements).toEqual([])
  })

  it('flags a rule that shrank as an improvement', () => {
    const r = compareToBaseline({ a: 3 }, { a: 4 })
    expect(r.improvements).toEqual([{ rule: 'a', baseline: 4, current: 3 }])
    expect(r.regressions).toEqual([])
  })

  it('a brand-new rule with findings is BOTH a regression and a newRule', () => {
    const r = compareToBaseline({ z: 2 }, {})
    expect(r.regressions).toEqual([{ rule: 'z', baseline: 0, current: 2 }])
    expect(r.newRules).toEqual([{ rule: 'z', baseline: 0, current: 2 }])
  })

  it('a rule that dropped to 0 (gone from current) is an improvement', () => {
    const r = compareToBaseline({}, { a: 3 })
    expect(r.improvements).toEqual([{ rule: 'a', baseline: 3, current: 0 }])
  })

  it('equal counts are neither regression nor improvement', () => {
    const r = compareToBaseline({ a: 4 }, { a: 4 })
    expect(r.regressions).toEqual([])
    expect(r.improvements).toEqual([])
  })

  it('sorts regressions by largest delta first', () => {
    const r = compareToBaseline({ a: 5, b: 10 }, { a: 1, b: 9 })
    expect(r.regressions.map((x) => x.rule)).toEqual(['a', 'b']) // a:+4 before b:+1
  })
})

describe('check-lint-ratchet — buildBaseline', () => {
  it('sums the total and sorts rules by count descending', () => {
    const b = buildBaseline({ a: 2, b: 5, c: 1 })
    expect(b.total).toBe(8)
    expect(Object.keys(b.rules)).toEqual(['b', 'a', 'c'])
  })

  it('produces an empty baseline for no findings', () => {
    const b = buildBaseline({})
    expect(b.total).toBe(0)
    expect(b.rules).toEqual({})
  })
})
