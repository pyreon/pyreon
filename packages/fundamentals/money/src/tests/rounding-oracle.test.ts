import { round as decimalRound } from '../decimal'
import { money, round } from '../index'
import { decimal, int, pick, rng, ROUNDING_MODES } from './rng'

/** The platform is the oracle for rounding: `Intl.NumberFormat` with the same `roundingMode`, fed the decimal STRING (exact). */
function intl(value: string, digits: number, mode: string, increment?: number): string {
  const options: Record<string, unknown> = {
    useGrouping: false,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    roundingMode: mode,
  }

  if (increment !== undefined) options.roundingIncrement = increment
  const text = new Intl.NumberFormat('en', options as Intl.NumberFormatOptions).format(value as unknown as number)

  // Intl prints a negative value that rounds to zero as "-0.00"; the canonical decimal never has a negative zero.
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text
}

describe('rounding against Intl.NumberFormat roundingMode (all nine modes)', () => {
  it('decimal.round to 0..4 digits equals Intl for random decimals, ties included', () => {
    const r = rng(1)

    for (let i = 0; i < 6000; i++) {
      const value = decimal(r, 5, 5)
      const digits = int(r, 0, 4)
      const mode = pick(r, ROUNDING_MODES)

      expect(decimalRound(value, { digits, mode }), `${value} ${mode} ${digits}`).toBe(intl(value, digits, mode))
    }
  })

  it('money(x, currency, { rounding }) equals Intl for EUR (2), JPY (0) and KWD (3)', () => {
    const r = rng(2)

    for (let i = 0; i < 3000; i++) {
      const value = decimal(r, 6, 6)
      const mode = pick(r, ROUNDING_MODES)
      const [code, digits] = pick(r, [['EUR', 2], ['JPY', 0], ['KWD', 3]] as const)

      expect(money(value, code, { rounding: mode }).amount, `${value} ${code} ${mode}`).toBe(intl(value, digits, mode))
    }
  })

  it('round(money, { digits }) to fewer digits equals Intl at that many digits', () => {
    const r = rng(3)

    for (let i = 0; i < 2000; i++) {
      const value = decimal(r, 6, 2)
      const m = money(value, 'EUR', { rounding: 'halfExpand' })
      const mode = pick(r, ROUNDING_MODES)
      const digits = int(r, 0, 1)
      const want = intl(m.amount, digits, mode)
      const got = round(m, { digits, mode }).amount

      expect(Number(got), `${m.amount} ${mode} ${digits}`).toBe(Number(want))
    }
  })

  it('cash rounding increments match Intl roundingIncrement (0.05, 0.10, 0.25, 0.50) in every mode', () => {
    const r = rng(4)

    for (let i = 0; i < 3000; i++) {
      const m = money(decimal(r, 5, 2), 'EUR', { rounding: 'halfExpand' })
      const [increment, text] = pick(r, [[5, '0.05'], [10, '0.10'], [25, '0.25'], [50, '0.50']] as const)
      const mode = pick(r, ROUNDING_MODES)

      expect(round(m, { increment: text, mode }).amount, `${m.amount} ${text} ${mode}`).toBe(intl(m.amount, 2, mode, increment))
    }
  })
})

describe('the nine modes on ties, positive and negative (hand-verified)', () => {
  const ties = ['2.5', '3.5', '-2.5', '-3.5', '0.5', '-0.5']
  const table: Record<string, string[]> = {
    ceil: ['3', '4', '-2', '-3', '1', '0'],
    floor: ['2', '3', '-3', '-4', '0', '-1'],
    expand: ['3', '4', '-3', '-4', '1', '-1'],
    trunc: ['2', '3', '-2', '-3', '0', '0'],
    halfCeil: ['3', '4', '-2', '-3', '1', '0'],
    halfFloor: ['2', '3', '-3', '-4', '0', '-1'],
    halfExpand: ['3', '4', '-3', '-4', '1', '-1'],
    halfTrunc: ['2', '3', '-2', '-3', '0', '0'],
    halfEven: ['2', '4', '-2', '-4', '0', '0'],
  }

  it.each(Object.entries(table))('%s', (mode, expected) => {
    expect(ties.map((t) => decimalRound(t, { mode: mode as never }))).toEqual(expected)
    expect(ties.map((t) => round(money(t, 'EUR'), { digits: 0, mode: mode as never }).amount.replace('.00', ''))).toEqual(expected)
  })
})
