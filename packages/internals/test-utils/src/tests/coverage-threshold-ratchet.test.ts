import { describe, expect, it } from 'vitest'
import {
  FLOOR_TOLERANCE_PP,
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

  it('leaves an omitted metric UNDECLARED rather than defaulting it', () => {
    // The invariant is unchanged -- the parser reports what the config states.
    // What changed is that an absent metric is absent, not silently 80: a
    // default here becomes an enforced threshold the package never wrote.
    expect(parseDeclaredThresholds('coverageThresholds: { statements: 99 }', 80)).toEqual({
      statements: 99,
    })
  })

  it('with no config, only statements falls back', () => {
    const d = parseDeclaredThresholds(null, 75)
    expect(d.statements).toBe(75)
    expect(d.branches).toBeUndefined()
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
    // Comfortably past the drift tolerance: the point is a real drop, and a
    // 0.47pp move is now (correctly) noise rather than a regression.
    const s = findShortfalls({ ...clean, branches: 92.0 }, declared, { branches: 94.47 })
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

/**
 * The three defects the first cut of this gate shipped, each of which blocked
 * unrelated PRs on main within a day.
 */
describe('defects found in production', () => {
  it('does NOT invent a threshold for a metric the package never declared', () => {
    // `@pyreon/atlas` declares statements/branches/functions and NO `lines`;
    // `@pyreon/server` declares no `functions`. Substituting the default for an
    // absent metric judged them against 95 (measuring 81.44 and 92.85) and
    // failed two PRs that touch neither package. It also disagreed with the
    // SEEDING pass, which correctly recorded declared metrics only — so there
    // was no floor to soften it either.
    const declared = parseDeclaredThresholds(
      'coverageThresholds: { statements: 79, branches: 75, functions: 66 }',
      95,
    )
    expect(declared.lines).toBeUndefined()
    expect(
      findShortfalls(
        { statements: 81, branches: 76, functions: 67, lines: 81.44 },
        declared,
        undefined,
      ),
    ).toEqual([])
  })

  it('statements still falls back, because that comparison predates this', () => {
    expect(parseDeclaredThresholds('coverageThresholds: { branches: 70 }', 95).statements).toBe(95)
  })

  it('absorbs measurement DRIFT under a floor, but not a real drop', () => {
    // `@pyreon/compiler` functions moved 91.06 -> 90.81 with nothing touching
    // that package, and a floor seeded at the exact measured value failed it.
    const declared = { statements: 91, branches: 85, functions: 94, lines: 94 }
    const drift = findShortfalls(
      { statements: 92, branches: 86, functions: 90.81, lines: 95 },
      declared,
      { functions: 91.06 },
    )
    expect(drift[0]?.regressed).toBe(false)

    const real = findShortfalls(
      { statements: 92, branches: 86, functions: 89.5, lines: 95 },
      declared,
      { functions: 91.06 },
    )
    expect(real[0]?.regressed).toBe(true)
  })

  it('keeps the tolerance small enough to catch a whole point', () => {
    // A tolerance that grows into a licence to regress defeats the ratchet.
    expect(FLOOR_TOLERANCE_PP).toBeLessThan(1)
  })
})

