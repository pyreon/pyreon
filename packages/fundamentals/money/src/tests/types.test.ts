import { add as fpAdd, multiply as fpMultiply, percentage as fpPercentage, round as fpRound } from '../fp'
import { add, allocate, money, multiply, subtract } from '../index'
import type { Decimal, Money, RoundingMode } from '../index'

/** Type-level tests: this file is checked by `tsc --noEmit`; a `@ts-expect-error` that stops erroring fails the typecheck. */

/** A structural copy of the input `@pyreon/format` will take for `formatMoney` (a follow-up there): no import in either direction. */
interface FormatMoneyInput {
  amount: string
  currency: string
}
interface FormatMoneyInputReadonly {
  readonly amount: string
  readonly currency: string
}

/** A local two-function `pipe`: money ships none (it has no dependencies); `@pyreon/time/fp` and `@pyreon/rx` have one. */
const pipe =
  <A, B, C>(f: (a: A) => B, g: (b: B) => C) =>
  (a: A): C =>
    g(f(a))

describe('types', () => {
  it('a Money is assignable to the structural { amount, currency } shape format takes, mutable or readonly', () => {
    const m: Money = money('9.99', 'EUR')
    const forFormat: FormatMoneyInput = m
    const readonlyToo: FormatMoneyInputReadonly = m
    const amount: Decimal = m.amount
    const back: Money = forFormat

    expect([forFormat.amount, readonlyToo.currency, amount, back.amount]).toEqual(['9.99', 'EUR', '9.99', '9.99'])
  })

  it('a Money is readonly, and arithmetic only takes Money', () => {
    const m = money('1', 'EUR')

    // @ts-expect-error a Money is immutable data
    m.amount = '2.00'
    // @ts-expect-error a bare string is not a Money
    expect(() => add('1.00', m)).toThrow()
    // @ts-expect-error a number is not a Money
    expect(() => subtract(m, 5)).toThrow()
    // @ts-expect-error an unknown rounding mode
    expect(() => money('1', 'EUR', { rounding: 'nearest' })).toThrow()
    const mode: RoundingMode = 'halfEven'

    expect(mode).toBe('halfEven')
  })

  it('factors, rates and ratios take numbers, decimal strings and bigints', () => {
    const m = money('10', 'EUR')

    expect(multiply(m, 3).amount).toBe('30.00')
    expect(multiply(m, '1.21').amount).toBe('12.10')
    expect(multiply(m, 2n).amount).toBe('20.00')
    expect(allocate(m, [1, '2', 3]).map((p) => p.amount)).toEqual(['1.67', '3.33', '5.00'])
    // @ts-expect-error a boolean is not a factor
    expect(() => multiply(m, true)).toThrow()
  })

  it('value-last forms compose with any pipe, and keep Money to Money', () => {
    const withVat = pipe(fpMultiply('1.21'), fpRound())
    const total = pipe(pipe(fpAdd(money('5.00', 'EUR')), fpPercentage(10)), fpRound({ increment: '0.05' }))
    const result: Money = withVat(money('10.00', 'EUR'))

    expect(result.amount).toBe('12.10')
    expect(total(money('5.00', 'EUR')).amount).toBe('1.00')
  })
})
