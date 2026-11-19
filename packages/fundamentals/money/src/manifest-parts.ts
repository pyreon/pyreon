import type { ApiEntry } from '@pyreon/manifest'

/** One manifest entry; every example line with `// =>` is executed by `tests/examples.test.ts`. */
export function entry(name: string, signature: string, summary: string, example: string, extra?: Partial<ApiEntry>): ApiEntry {
  return { name, kind: 'function', signature, summary, example, ...extra, stability: 'experimental', since: '0.53.0' }
}

export const typeEntry = (name: string, signature: string, summary: string, example: string): ApiEntry =>
  ({ name, kind: 'type', signature, summary, example, stability: 'experimental', since: '0.53.0' })

const D = (name: string, signature: string, summary: string, example: string): ApiEntry =>
  entry(`decimal.${name}`, signature, summary, `import { ${name} } from '@pyreon/money/decimal'\n${example}`, { seeAlso: ['normalize'] })

const F = (name: string, signature: string, summary: string, example: string): ApiEntry =>
  entry(`fp.${name}`, signature, summary, `import { ${name} } from '@pyreon/money/fp'\n${example}`)

/** The `@pyreon/money/decimal` entries. */
export const decimalEntries: ApiEntry[] = [
  D('isDecimal', '(x: unknown) => x is Decimal', 'Whether `x` is a canonical decimal string: an optional `-`, digits with no leading zero, an optional `.` and digits; no `+`, no exponent, never `-0`. Never throws.', `isDecimal('9.90')   // => true
isDecimal('.5')     // => false
isDecimal('1e3')    // => false`),
  D('normalize', '(value: number | string | bigint) => Decimal', 'The canonical form of a decimal given as text (a leading `+`, `.5`, an exponent are accepted), a number (by its shortest text) or a bigint. The scale is kept: `"1.50"` stays `"1.50"`. At most 4096 digits.', `normalize('+.5')      // => '0.5'
normalize('1.5e2')    // => '150'
normalize('-0.00')    // => '0.00'`),
  D('add', '(a, b) => Decimal', 'Exact sum of two decimals of any size.', `add('0.1', '0.2')      // => '0.3'`),
  D('subtract', '(a, b) => Decimal', 'Exact difference.', `subtract('0.3', '0.1') // => '0.2'`),
  D('multiply', '(a, b) => Decimal', 'Exact product; the scale is the sum of the scales.', `multiply('19.99', '3') // => '59.97'`),
  D('divide', '(a, b, options?: { scale?: number; rounding?: RoundingMode }) => Decimal', 'The quotient rounded to `scale` digits (default 20) by `rounding` (default `halfExpand`). A zero divisor throws.', `divide('1', '3', { scale: 4 })  // => '0.3333'`),
  D('compare', '(a, b) => -1 | 0 | 1', 'Compare two decimals by value (`"9.90"` equals `"9.9"`).', `compare('9.90', '9.9')   // => 0`),
  D('round', '(value, options?: { digits?: number; increment?: number | string; mode?: RoundingMode }) => Decimal', 'Round to `digits` fraction digits (default 0) or to a multiple of `increment`, by one of the nine `Intl` rounding modes (default `halfExpand`). The result has the target scale.', `round('2.5')                          // => '3'
round('2.5', { mode: 'halfEven' })     // => '2'
round('1.23', { increment: '0.05' })   // => '1.25'`),
]

/** The `@pyreon/money/fp` entries. */
export const fpEntries: ApiEntry[] = [
  F('add', '(b: Money) => (m: Money) => Money', 'Value-last `add`.', `add({ amount: '1.00', currency: 'EUR' })({ amount: '2.50', currency: 'EUR' })   // => { amount: '3.50', currency: 'EUR' }`),
  F('subtract', '(b: Money) => (m: Money) => Money', 'Value-last `subtract`.', `subtract({ amount: '1.00', currency: 'EUR' })({ amount: '2.50', currency: 'EUR' })   // => { amount: '1.50', currency: 'EUR' }`),
  F('multiply', '(factor, options?) => (m: Money) => Money', 'Value-last `multiply`: `multiply("1.21")` is a function you can name, map and compose.', `multiply('1.21')({ amount: '10.00', currency: 'EUR' })   // => { amount: '12.10', currency: 'EUR' }`),
  F('divide', '(divisor, options?) => (m: Money) => Money', 'Value-last `divide`.', `divide(3)({ amount: '10.00', currency: 'EUR' })   // => { amount: '3.33', currency: 'EUR' }`),
  F('percentage', '(percent, options?) => (m: Money) => Money', 'Value-last `percentage`.', `percentage(21)({ amount: '200.00', currency: 'EUR' })   // => { amount: '42.00', currency: 'EUR' }`),
  F('round', '(options?) => (m: Money) => Money', 'Value-last `round`, including cash rounding.', `round({ increment: '0.05' })({ amount: '1.23', currency: 'CHF' })   // => { amount: '1.25', currency: 'CHF' }`),
  F('convert', '(to, rate, options?) => (m: Money) => Money', 'Value-last `convert`.', `convert('USD', '1.0842')({ amount: '100.00', currency: 'EUR' })   // => { amount: '108.42', currency: 'USD' }`),
  F('allocate', '(ratios) => (m: Money) => Money[]', 'Value-last `allocate`.', `allocate([1, 1, 1])({ amount: '100.00', currency: 'EUR' }).map((p) => p.amount)   // => ['33.34', '33.33', '33.33']`),
  F('split', '(parts) => (m: Money) => Money[]', 'Value-last `split`.', `split(2)({ amount: '0.01', currency: 'EUR' }).map((p) => p.amount)   // => ['0.01', '0.00']`),
  F('equals', '(other: Money) => (m: Money) => boolean', 'A predicate: true for an amount equal to `other`.', `equals({ amount: '1.00', currency: 'EUR' })({ amount: '1.00', currency: 'EUR' })   // => true`),
]
