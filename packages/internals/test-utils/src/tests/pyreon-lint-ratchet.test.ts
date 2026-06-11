import { describe, expect, it } from 'vitest'
import {
  buildBaseline,
  countPyreonFindings,
} from '../../../../../scripts/check-pyreon-lint-ratchet'

// The pyreon-lint ratchet reuses `compareToBaseline` from the oxlint ratchet
// (already covered by lint-ratchet.test.ts) — this suite covers the parts that
// differ: parsing the `doctor --only lint --json` report shape + the
// pyreon-specific baseline description.

describe('check-pyreon-lint-ratchet — countPyreonFindings', () => {
  it('counts non-error findings from the doctor report, grouped by code', () => {
    const report = {
      findings: [
        { code: 'lint/pyreon/prefer-isserver', severity: 'warning' },
        { code: 'lint/pyreon/prefer-isserver', severity: 'warning' },
        { code: 'lint/pyreon/no-eager-import', severity: 'info' }, // info is advisory — counted
        { code: 'lint/pyreon/blocking', severity: 'error' }, // gated at 0 by --ci — NOT ratcheted
      ],
    }
    expect(countPyreonFindings(report)).toEqual({
      'lint/pyreon/prefer-isserver': 2,
      'lint/pyreon/no-eager-import': 1,
    })
  })

  it('counts info-severity (it is advisory, like warning — the gate only fails on error)', () => {
    expect(countPyreonFindings({ findings: [{ code: 'x', severity: 'info' }] })).toEqual({ x: 1 })
  })

  it('excludes every error-severity finding', () => {
    expect(
      countPyreonFindings({
        findings: [
          { code: 'a', severity: 'error' },
          { code: 'a', severity: 'error' },
        ],
      }),
    ).toEqual({})
  })

  it('reads the top-level `findings` array, not gate-nested findings', () => {
    // The doctor report carries a flat top-level `findings` list — that's the source.
    expect(countPyreonFindings({ findings: [{ code: 'q', severity: 'warning' }], gates: [] })).toEqual(
      { q: 1 },
    )
  })

  it('returns {} for empty / null / garbage', () => {
    expect(countPyreonFindings(null)).toEqual({})
    expect(countPyreonFindings({})).toEqual({})
    expect(countPyreonFindings({ findings: [] })).toEqual({})
  })

  it('defaults a missing code to "unknown" and a missing severity to counted', () => {
    // A finding with no severity is not an error → counted under its code.
    expect(countPyreonFindings({ findings: [{ code: undefined }] })).toEqual({ unknown: 1 })
  })
})

describe('check-pyreon-lint-ratchet — buildBaseline', () => {
  it('sums total, sorts rules descending, and carries the pyreon description', () => {
    const b = buildBaseline({ a: 2, b: 5, c: 1 })
    expect(b.total).toBe(8)
    expect(Object.keys(b.rules)).toEqual(['b', 'a', 'c'])
    expect(b.description).toContain('Pyreon-lint ratchet')
    expect(b.description).toContain('may only DECREASE')
  })

  it('produces an empty baseline for no findings', () => {
    const b = buildBaseline({})
    expect(b.total).toBe(0)
    expect(b.rules).toEqual({})
  })
})
