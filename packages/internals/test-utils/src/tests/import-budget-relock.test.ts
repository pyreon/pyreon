/**
 * `check-import-budgets --update` silently lowered budgets, same as its sibling.
 *
 * The direction rule landed on `check-bundle-budgets` first, and stopping there
 * would have been the failure this repo already names: a fix applied to one call
 * site is folklore, not a fix. Measured on the tree where this was written, an
 * unscoped `check-import-budgets --update` lowered 8 of 11 budgets — including
 * `@pyreon/router::basic` by 9.9% — while raising 3. So a person relocking for
 * the three legitimate raises silently committed eight unreviewed tightenings,
 * which is exactly the mechanism that ratcheted `@pyreon/validate` below what CI
 * measures and reddened a gate on two branches that never touched the package.
 *
 * This covers the WIRING, not the policy. `bundle-budget-drop-guard.test.ts`
 * already proves `shouldLowerUnscoped` returns the right booleans; a rule that is
 * never consulted satisfies that test perfectly while doing nothing. `relockBudgets`
 * is the layer where the decision is actually applied.
 *
 * Imports from `scripts/check-import-budgets` are safe here (unlike the sibling
 * gate) because that file uses no `Bun.*` API — see the header note on
 * `bundle-budget-drop-guard.test.ts` for why that distinction matters.
 */

import { describe, expect, it } from 'vitest'

import { relockBudgets } from '../../../../../scripts/check-import-budgets'

/** `relockBudgets` reads only `id` and `gzip`; the rest of the shape is noise. */
const m = (id: string, gzip: number) =>
  ({ id, gzip }) as unknown as Parameters<typeof relockBudgets>[0][number]

describe('check-import-budgets --update direction rule', () => {
  it('an UNSCOPED --update never lowers — a stale build can only measure low', () => {
    const { budgets, lowered } = relockBudgets([m('a::x', 1000)], { 'a::x': 3000 }, undefined)

    expect(budgets['a::x']).toBe(3000)
    expect(lowered).toBe(0)
  })

  it('names the refusal and the exact command that would apply it', () => {
    const { refused } = relockBudgets([m('a::x', 1000)], { 'a::x': 3000 }, undefined)

    expect(refused).toHaveLength(1)
    expect(refused[0]).toContain('not lowered: a::x')
    expect(refused[0]).toContain('--update=a::x')
  })

  it('lowers when the scenario is NAMED — tightening stays available', () => {
    const { budgets, lowered, refused } = relockBudgets([m('a::x', 1000)], { 'a::x': 3000 }, 'a::x')

    expect(budgets['a::x']).toBe(1030) // 1000 * 1.03, ceil
    expect(lowered).toBe(1)
    expect(refused).toEqual([])
  })

  it('scoping one scenario does not lower its neighbours', () => {
    const { budgets, lowered } = relockBudgets(
      [m('a::x', 1000), m('b::y', 1000)],
      { 'a::x': 3000, 'b::y': 3000 },
      'a::x',
    )

    expect(budgets['a::x']).toBe(1030)
    expect(budgets['b::y']).toBe(3000)
    expect(lowered).toBe(1)
  })

  it('RAISES always apply unscoped — that is the reviewed case', () => {
    const { budgets, refused } = relockBudgets([m('a::x', 5000)], { 'a::x': 3000 }, undefined)

    expect(budgets['a::x']).toBe(5150)
    expect(refused).toEqual([])
  })

  it('seeds a scenario that has no budget yet', () => {
    const { budgets, lowered, refused } = relockBudgets([m('new::z', 1000)], {}, undefined)

    expect(budgets['new::z']).toBe(1030)
    expect(lowered).toBe(0)
    expect(refused).toEqual([])
  })

  it('a budget equal to the measurement is untouched and not counted as lowered', () => {
    const { budgets, lowered, refused } = relockBudgets([m('a::x', 1000)], { 'a::x': 1030 }, undefined)

    expect(budgets['a::x']).toBe(1030)
    expect(lowered).toBe(0)
    expect(refused).toEqual([])
  })
})
