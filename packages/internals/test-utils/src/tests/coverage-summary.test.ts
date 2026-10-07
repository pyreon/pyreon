import {
  coverageResultStatus,
  coverageRunSummary,
  findShortfalls,
  formatCoverageShortfall,
} from '../../../../../scripts/check-coverage'

const targets = { statements: 99, branches: 98, functions: 99, lines: 99 }
const clean = { pass: true, shortfalls: [] }
const hooks = {
  pass: true,
  shortfalls: findShortfalls(
    { statements: 99.18, branches: 94.4, functions: 99.08, lines: 99.71 },
    targets,
    { branches: 94.47 },
  ),
}

describe('coverage reports distinguish targets from ratchet floors', () => {
  it('shows the measured hooks gap without claiming its declared target was met', () => {
    expect(coverageResultStatus(hooks)).toContain('ratchet')
    expect(coverageResultStatus(hooks)).not.toContain('✅')
    expect(coverageRunSummary([clean, hooks], false)).toContain('1 package(s) below declared targets')
    expect(coverageRunSummary([clean, hooks], false)).not.toContain('All packages meet')
    expect(formatCoverageShortfall('@pyreon/hooks', hooks.shortfalls[0]!)).toContain(
      '@pyreon/hooks: branches 94.4% is below declared 98% (ratchet floor 94.47%, tolerance 0.5pp)',
    )
  })

  it('returns to a clean report when the actual declared target is reached', () => {
    const recovered = {
      pass: true,
      shortfalls: findShortfalls(targets, targets, { branches: 94.47 }),
    }
    expect(coverageResultStatus(recovered)).toBe('✅')
    expect(coverageRunSummary([recovered], false)).toContain('All packages meet')
  })

  it('keeps a real regression below the ratchet red in the row and summary', () => {
    const regressed = {
      pass: true,
      shortfalls: findShortfalls({ ...targets, branches: 92 }, targets, { branches: 94.47 }),
    }
    expect(coverageResultStatus(regressed)).toBe('❌')
    expect(coverageRunSummary([regressed], false)).toContain('failed')
  })

  it('keeps statement failures red even without a declared-metric shortfall', () => {
    const failed = { ...clean, pass: false }
    expect(coverageResultStatus(failed)).toBe('❌')
    expect(coverageRunSummary([failed], false)).toContain('failed')
  })

  it('cannot claim success after a measurement or configuration failure', () => {
    expect(coverageRunSummary([clean], true)).toContain('failed')
    expect(coverageRunSummary([clean], true)).not.toContain('All packages meet')
  })
})
