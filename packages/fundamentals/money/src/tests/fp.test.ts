import * as fp from '../fp'
import * as core from '../index'
import type { Money } from '../index'
import { decimal, int, pick, rng, ROUNDING_MODES } from './rng'

const attempt = <T>(f: () => T): { v: T } | { e: string } => {
  try {
    return { v: f() }
  } catch (e) {
    return { e: (e as Error).message }
  }
}

describe('fp forms equal the value-first forms on seeded random cases', () => {
  it('add, subtract, multiply, divide, percentage, round, convert, allocate, split, equals', () => {
    const r = rng(31)

    for (let i = 0; i < 2000; i++) {
      const a = core.money(decimal(r, 8, 2), 'EUR', { rounding: 'halfExpand' })
      const b = core.money(decimal(r, 8, 2), 'EUR', { rounding: 'halfExpand' })
      const f = decimal(r, 3, 4)
      const rounding = pick(r, ROUNDING_MODES)
      const same = <T>(x: () => T, y: () => T): void => expect(attempt(x)).toEqual(attempt(y))

      same(() => fp.add(b)(a), () => core.add(a, b))
      same(() => fp.subtract(b)(a), () => core.subtract(a, b))
      same(() => fp.multiply(f, { rounding })(a), () => core.multiply(a, f, { rounding }))
      same(() => fp.divide(f, { rounding })(a), () => core.divide(a, f, { rounding }))
      same(() => fp.percentage(f, { rounding })(a), () => core.percentage(a, f, { rounding }))
      const digits = int(r, 0, 2)

      same(() => fp.round({ digits, mode: rounding })(a), () => core.round(a, { digits, mode: rounding }))
      same(() => fp.convert('USD', '1.0842', { rounding })(a), () => core.convert(a, 'USD', '1.0842', { rounding }))
      same(() => fp.allocate([1, 2, 3])(a), () => core.allocate(a, [1, 2, 3]))
      same(() => fp.split(3)(a), () => core.split(a, 3))
      same(() => fp.equals(b)(a), () => core.equals(a, b))
    }
  })

  it('the shared unary functions are the same functions', () => {
    expect(fp.negate).toBe(core.negate)
    expect(fp.compare).toBe(core.compare)
    expect(fp.isZero).toBe(core.isZero)
    const list: Money[] = [core.money('3', 'EUR'), core.money('1', 'EUR'), core.money('2', 'EUR')]

    expect([...list].sort(fp.compare).map((m) => m.amount)).toEqual(['1.00', '2.00', '3.00'])
  })
})
