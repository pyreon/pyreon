import { describe, expect, it } from 'vitest'
import { compareToBaseline } from '../../../../../scripts/check-lint-ratchet'
import { buildBaseline, countLeakFindings } from '../../../../../scripts/check-leak-ratchet'

// The leak ratchet reuses `compareToBaseline` from the oxlint ratchet (already
// covered by lint-ratchet.test.ts) — this suite covers the parts that differ:
// folding `audit-leak-classes --json` into per-`detector::file` keys (with the
// absolute→relative path fix), the baseline shape, and the one behaviour that
// motivated replacing the bare total ceiling: a SWAP must be a regression.

const ROOT = '/repo'

describe('check-leak-ratchet — countLeakFindings', () => {
  it('folds findings into per-detector-per-file counts', () => {
    const parsed = {
      findings: [
        { detector: 'unbounded-cache', file: '/repo/packages/a/src/x.ts', line: 3 },
        { detector: 'unbounded-cache', file: '/repo/packages/a/src/x.ts', line: 40 },
        { detector: 'unbounded-cache', file: '/repo/packages/b/src/y.ts', line: 7 },
        { detector: 'position-based-pop', file: '/repo/packages/a/src/x.ts', line: 9 },
      ],
      total: 4,
    }
    expect(countLeakFindings(parsed, ROOT)).toEqual({
      'unbounded-cache::packages/a/src/x.ts': 2,
      'unbounded-cache::packages/b/src/y.ts': 1,
      'position-based-pop::packages/a/src/x.ts': 1,
    })
  })

  it('relativises the absolute paths the audit emits — a committed baseline must not be machine-specific', () => {
    const parsed = { findings: [{ detector: 'unbounded-cache', file: '/repo/packages/a/src/x.ts' }] }
    const keys = Object.keys(countLeakFindings(parsed, ROOT))
    expect(keys).toEqual(['unbounded-cache::packages/a/src/x.ts'])
    expect(keys[0]).not.toContain('/repo')
  })

  it('ignores the LINE — an unrelated edit above a finding must not red the gate', () => {
    const at = (line: number) => ({
      findings: [{ detector: 'unbounded-cache', file: '/repo/packages/a/src/x.ts', line }],
    })
    expect(countLeakFindings(at(12), ROOT)).toEqual(countLeakFindings(at(900), ROOT))
  })

  it('is empty for no findings and tolerates a missing findings array', () => {
    expect(countLeakFindings({ findings: [], total: 0 }, ROOT)).toEqual({})
    expect(countLeakFindings({}, ROOT)).toEqual({})
    expect(countLeakFindings(null, ROOT)).toEqual({})
  })
})

describe('check-leak-ratchet — buildBaseline', () => {
  it('sums the total and sorts keys stably by name', () => {
    const b = buildBaseline({ 'z::b.ts': 1, 'a::a.ts': 2, 'm::c.ts': 1 })
    expect(b.total).toBe(4)
    expect(Object.keys(b.rules)).toEqual(['a::a.ts', 'm::c.ts', 'z::b.ts'])
    expect(b.description).toContain('may only DECREASE')
    // The audit is heuristic; the description must say so, or a reader treats
    // every new entry as a proven leak.
    expect(b.description).toContain('PERMISSIVE')
  })

  it('an empty audit produces an empty, still-valid baseline', () => {
    expect(buildBaseline({})).toMatchObject({ total: 0, rules: {} })
  })
})

describe('check-leak-ratchet — why a keyed baseline replaced a total ceiling', () => {
  const baseline = { 'unbounded-cache::packages/a/src/x.ts': 1 }

  it('a SWAP is a regression, where an equal TOTAL was a wash', () => {
    // One finding fixed, one added: the old `-gt 40` total ceiling saw no change.
    const current = { 'unbalanced-listeners::packages/b/src/y.ts': 1 }
    const totalOf = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
    expect(totalOf(current)).toBe(totalOf(baseline)) // the ceiling would have passed

    const { regressions, improvements } = compareToBaseline(current, baseline)
    expect(regressions).toHaveLength(1)
    expect(regressions[0]?.rule).toBe('unbalanced-listeners::packages/b/src/y.ts')
    expect(improvements).toHaveLength(1)
  })

  it('names WHICH file and WHICH leak class, which a count cannot', () => {
    const current = { ...baseline, 'promise-race-no-clear::packages/c/src/z.ts': 1 }
    const { regressions } = compareToBaseline(current, baseline)
    const [detector, file] = (regressions[0]?.rule ?? '').split('::')
    expect(detector).toBe('promise-race-no-clear')
    expect(file).toBe('packages/c/src/z.ts')
  })

  it('a first instance of a detector currently at ZERO is caught immediately', () => {
    // `promise-race-no-clear` has no findings today, so it is absent from the
    // baseline — an absent key compares as 0, so the first one is a regression.
    const { regressions } = compareToBaseline(
      { 'promise-race-no-clear::packages/c/src/z.ts': 1 },
      {},
    )
    expect(regressions).toHaveLength(1)
  })

  it('a genuine fix is an improvement, never a regression', () => {
    const { regressions, improvements } = compareToBaseline({}, baseline)
    expect(regressions).toHaveLength(0)
    expect(improvements).toHaveLength(1)
  })
})
