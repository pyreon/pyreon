import { add as dAdd, divide as dDivide, multiply as dMultiply, round as dRound } from '../decimal'
import { add, allocate, convert, fromMinor, isMoney, money, multiply, percentage, round, split, subtract, sum, toMinorNumber } from '../index'
import type { Money } from '../index'

/** The docs' recipes and "coming from" rows, run: the docs show these snippets with these outputs. */
const E = (v: string): Money => money(v, 'EUR')

describe('recipes', () => {
  it('a cart total with a discount and VAT', () => {
    const lines = [
      { price: E('19.99'), qty: 3 },
      { price: E('5.00'), qty: 1 },
    ]
    const subtotal = sum(lines.map((l) => multiply(l.price, l.qty)))
    const discount = percentage(subtotal, 10)
    const net = subtract(subtotal, discount)
    const vat = percentage(net, 21)
    const total = add(net, vat)

    expect([subtotal.amount, discount.amount, net.amount, vat.amount, total.amount]).toEqual(['64.97', '6.50', '58.47', '12.28', '70.75'])
  })

  it('splitting a bill three ways without losing a cent', () => {
    const shares = split(E('100.00'), 3)

    expect(shares.map((p) => p.amount)).toEqual(['33.34', '33.33', '33.33'])
    expect(sum(shares).amount).toBe('100.00')
  })

  it('invoice lines that sum to the invoice total, and why the order of rounding matters', () => {
    const nets = [E('9.99'), E('9.99'), E('9.99')]
    const perLine = sum(nets.map((n) => percentage(n, 21)))
    const onTotal = percentage(sum(nets), 21)

    expect(perLine.amount).toBe('6.30') // 2.10 + 2.10 + 2.10
    expect(onTotal.amount).toBe('6.29') // 29.97 x 21%
    // To make the printed lines add up to the VAT on the total, share that VAT across the lines by their net amounts.
    const vatLines = allocate(onTotal, nets.map((n) => n.amount))

    expect(vatLines.map((v) => v.amount)).toEqual(['2.10', '2.10', '2.09'])
    expect(sum(vatLines).amount).toBe(onTotal.amount)
  })

  it('cash rounding to 0.05', () => {
    expect(round(money('12.34', 'CHF'), { increment: '0.05' }).amount).toBe('12.35')
    expect(round(money('12.32', 'CHF'), { increment: '0.05' }).amount).toBe('12.30')
    expect(round(money('12.325', 'CHF', { rounding: 'halfExpand' }), { increment: '0.05' }).amount).toBe('12.35')
  })

  it('converting with a rate and keeping the audit trail', () => {
    const from = E('100.00')
    const rate = '1.0842'
    const result = convert(from, 'USD', rate)
    const record = { from, to: result, rate }

    expect(record).toEqual({ from: { amount: '100.00', currency: 'EUR' }, to: { amount: '108.42', currency: 'USD' }, rate: '1.0842' })
  })

  it('Stripe-style minor units in and out', () => {
    const charge = fromMinor(1999, 'EUR')

    expect(charge.amount).toBe('19.99')
    expect(toMinorNumber(multiply(charge, 3))).toBe(5997)
    expect(fromMinor(500, 'JPY').amount).toBe('500')
  })

  it('storing money in JSON: a Money survives, and the guard checks what comes back', () => {
    const stored = JSON.stringify({ price: E('9.99') })
    const back = JSON.parse(stored) as { price: unknown }

    expect(stored).toBe('{"price":{"amount":"9.99","currency":"EUR"}}')
    expect(isMoney(back.price)).toBe(true)
    expect(isMoney({ amount: 9.99, currency: 'EUR' })).toBe(false)
  })
})

describe('coming from', () => {
  it.each([
    ['floats: 0.1 + 0.2', () => add(E('0.10'), E('0.20')).amount, '0.30'],
    ['floats: 1.1 * 3 (3.3000000000000003)', () => multiply(E('1.10'), 3).amount, '3.30'],
    ['floats: (1.005).toFixed(2) is "1.00"', () => money('1.005', 'EUR', { rounding: 'halfExpand' }).amount, '1.01'],
    ['floats: Math.round(x * 100) / 100', () => money('2.675', 'EUR', { rounding: 'halfExpand' }).amount, '2.68'],
    ['dinero: dinero({ amount: 1999, currency: EUR })', () => fromMinor(1999, 'EUR'), { amount: '19.99', currency: 'EUR' }],
    ['dinero: add(a, b)', () => add(E('1.50'), E('2.25')).amount, '3.75'],
    ['dinero: multiply(a, 3)', () => multiply(E('1.50'), 3).amount, '4.50'],
    ['dinero: allocate(a, [1, 1, 1])', () => allocate(E('1.00'), [1, 1, 1]).map((p) => p.amount), ['0.34', '0.33', '0.33']],
    ['dinero: toDecimal(a)', () => E('19.99').amount, '19.99'],
    ['currency.js: currency(1.1).add(2.2)', () => add(E('1.10'), E('2.20')).amount, '3.30'],
    ['currency.js: currency(100).distribute(3)', () => split(E('100'), 3).map((p) => p.amount), ['33.34', '33.33', '33.33']],
    ['currency.js: currency(19.99).multiply(3)', () => multiply(E('19.99'), 3).amount, '59.97'],
    ['big.js: new Big("0.1").plus("0.2")', () => dAdd('0.1', '0.2'), '0.3'],
    ['big.js: new Big("19.99").times(3)', () => dMultiply('19.99', 3), '59.97'],
    ['big.js: new Big(1).div(3).round(4)', () => dDivide('1', '3', { scale: 4 }), '0.3333'],
    ['big.js / decimal.js: x.toDecimalPlaces(2)', () => dRound('2.675', { digits: 2 }), '2.68'],
  ] as const)('%s', (_name, ours, expected) => {
    expect(ours()).toEqual(expected)
  })
})
