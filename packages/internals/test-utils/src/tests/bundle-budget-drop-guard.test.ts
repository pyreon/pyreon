/**
 * `--update` committed a budget derived from a stale `lib/`.
 *
 * It is documented as a RATCHET that "LOWERS one that has shrunk" — correct in
 * principle, and the failure mode in practice: a stale or partial build measures
 * far smaller than the real package, so the ratchet writes a budget BELOW what
 * CI measures. `@pyreon/validate` went 15872 -> 15360, implying a ~12288 B
 * measurement for a package that really measures ~15016 B locally and 15473 B on
 * CI. The gate then failed on a package the branch never touched — twice, on two
 * different branches, because the wrong value was committed and travelled.
 *
 * The checker already knew this shape ("this budget has too little headroom to
 * be measured reliably"); the WRITER did not. This is the writer's half.
 *
 * Not a variance problem: measured macOS 15016 vs ubuntu 15473 is ~3.0%, while
 * the committed value was ~22% below reality. Guarding the drop is therefore the
 * honest fix, and the variance constant is deliberately left alone — one
 * package is not enough evidence to move a repo-wide constant.
 */

import { describe, expect, it } from 'vitest'
import { isSuspiciousDrop, MAX_UNSCOPED_DROP_PCT } from '../../../../../scripts/check-bundle-budgets'

describe('--update refuses a drop that is really a stale build', () => {
  it('refuses the shape that actually shipped (validate 15872 -> 15360 is inside, the stale one is not)', () => {
    // The committed regression came from a ~12288 B measurement -> ideal 15360.
    expect(isSuspiciousDrop(19840, 15360, false)).toBe(true)
    // loom / testing / preact-compat, reproduced on a stale tree.
    expect(isSuspiciousDrop(6144, 512, false)).toBe(true)
    expect(isSuspiciousDrop(5120, 2304, false)).toBe(true)
    expect(isSuspiciousDrop(1280, 1024, false)).toBe(true)
  })

  it('allows a SMALL genuine tightening — a ratchet that never lowers protects nothing', () => {
    expect(isSuspiciousDrop(1000, 950, false)).toBe(false)
    expect(isSuspiciousDrop(1000, 900, false)).toBe(false) // exactly 10%, not > 10%
  })

  it('never fires when the budget is unchanged or growing', () => {
    expect(isSuspiciousDrop(1000, 1000, false)).toBe(false)
    expect(isSuspiciousDrop(1000, 2000, false)).toBe(false)
  })

  it('SCOPED --update=@pyreon/pkg always proceeds — naming it is the deliberate act', () => {
    expect(isSuspiciousDrop(6144, 512, true)).toBe(false)
  })

  it('is defined against a threshold, not a magic number in the branch', () => {
    expect(MAX_UNSCOPED_DROP_PCT).toBe(10)
    const justOver = 1000 - (MAX_UNSCOPED_DROP_PCT + 1) * 10
    expect(isSuspiciousDrop(1000, justOver, false)).toBe(true)
  })

  it('degenerate previous values cannot divide by zero into a false refusal', () => {
    expect(isSuspiciousDrop(0, 0, false)).toBe(false)
    expect(isSuspiciousDrop(-5, 1, false)).toBe(false)
  })
})
