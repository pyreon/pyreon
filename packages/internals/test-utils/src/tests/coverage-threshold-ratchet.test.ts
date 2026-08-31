import { describe, expect, it } from 'vitest'
import {
  findShortfalls,
  parseDeclaredThresholds,
} from '../../../../../scripts/check-coverage'

/**
 * The blind spot these lock: `check-coverage.ts` decided pass/fail with
 * `outcome.statements >= threshold`, so `branches`, `functions` and `lines`
 * were declared in every package's vitest config and never compared. Measured
 * on a green main run, 17 packages sat below a threshold they declare.
 */
describe('parseDeclaredThresholds', () => {
  it('reads all four metrics, not just statements', () => {
    const cfg = `coverageThresholds: { statements: 99, branches: 98, functions: 97, lines: 96 }`
    expect(parseDeclaredThresholds(cfg, 80)).toEqual({
      statements: 99,
      branches: 98,
      functions: 97,
      lines: 96,
    })
  })

  it('falls back per-metric when a config omits one', () => {
    expect(parseDeclaredThresholds('coverageThresholds: { statements: 99 }', 80)).toEqual({
      statements: 99,
      branches: 80,
      functions: 80,
      lines: 80,
    })
  })

  it('falls back entirely when there is no config', () => {
    expect(parseDeclaredThresholds(null, 75).branches).toBe(75)
  })
})

describe('findShortfalls', () => {
  const declared = { statements: 99, branches: 98, functions: 99, lines: 99 }
  const clean = { statements: 99, branches: 98, functions: 99, lines: 99 }

  it('reports nothing when every metric meets its declaration', () => {
    expect(findShortfalls(clean, declared, undefined)).toEqual([])
  })

  it('flags a metric under its declaration when there is NO floor', () => {
    const s = findShortfalls({ ...clean, branches: 94 }, declared, undefined)
    expect(s).toHaveLength(1)
    expect(s[0]!.metric).toBe('branches')
    // No recorded floor means the package must simply MEET its declaration.
    expect(s[0]!.regressed).toBe(true)
  })

  it('treats a recorded gap as known — warns, does not fail', () => {
    // The ratchet: hooks measured 94.47 against a declared 98. That is visible
    // debt, not a regression, so it must not turn the gate red on arrival.
    const s = findShortfalls({ ...clean, branches: 94.47 }, declared, { branches: 94.47 })
    expect(s).toHaveLength(1)
    expect(s[0]!.regressed).toBe(false)
  })

  it('FAILS when a recorded gap widens — the whole point of a ratchet', () => {
    const s = findShortfalls({ ...clean, branches: 94.0 }, declared, { branches: 94.47 })
    expect(s[0]!.regressed).toBe(true)
  })

  it('stops reporting once a package climbs back to its declaration', () => {
    expect(findShortfalls(clean, declared, { branches: 94.47 })).toEqual([])
  })

  it('checks every metric independently, not just branches', () => {
    const s = findShortfalls(
      { statements: 99, branches: 98, functions: 91, lines: 90 },
      declared,
      undefined,
    )
    expect(s.map((x) => x.metric).sort()).toEqual(['functions', 'lines'])
  })

  it('does not flag a metric ABOVE its declaration', () => {
    expect(findShortfalls({ ...clean, branches: 99.9 }, declared, { branches: 94 })).toEqual([])
  })
})
