/**
 * `value` is a multiple of `step` — float-safe.
 *
 * The check used to be `value % step === 0`, which is exact for an INTEGER
 * step (`fmod` is exact, and a multiple of an integer is an integer) but wrong
 * for a FRACTIONAL one: `0.01` has no binary representation, so
 * `19.99 % 0.01` is `0.009999999999998` and every valid price failed
 * `.multipleOf(0.01)`. The intent of a fractional step is DECIMAL (the spec
 * author wrote `0.01`, the user typed `19.99`), so that is what is decided:
 *
 *  - while the quotient still has fractional bits (|value / step| < 2^52), it
 *    is an integer to within the rounding error of that one division
 *    (a few ULPs): `19.99 / 0.01` is `1998.9999999999998`, `19.995 / 0.01` is
 *    `1999.4999999999998`;
 *  - beyond that the float quotient cannot tell, so both numbers are read as
 *    their shortest decimal spelling and divided exactly. Rare, and only then
 *    pays for the string work.
 *
 * The integer-step path is untouched (and stays byte-exact with the JIT's
 * inlined `%`).
 */
export function isMultipleOf(value: number, step: number): boolean {
  if (Number.isInteger(step) || !Number.isFinite(value) || !Number.isFinite(step) || step === 0) {
    return value % step === 0
  }
  const q = value / step
  if (Math.abs(q) < 2 ** 52) return Math.abs(q - Math.round(q)) <= Number.EPSILON * 8 * Math.max(1, Math.abs(q))
  const a = decimal(value)
  const b = decimal(step)
  const e = Math.max(a.e, b.e)
  return (a.m * 10n ** BigInt(e - a.e)) % (b.m * 10n ** BigInt(e - b.e)) === 0n
}

/** A finite number's shortest decimal spelling as an exact (digits, places) pair. */
function decimal(d: number): { m: bigint; e: number } {
  const [coef = '0', expPart] = String(d).toLowerCase().split('e')
  const [int = '0', frac = ''] = coef.split('.')
  const places = frac.length - Number(expPart ?? 0)
  const digits = BigInt(`${int}${frac}`)
  return places >= 0 ? { m: digits, e: places } : { m: digits * 10n ** BigInt(-places), e: 0 }
}
