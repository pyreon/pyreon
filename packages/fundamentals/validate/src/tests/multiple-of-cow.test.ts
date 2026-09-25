/**
 * The float-safe `.multipleOf(step)` is a chain method like any other, so it
 * must be COPY-ON-WRITE: it returns a new schema and leaves the receiver
 * untouched. It builds its op by hand (to attach the JIT `_pred`) rather than
 * through a shared helper, which is where a push-onto-`this._ops` could survive
 * a refactor unnoticed.
 */
import { describe, expect, it } from 'vitest'
import { s } from '../index'

describe('multipleOf(fractional) does not mutate the receiver', () => {
  it('returns a new schema; the base still accepts 0.005', () => {
    const base = s.number()
    // Compile + cache the base first, so a mutation would also have to beat
    // the JIT cache to be visible.
    expect(base.parse(0.005).ok).toBe(true)
    const cents = base.multipleOf(0.01)
    expect(cents).not.toBe(base)
    expect(cents.parse(19.99).ok).toBe(true)
    expect(cents.parse(0.005).ok).toBe(false)
    expect(base.parse(0.005).ok).toBe(true)
    expect(base.is(0.005)).toBe(true)
  })

  it('two steps derived from one base stay independent', () => {
    const base = s.number()
    const cents = base.multipleOf(0.01)
    const quarters = base.multipleOf(0.25)
    expect(cents.parse(0.01).ok).toBe(true)
    expect(quarters.parse(0.01).ok).toBe(false)
    expect(quarters.parse(0.5).ok).toBe(true)
  })
})
