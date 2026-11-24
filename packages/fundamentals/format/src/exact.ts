/**
 * Exact order and exact ranges for number-like values (number, bigint, decimal string).
 *
 * `Intl.NumberFormat#format` formats a decimal string exactly on every engine, but `formatRange` does not: V8 turns
 * string ends into doubles first, so `formatRange('12345678901234567.11', '12345678901234567.19')` becomes
 * `~12,345,678,901,234,567.11` (JavaScriptCore is exact). See {@link exactRange}.
 */

type Exact = number | bigint | string

/** An exact value as `n / 10^k`: every double, bigint and decimal string is a finite decimal. */
function scaled(v: Exact): [bigint, number] {
  if (typeof v === 'bigint') return [v, 0]
  if (typeof v === 'string') {
    const [int = '', fraction = ''] = v.split('.')

    return [BigInt(int + fraction), fraction.length]
  }
  if (Number.isInteger(v)) return [BigInt(v), 0]
  // A non-integer double is mantissa * 2^-k = mantissa * 5^k / 10^k.
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, v)
  const bits = view.getBigUint64(0)
  const exponent = Number((bits >> 52n) & 0x7ffn)
  const k = 1075 - (exponent || 1)
  const mantissa = (bits & 0xfffffffffffffn) | (exponent ? 1n << 52n : 0n)

  return [(v < 0 ? -mantissa : mantissa) * 5n ** BigInt(k), k]
}

/** Whether `a > b` exactly, across numbers, bigints and decimal strings (JS compares number and bigint exactly itself). */
export function greater(a: Exact, b: Exact): boolean {
  if (typeof a !== 'string' && typeof b !== 'string') return a > b
  const x = Number(a)
  const y = Number(b)
  // Number() is monotonic: different doubles decide. Equal ones are finite here (a usable decimal string is).
  if (x !== y) return x > y
  const [m, i] = scaled(a)
  const [n, j] = scaled(b)

  return m * 10n ** BigInt(j) > n * 10n ** BigInt(i)
}

/** The locale's range separator: the literal between the ends of a range that shares nothing but its separator. */
function separatorOf(intl: Intl.NumberFormat): string {
  const parts = intl.formatRangeToParts(1, 2) as Array<{ type: string; value: string; source: string }>
  let separator = ''
  for (let i = parts.findLastIndex((p) => p.source === 'startRange') + 1; i < parts.length && parts[i]?.source === 'shared'; i++) separator += parts[i]?.value ?? ''

  return separator
}

/**
 * `intl.formatRange(lo, hi)` with exact digits for bigint and decimal-string ends; `lo <= hi` already (see {@link greater}).
 * When the doubles nearest the ends print exactly like them (every amount up to about 15 significant digits), `Intl`
 * lays the range out itself (shared parts, separator, the approximately sign). Beyond that (V8 would print the doubles,
 * and a double can round across a power of ten or into another plural form), the two exact ends are joined by the
 * locale's separator, or shown once with the approximately sign when they print the same.
 */
export function exactRange(intl: Intl.NumberFormat, lo: Exact, hi: Exact): string {
  if (typeof lo === 'number' && typeof hi === 'number') return intl.formatRange(lo, hi)
  const a = intl.format(lo as `${number}`)
  const b = intl.format(hi as `${number}`)
  const x = Number(lo)
  const y = Number(hi)
  if (intl.format(x) === a && intl.format(y) === b) return intl.formatRange(x, y)
  if (a === b) return intl.formatRange(1, 1).replace(intl.format(1), a)

  return a + separatorOf(intl) + b
}
