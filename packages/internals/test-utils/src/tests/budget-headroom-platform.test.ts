import { describe, expect, it } from 'vitest'
import {
  headroomIsSufficient,
  isThinHeadroom,
  requiredHeadroom,
} from '../../../../../scripts/check-bundle-budgets'

// The thin-headroom verdict reads only the measured bytes and the budget. It
// used to inflate a non-CI measurement by a presumed 1.1% macOS/ubuntu delta,
// which no longer exists (the same lib/ gives identical bytes on both, see
// HEADROOM_FRACTION in the script), so it made laptops stricter than CI on the
// same bytes: #4288.

describe('the headroom verdict depends only on the bytes', () => {
  it('@pyreon/server on 2026-11-10: 6139 B against 6280 passes (it failed only off CI before)', () => {
    // Measured 6139 B on macOS and on the ubuntu runner. 141 B of headroom
    // against a 93 B minimum.
    expect(requiredHeadroom(6139)).toBeCloseTo(92.085, 3)
    expect(headroomIsSufficient(6139, 6280)).toBe(true)
    expect(isThinHeadroom(6139, 6280)).toBe(false)
  })

  it('@pyreon/core on 2026-11-11: 7920 B against the old 7963 is thin on every machine', () => {
    expect(isThinHeadroom(7920, 7963)).toBe(true)
    expect(isThinHeadroom(7920, 8232)).toBe(false)
  })

  it('the boundary is exactly measured + the minimum', () => {
    const measured = 16873
    const edge = measured + requiredHeadroom(measured)
    expect(headroomIsSufficient(measured, Math.ceil(edge))).toBe(true)
    expect(headroomIsSufficient(measured, Math.floor(edge) - 1)).toBe(false)
  })

  it('small packages get the 64 B floor', () => {
    expect(requiredHeadroom(1000)).toBe(64)
    expect(headroomIsSufficient(1000, 1064)).toBe(true)
    expect(headroomIsSufficient(1000, 1063)).toBe(false)
  })

  it('a comfortable budget is unaffected', () => {
    expect(headroomIsSufficient(1000, 2000)).toBe(true)
  })
})

describe('thin versus over budget', () => {
  it('under budget without the minimum headroom is thin', () => {
    expect(isThinHeadroom(5935, 6000)).toBe(true)
    expect(isThinHeadroom(5935, 6205)).toBe(false)
  })

  it('a budget already exceeded is a violation, not thin', () => {
    expect(isThinHeadroom(6100, 6000)).toBe(false)
  })
})
