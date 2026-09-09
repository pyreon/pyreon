import { describe, expect, it } from 'vitest'
import {
  requiredHeadroom,
  suggestedBudget,
} from '../../../../../scripts/check-bundle-budgets'

/**
 * The number the gate prints for a human to paste has to be one the GATE will
 * accept — including on the machine that runs it, which is not the machine that
 * measured.
 *
 * gzip on the ubuntu runner comes out larger than on a macOS laptop: measured
 * at 1.66% on `@pyreon/toast` (3018 → 3068 B). A suggestion computed from the
 * local figure plus the bare minimum is therefore short by that delta, and
 * following it produces a second failure a few dozen bytes higher — which
 * happened three times in one afternoon before this was fixed.
 */
describe('a suggested budget survives the platform that gates it', () => {
  // macOS → ubuntu, from real CI failures on 2026-09-09.
  const OBSERVED = [
    { name: '@pyreon/toast', local: 3018, remote: 3068 },
    { name: '@pyreon/table', local: 3232, remote: 3284 },
    { name: '@pyreon/native-compiler', local: 230_000, remote: 233_527 },
  ]

  for (const { name, local, remote } of OBSERVED) {
    it(`${name}: the number printed on macOS is accepted on ubuntu`, () => {
      const suggestion = suggestedBudget(local)
      const remoteMinimum = remote + requiredHeadroom(remote)
      expect(
        suggestion,
        `the suggestion is short by ${Math.ceil(remoteMinimum - suggestion)} B on the gating platform`,
      ).toBeGreaterThanOrEqual(remoteMinimum)
    })
  }

  it('covers a platform delta larger than any observed, for a small package', () => {
    // The byte FLOOR dominates below ~4.3 KB, which is where every observation
    // above sits — so a percentage-only suggestion is wrong exactly where the
    // failures have been.
    const local = 1000
    expect(suggestedBudget(local)).toBeGreaterThanOrEqual(
      local * 1.02 + requiredHeadroom(local * 1.02),
    )
  })

  it('stays a suggestion, not a blank cheque', () => {
    // Generous, but still a budget: a runaway value would make the gate stop
    // catching real growth, which is the thing it exists for.
    expect(suggestedBudget(100_000)).toBeLessThan(100_000 * 1.1)
  })
})
