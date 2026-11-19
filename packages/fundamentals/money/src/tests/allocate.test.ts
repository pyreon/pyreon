import { allocate, fromMinor, isZero, money, split, toMinor } from '../index'
import type { Money } from '../index'
import { int, rng } from './rng'

const total = (parts: Money[]): bigint => parts.reduce((s, p) => s + toMinor(p), 0n)

/** The exact share of `minor` for a ratio, as a rational: minor * w / W. */
const share = (minor: bigint, w: bigint, sum: bigint): { num: bigint; den: bigint } => ({ num: minor * w, den: sum })

describe('allocate: parts sum EXACTLY, each within one minor unit of its ideal share', () => {
  it('random amounts (positive and negative, up to 40 digits), 1 to 12 integer ratios, zeros mixed in', () => {
    const r = rng(21)

    for (let i = 0; i < 4000; i++) {
      const digits = i % 6 === 0 ? 40 : int(r, 1, 12)
      let units = ''

      for (let k = 0; k < digits; k++) units += String(int(r, k === 0 ? 1 : 0, 9))
      const minor = BigInt(units) * (r() < 0.3 ? -1n : 1n)
      const m = fromMinor(minor, 'EUR')
      const count = int(r, 1, 12)
      const ratios: number[] = Array.from({ length: count }, () => (r() < 0.25 ? 0 : int(r, 1, 50)))

      if (Math.max(...ratios) === 0) ratios[0] = 1
      const parts = allocate(m, ratios)
      const sumW = BigInt(ratios.reduce((a, b) => a + b, 0))

      expect(parts).toHaveLength(count)
      expect(total(parts), `${m.amount} by ${ratios}`).toBe(minor)
      parts.forEach((p, k) => {
        const abs = minor < 0n ? -minor : minor
        const { num, den } = share(abs, BigInt(ratios[k]!), sumW)
        const floor = num / den
        const got = toMinor(p) * (minor < 0n ? -1n : 1n)

        expect(got >= floor && got <= floor + 1n, `${m.amount} by ${ratios}: part ${k}`).toBe(true)
        if (ratios[k] === 0) expect(isZero(p)).toBe(true)
      })
    }
  })

  it('the rule: leftover units go to the largest fractional parts, ties to the first', () => {
    // 5 cents by [3, 7]: shares 1.5 and 3.5 cents, equal remainders, so the first part takes the leftover cent.
    expect(allocate(money('0.05', 'EUR'), [3, 7]).map((p) => p.amount)).toEqual(['0.02', '0.03'])
  })

  it('ties go to the earliest part; the largest remainder wins over position', () => {
    // 1.00 EUR in thirds: remainders are equal, so the first cents go to the first parts.
    expect(split(money('1.00', 'EUR'), 3).map((p) => p.amount)).toEqual(['0.34', '0.33', '0.33'])
    // 0.10 by [1, 1, 8]: shares 1, 1, 8 exactly, no leftover.
    expect(allocate(money('0.10', 'EUR'), [1, 1, 8]).map((p) => p.amount)).toEqual(['0.01', '0.01', '0.08'])
    // 0.02 by [1, 2]: shares 0.67 and 1.33 units: floors 0 and 1, leftover 1 goes to the larger remainder (0.67 -> first).
    expect(allocate(money('0.02', 'EUR'), [1, 2]).map((p) => p.amount)).toEqual(['0.01', '0.01'])
    // 0.01 by [1, 1, 1]: one unit, three equal remainders: the first part.
    expect(allocate(money('0.01', 'EUR'), [1, 1, 1]).map((p) => p.amount)).toEqual(['0.01', '0.00', '0.00'])
  })

  it('a negative amount mirrors the positive one', () => {
    const r = rng(22)

    for (let i = 0; i < 500; i++) {
      const minor = BigInt(int(r, 1, 1_000_000))
      const ratios = Array.from({ length: int(r, 1, 6) }, () => int(r, 1, 9))
      const pos = allocate(fromMinor(minor, 'EUR'), ratios).map((p) => toMinor(p))
      const neg = allocate(fromMinor(-minor, 'EUR'), ratios).map((p) => toMinor(p))

      expect(neg).toEqual(pos.map((p) => -p))
    }
  })

  it('reordering the ratios reorders the parts when the remainders are distinct', () => {
    const m = money('100.00', 'EUR')
    const a = allocate(m, [5, 3, 2]).map((p) => p.amount)
    const b = allocate(m, [2, 5, 3]).map((p) => p.amount)

    expect([...a].sort()).toEqual([...b].sort())
    expect(b).toEqual([a[2], a[0], a[1]])
  })

  it('fractional ratios as numbers or strings, JPY and KWD digits, a single part, split equals equal ratios', () => {
    expect(allocate(money('1.00', 'EUR'), [0.5, 0.5, 0.5]).map((p) => p.amount)).toEqual(['0.34', '0.33', '0.33'])
    expect(allocate(money('10.00', 'EUR'), ['0.1', '0.2', '0.7']).map((p) => p.amount)).toEqual(['1.00', '2.00', '7.00'])
    expect(allocate(money('100', 'JPY'), [1, 1, 1]).map((p) => p.amount)).toEqual(['34', '33', '33'])
    expect(allocate(money('1.000', 'KWD'), [1, 2]).map((p) => p.amount)).toEqual(['0.333', '0.667'])
    expect(allocate(money('10.01', 'EUR'), [5]).map((p) => p.amount)).toEqual(['10.01'])
    expect(allocate(money('10.00', 'EUR'), [0, 1]).map((p) => p.amount)).toEqual(['0.00', '10.00'])
    expect(split(money('0.07', 'EUR'), 4).map((p) => p.amount)).toEqual(allocate(money('0.07', 'EUR'), [1, 1, 1, 1]).map((p) => p.amount))
  })

  it('rejects all-zero, negative, empty and non-numeric ratios with a message that says why', () => {
    const m = money('10', 'EUR')

    expect(() => allocate(m, [0, 0])).toThrow(/\[Pyreon\] allocate: the ratios are all zero/)
    expect(() => allocate(m, [-1, 2])).toThrow(/ratios must not be negative/)
    expect(() => allocate(m, [])).toThrow(/non-empty array of ratios/)
    expect(() => allocate(m, [Number.NaN])).toThrow(/\[Pyreon\] allocate/)
    expect(() => allocate(m, 'abc' as never)).toThrow(/\[Pyreon\] allocate/)
    expect(() => split(m, 0)).toThrow(/\[Pyreon\] split/)
    expect(() => split(m, 2.5)).toThrow(/\[Pyreon\] split/)
  })
})
