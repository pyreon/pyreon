import { add as dAdd, compare as dCompare, divide as dDivide, multiply as dMultiply, subtract as dSubtract } from '../decimal'
import { add, allocate, compare, convert, divide, equals, fromMinor, max, min, money, multiply, negate, percentage, ratio, split, subtract, sum, toMinor, zero } from '../index'
import type { Money } from '../index'
import { decimal, int, rng } from './rng'

/** An independent reference: exact rationals on bigint pairs, written separately from the package's scaled-integer code. */
interface Q {
  num: bigint
  den: bigint
}

function q(text: string): Q {
  const neg = text.startsWith('-')
  const [i = '0', f = ''] = (neg ? text.slice(1) : text).split('.')
  const num = BigInt(i + f)

  return { num: neg ? -num : num, den: 10n ** BigInt(f.length) }
}

const qAdd = (a: Q, b: Q): Q => ({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
const qMul = (a: Q, b: Q): Q => ({ num: a.num * b.num, den: a.den * b.den })
const qEq = (a: Q, b: Q): boolean => a.num * b.den === b.num * a.den

const qCmp = (a: Q, b: Q): -1 | 0 | 1 => {
  const l = a.num * b.den
  const r = b.num * a.den

  return l < r ? -1 : l > r ? 1 : 0
}

describe('decimal arithmetic against an independent rational reference', () => {
  it('add, subtract, multiply and compare are exact for random decimals of mixed scales and sizes', () => {
    const r = rng(11)

    for (let i = 0; i < 4000; i++) {
      const a = decimal(r, i % 7 === 0 ? 40 : 8, 8)
      const b = decimal(r, i % 5 === 0 ? 40 : 8, 8)

      expect(qEq(q(dAdd(a, b)), qAdd(q(a), q(b))), `${a} + ${b}`).toBe(true)
      expect(qEq(q(dSubtract(a, b)), qAdd(q(a), { num: -q(b).num, den: q(b).den })), `${a} - ${b}`).toBe(true)
      expect(qEq(q(dMultiply(a, b)), qMul(q(a), q(b))), `${a} * ${b}`).toBe(true)
      expect(dCompare(a, b), `${a} ? ${b}`).toBe(qCmp(q(a), q(b)))
    }
  })

  it('divide is the nearest value at the scale (halfExpand): |a/b - result| is at most half a unit in the last place', () => {
    const r = rng(12)

    for (let i = 0; i < 3000; i++) {
      const a = decimal(r, 8, 4)
      let b = decimal(r, 5, 3)

      if (q(b).num === 0n) b = '7'
      const scale = int(r, 0, 8)
      const got = q(dDivide(a, b, { scale }))
      // |a/b - got| <= 1/2 * 10^-scale  <=>  2 * |a*gotDen - got*b...| compared with the unit, on integers
      const exact = qMul(q(a), { num: q(b).den, den: q(b).num })
      const diff = qAdd(exact, { num: -got.num, den: got.den })
      const half: Q = { num: 1n, den: 2n * 10n ** BigInt(scale) }
      const abs: Q = { num: diff.num < 0n ? -diff.num : diff.num, den: diff.den < 0n ? -diff.den : diff.den }

      expect(qCmp(abs, half) <= 0, `${a} / ${b} at ${scale}`).toBe(true)
    }
  })
})

describe('Money arithmetic against the same reference', () => {
  const E = (v: string): Money => money(v, 'EUR')

  it('add, subtract, sum and compare equal the rational result at 2 digits, including 16+ digit amounts', () => {
    const r = rng(13)

    for (let i = 0; i < 3000; i++) {
      const big = i % 4 === 0
      const a = money(decimal(r, big ? 30 : 9, 2), 'EUR', { rounding: 'halfExpand' })
      const b = money(decimal(r, big ? 30 : 9, 2), 'EUR', { rounding: 'halfExpand' })

      expect(qEq(q(add(a, b).amount), qAdd(q(a.amount), q(b.amount))), `${a.amount} + ${b.amount}`).toBe(true)
      expect(qEq(q(subtract(a, b).amount), qAdd(q(a.amount), { num: -q(b.amount).num, den: q(b.amount).den }))).toBe(true)
      expect(compare(a, b)).toBe(qCmp(q(a.amount), q(b.amount)))
      expect(sum([a, b, a]).amount).toBe(add(add(a, b), a).amount)
    }
  })

  it('multiply and divide are the nearest minor unit (halfExpand) of the exact rational result', () => {
    const r = rng(14)

    for (let i = 0; i < 3000; i++) {
      const m = money(decimal(r, 8, 2), 'EUR', { rounding: 'halfExpand' })
      const f = decimal(r, 3, 4)
      const got = q(multiply(m, f).amount)
      const exact = qMul(q(m.amount), q(f))
      const diff = qAdd(exact, { num: -got.num, den: got.den })
      const half: Q = { num: 1n, den: 200n }

      expect(qCmp({ num: diff.num < 0n ? -diff.num : diff.num, den: diff.den }, half) <= 0, `${m.amount} * ${f}`).toBe(true)
      let d = decimal(r, 3, 2)

      if (q(d).num === 0n) d = '3'
      const dv = q(divide(m, d).amount)
      const exactDiv = qMul(q(m.amount), { num: q(d).den, den: q(d).num })
      const dd = qAdd(exactDiv, { num: -dv.num, den: dv.den })
      const dAbs: Q = { num: dd.num < 0n ? -dd.num : dd.num, den: dd.den < 0n ? -dd.den : dd.den }

      expect(qCmp(dAbs, half) <= 0, `${m.amount} / ${d}`).toBe(true)
    }
  })

  it('the cases the package exists for', () => {
    expect(add(E('0.10'), E('0.20')).amount).toBe('0.30')
    expect(multiply(E('19.99'), 3).amount).toBe('59.97')
    expect(split(E('100'), 3).map((p) => p.amount)).toEqual(['33.34', '33.33', '33.33'])
    expect(sum(['0.1', '0.1', '0.1', '0.1', '0.1', '0.1', '0.1', '0.1', '0.1', '0.1'].map(E)).amount).toBe('1.00')
    expect(percentage(E('200'), 21).amount).toBe('42.00')
    expect(percentage(E('100'), 150).amount).toBe('150.00')
    expect(percentage(E('100'), -10).amount).toBe('-10.00')
    expect(multiply(E('10'), '1.21').amount).toBe('12.10')
    expect(multiply(E('0.05'), '0.5').amount).toBe('0.03')
    expect(multiply(E('-0.05'), '0.5').amount).toBe('-0.03')
    expect(multiply(E('0.05'), '0.5', { rounding: 'halfEven' }).amount).toBe('0.02')
    expect(divide(E('10'), 3).amount).toBe('3.33')
    expect(negate(E('5')).amount).toBe('-5.00')
    expect(negate(zero('EUR')).amount).toBe('0.00')
    expect(subtract(E('1'), E('1')).amount).toBe('0.00')
    expect(min(E('3'), E('2'), E('4')).amount).toBe('2.00')
    expect(max(E('3'), E('2'), E('4')).amount).toBe('4.00')
    expect(equals(E('1.5'), E('1.50'))).toBe(true)
    expect(equals(E('1'), money('1', 'USD'))).toBe(false)
    expect(ratio(E('1'), E('4'))).toBe('0.25')
    expect(ratio(E('1'), E('3'), { scale: 4 })).toBe('0.3333')
    expect(ratio(E('4'), E('2'))).toBe('2')
  })

  it('convert: rate as a string, to a currency with other digits, and the audit-trail maths', () => {
    expect(convert(E('100'), 'USD', '1.0842').amount).toBe('108.42')
    expect(convert(E('100'), 'JPY', '162.5').amount).toBe('16250')
    expect(convert(money('16250', 'JPY'), 'EUR', '0.00615').amount).toBe('99.94')
    expect(convert(E('100'), 'KWD', '0.3333').amount).toBe('33.330')
    expect(convert(E('0.01'), 'JPY', '1').amount).toBe('0')
    expect(convert(E('0.5'), 'JPY', '1', { rounding: 'ceil' }).amount).toBe('1')
    expect(convert(E('100'), 'USD', 1.0842).amount).toBe('108.42')
  })

  it('minor units beyond safe integers stay exact', () => {
    const huge = fromMinor('123456789012345678901234567890', 'EUR')

    expect(huge.amount).toBe('1234567890123456789012345678.90')
    expect(toMinor(add(huge, E('0.10')))).toBe(123456789012345678901234567900n)
    expect(allocate(huge, [1, 1, 1]).reduce((s, p) => s + toMinor(p), 0n)).toBe(toMinor(huge))
  })
})
