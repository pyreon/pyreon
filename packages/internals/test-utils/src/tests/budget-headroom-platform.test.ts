import { describe, expect, it } from 'vitest'
import { headroomIsSufficient, requiredHeadroom } from '../../../../../scripts/check-bundle-budgets'

// The gate that catches platform-dependent BUDGETS had a platform-dependent
// VERDICT of its own: both `budget - measured` and `measured * 1.5%` read the
// LOCAL number, so macOS saw more headroom AND a smaller requirement than the
// ubuntu runner that actually gates the PR.
//
// Tested as a pure predicate against the two figures one commit produces on the
// two machines. An env-var toggle cannot check this — setting `CI=true` locally
// only disables the inflation; it does not make gzip bigger.

/** ~1.1%: `@pyreon/toast` measured 3018 B on macOS and 3068 B on ubuntu. */
const asUbuntu = (macos: number): number => macos * 1.011

describe('a budget gets the same verdict on both machines', () => {
  it('the band that used to pass locally and fail in CI now fails locally too', () => {
    // `@pyreon/cli`'s real figures when this was found: 16873 B measured on
    // macOS against a 17296 B budget. Ubuntu measures ~17059, needs ~256 and
    // has 237 — so CI fails while `validate-fast` passes, and re-running
    // locally only reconfirms the wrong answer.
    const macos = 16873
    const budget = 17296
    expect(budget - asUbuntu(macos)).toBeLessThan(requiredHeadroom(asUbuntu(macos)))
    // The verdict a developer gets, and the one CI gets, now agree.
    expect(headroomIsSufficient(macos, budget, false), 'local').toBe(false)
    expect(headroomIsSufficient(asUbuntu(macos), budget, true), 'gating').toBe(false)
  })

  it('and the raised budget passes on both', () => {
    const macos = 16873
    const budget = 17640
    expect(headroomIsSufficient(macos, budget, false), 'local').toBe(true)
    expect(headroomIsSufficient(asUbuntu(macos), budget, true), 'gating').toBe(true)
  })

  it('agrees across the whole band, not just at the two edges', () => {
    // The real assertion: for a range of budgets around the threshold, the
    // local verdict and the gating verdict are the SAME verdict. A single pair
    // could agree by luck.
    const macos = 16873
    let disagreements = 0
    for (let budget = 17000; budget <= 17800; budget += 7) {
      const local = headroomIsSufficient(macos, budget, false)
      const gating = headroomIsSufficient(asUbuntu(macos), budget, true)
      if (local !== gating) disagreements++
    }
    expect(disagreements, 'budgets where the two machines disagree').toBe(0)
  })

  it('a comfortable budget is unaffected — this is not a blanket tightening', () => {
    expect(headroomIsSufficient(1000, 2000, false)).toBe(true)
    expect(headroomIsSufficient(1000, 2000, true)).toBe(true)
  })
})
