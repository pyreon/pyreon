import { defineManifest } from '@pyreon/manifest'
import { decimalEntries, entry, fpEntries, typeEntry } from './manifest-parts'

/** Every `// =>` line in an example is executed by `src/tests/examples.test.ts` and compared with the value after the arrow. */
export default defineManifest({
  name: '@pyreon/money',
  title: 'Money',
  tagline: 'Exact amounts of money as plain data: decimal-string amounts, bigint math, nine rounding modes, allocation that never loses a cent',
  description:
    'A Money is `{ amount: "9.99", currency: "EUR" }`: plain, JSON-safe, exact, with exactly the currency\'s minor digits so equal amounts are the same string. All arithmetic runs on bigint scaled integers, never on binary floats: `add`, `subtract`, `multiply`, `divide`, `percentage`, `allocate` (parts that sum exactly), `round` (nine `Intl` rounding modes and cash-rounding increments), `convert` with a rate. A `number` is accepted only when its shortest text fits the currency, so `money(0.1 + 0.2, "EUR")` throws and explains floating point instead of hiding the bug. Currency digits are ISO 4217 minor units (a 27-entry table of the codes that are not 2, so they agree on every engine; `Intl` only says which codes exist); `defineCurrency` adds custom currencies or gives an ISO one the digits a payment provider uses. `@pyreon/money/decimal` exposes the exact decimal-string math, `@pyreon/money/fp` the value-last forms. Zero dependencies. It formats nothing: `formatCurrency(m)` from `@pyreon/format` displays a Money exactly.',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale: 'not lowered by PMTC yet: pure computation on strings and bigint, so it can become `shared` once Swift and Kotlin ports of the same functions exist (a Money is already how payment APIs send amounts); until then the compiler warns on import rather than miscompiling',
  },
  features: [
    'A Money is plain data: { amount: "9.99", currency: "EUR" }, JSON-safe, comparable field by field',
    'Exact: bigint scaled-integer math, never a binary float; a float with floating-point noise throws and says how to fix it',
    'allocate and split: parts sum EXACTLY to the amount; remainder units go to the largest fractional parts, ties to the first',
    'Nine rounding modes named as Intl.NumberFormat roundingMode names, verified against Intl; cash rounding with increments',
    'ISO 4217 currency digits, identical on every engine (JPY 0, EUR 2, HUF 2, KWD 3), plus bounded defineCurrency for custom codes and provider overrides; minor-unit converters for Stripe-style APIs',
    'Exact decimal-string math in @pyreon/money/decimal; value-last forms in @pyreon/money/fp',
    'Zero dependencies; mixing currencies throws with both codes named',
  ],
  longExample: `import { money, add, multiply, allocate, round } from '@pyreon/money'

add(money('0.10', 'EUR'), money('0.20', 'EUR'))      // => { amount: '0.30', currency: 'EUR' }
multiply(money('19.99', 'EUR'), 3)                  // => { amount: '59.97', currency: 'EUR' }
allocate(money('100.00', 'EUR'), [1, 1, 1]).map((p) => p.amount)   // => ['33.34', '33.33', '33.33']`,
  api: [
    entry('money', '(amount: number | string | bigint, currency: CurrencyCode, options?: { rounding?: RoundingMode }) => Money', 'Build a Money. A string is exact; a number is read by its shortest round-trip text (`9.99` is exactly 9.99); a bigint is whole units. A number or string with more decimals than the currency has throws (floating-point noise such as `0.1 + 0.2` is explained) unless `rounding` is given; trailing zeros that lose nothing are fine. The result has exactly the currency\'s digits. Input is at most 4096 digits.', `money(9.99, 'EUR')                        // => { amount: '9.99', currency: 'EUR' }
money('10', 'EUR')                        // => { amount: '10.00', currency: 'EUR' }
money(100, 'JPY')                         // => { amount: '100', currency: 'JPY' }
money('9.995', 'EUR', { rounding: 'halfExpand' })   // => { amount: '10.00', currency: 'EUR' }`, {
      mistakes: ['Doing arithmetic on `number` prices and wrapping the result: `money(price * qty, "EUR")` is float arithmetic first. Keep amounts as Money and use `multiply`', 'Passing `0.1 + 0.2`: it throws on purpose. Round deliberately with `{ rounding }`, or better, never compute in floats'],
      seeAlso: ['fromMinor', 'add'],
    }),
    entry('fromMinor', '(units: number | bigint | string, currency: CurrencyCode) => Money', 'A Money from minor units (cents), the Stripe style. A number must be a safe integer; use a bigint or a digit string above 2^53.', `fromMinor(999, 'EUR')                     // => { amount: '9.99', currency: 'EUR' }
fromMinor('123456789012345678901', 'EUR') // => { amount: '1234567890123456789.01', currency: 'EUR' }`, { seeAlso: ['toMinor'] }),
    entry('toMinor', '(m: Money) => bigint', 'The amount in minor units as a bigint.', `toMinor(money('9.99', 'EUR'))             // => 999n`, { seeAlso: ['toMinorNumber', 'fromMinor'] }),
    entry('toMinorNumber', '(m: Money) => number', 'The amount in minor units as a number; throws beyond the safe integer range and says to use `toMinor`.', `toMinorNumber(money('9.99', 'EUR'))       // => 999`),
    entry('isMoney', '(x: unknown) => x is Money', 'Strict guard: exactly the fields `amount` and `currency`, a known currency, a canonical amount with exactly that currency\'s digits. Never throws. Use it at every boundary where data comes in.', `isMoney({ amount: '9.99', currency: 'EUR' })   // => true
isMoney({ amount: '9.9', currency: 'EUR' })    // => false
isMoney({ amount: 9.99, currency: 'EUR' })     // => false`),
    entry('zero', '(currency: CurrencyCode) => Money', 'Zero in a currency.', `zero('EUR')                               // => { amount: '0.00', currency: 'EUR' }`),
    entry('add', '(a: Money, b: Money) => Money', 'Exact sum of two amounts of one currency. Mixing currencies throws and names both.', `add(money('0.10', 'EUR'), money('0.20', 'EUR'))   // => { amount: '0.30', currency: 'EUR' }`, { mistakes: ['Adding amounts of different currencies: it throws. Convert one side first with `convert`'], seeAlso: ['sum', 'subtract'] }),
    entry('subtract', '(a: Money, b: Money) => Money', 'Exact difference `a - b`.', `subtract(money('1.00', 'EUR'), money('0.01', 'EUR'))   // => { amount: '0.99', currency: 'EUR' }`),
    entry('negate', '(m: Money) => Money', 'The amount with the opposite sign; never produces a negative zero.', `negate(money('5', 'EUR'))                 // => { amount: '-5.00', currency: 'EUR' }`),
    entry('abs', '(m: Money) => Money', 'The amount without its sign.', `abs(money('-5', 'EUR'))                  // => { amount: '5.00', currency: 'EUR' }`),
    entry('sum', '(list: Iterable<Money>, currency?: CurrencyCode) => Money', 'The sum of a list of one currency. An empty list needs `currency`.', `sum([money('1.10', 'EUR'), money('2.20', 'EUR')])   // => { amount: '3.30', currency: 'EUR' }
sum([], 'EUR')                            // => { amount: '0.00', currency: 'EUR' }`, { mistakes: ['Summing rounded parts and expecting the rounded total: round once at the end, or allocate'] }),
    entry('multiply', '(m: Money, factor: number | string | bigint, options?: { rounding?: RoundingMode }) => Money', 'The amount times a plain number, rounded to the currency\'s digits (default `halfExpand`: round half away from zero). Prefer a string factor; a number is read by its shortest text.', `multiply(money('19.99', 'EUR'), 3)        // => { amount: '59.97', currency: 'EUR' }
multiply(money('10.00', 'EUR'), '1.21')   // => { amount: '12.10', currency: 'EUR' }
multiply(money('0.05', 'EUR'), '0.5', { rounding: 'halfEven' })   // => { amount: '0.02', currency: 'EUR' }`, { seeAlso: ['percentage', 'allocate'] }),
    entry('divide', '(m: Money, divisor: number | string | bigint, options?: { rounding?: RoundingMode }) => Money', 'The amount divided by a plain number, rounded to the currency\'s digits. A zero divisor throws. To split without losing a cent use `allocate`: dividing three ways and multiplying back does not give the amount.', `divide(money('10.00', 'EUR'), 3)          // => { amount: '3.33', currency: 'EUR' }`, { seeAlso: ['allocate', 'split'] }),
    entry('allocate', '(m: Money, ratios: readonly (number | string)[]) => Money[]', 'Share an amount by ratios so the parts sum EXACTLY to it. Each part is its floor share in minor units; the minor units left over go one each to the parts with the largest fractional remainders, ties to the first. A negative amount is shared by its absolute value and the parts take its sign. A ratio of zero gets zero; negative or all-zero ratios throw. Each part is within one minor unit of its exact share.', `allocate(money('100.00', 'EUR'), [1, 1, 1]).map((p) => p.amount)   // => ['33.34', '33.33', '33.33']
allocate(money('0.05', 'EUR'), [3, 7]).map((p) => p.amount)         // => ['0.02', '0.03']`, { seeAlso: ['split'] }),
    entry('split', '(m: Money, parts: number) => Money[]', 'Split into equal parts that sum exactly to the amount; the first parts get the extra cent.', `split(money('100.00', 'EUR'), 3).map((p) => p.amount)   // => ['33.34', '33.33', '33.33']`),
    entry('percentage', '(m: Money, percent: number | string | bigint, options?: { rounding?: RoundingMode }) => Money', '`percent` percent of an amount, rounded to the currency\'s digits. Over 100 and negative percentages work.', `percentage(money('200.00', 'EUR'), 21)    // => { amount: '42.00', currency: 'EUR' }`),
    entry('ratio', '(a: Money, b: Money, options?: { scale?: number; rounding?: RoundingMode }) => Decimal', '`a / b` as a decimal string with trailing zeros removed, rounded to `scale` digits (default 10). Both amounts must be one currency; a zero `b` throws.', `ratio(money('1.00', 'EUR'), money('4.00', 'EUR'))   // => '0.25'
ratio(money('1.00', 'EUR'), money('3.00', 'EUR'), { scale: 4 })   // => '0.3333'`),
    entry('compare', '(a: Money, b: Money) => -1 | 0 | 1', 'Order two amounts of one currency (usable as an `Array#sort` comparator). Different currencies throw.', `compare(money('1.00', 'EUR'), money('2.00', 'EUR'))   // => -1`),
    entry('equals', '(a: Money, b: Money) => boolean', 'Whether two amounts are equal; different currencies are not equal (this does not throw).', `equals(money('1.5', 'EUR'), money('1.50', 'EUR'))   // => true
equals(money('1', 'EUR'), money('1', 'USD'))        // => false`),
    entry('min', '(...amounts: [Money, ...Money[]]) => Money', 'The smallest amount.', `min(money('3', 'EUR'), money('2', 'EUR'))   // => { amount: '2.00', currency: 'EUR' }`),
    entry('max', '(...amounts: [Money, ...Money[]]) => Money', 'The largest amount.', `max(money('3', 'EUR'), money('2', 'EUR'))   // => { amount: '3.00', currency: 'EUR' }`),
    entry('isZero', '(m: Money) => boolean', 'Whether the amount is zero.', `isZero(zero('EUR'))                       // => true`),
    entry('isPositive', '(m: Money) => boolean', 'Whether the amount is above zero.', `isPositive(money('0.01', 'EUR'))          // => true`),
    entry('isNegative', '(m: Money) => boolean', 'Whether the amount is below zero.', `isNegative(money('-0.01', 'EUR'))         // => true`),
    entry('round', '(m: Money, options?: { digits?: number; increment?: string | number; mode?: RoundingMode }) => Money', 'Round to fewer digits or to a multiple of an increment (cash rounding), by one of the nine modes named as `Intl.NumberFormat` names them: `ceil`, `floor`, `expand`, `trunc`, `halfCeil`, `halfFloor`, `halfExpand` (default, "round half up"), `halfTrunc`, `halfEven` (banker\'s rounding). `digits` and `increment` do not combine; an increment finer than the currency\'s minor unit throws. With no options it is the amount itself.', `round(money('12.34', 'EUR'), { digits: 0 })                  // => { amount: '12.00', currency: 'EUR' }
round(money('1.23', 'CHF'), { increment: '0.05' })           // => { amount: '1.25', currency: 'CHF' }
round(money('2.50', 'EUR'), { digits: 0, mode: 'halfEven' }) // => { amount: '2.00', currency: 'EUR' }`, { mistakes: ['`toFixed(2)` as rounding: it works on the binary float, so `(1.005).toFixed(2)` is "1.00". Use `money("1.005", "EUR", { rounding: "halfExpand" })`'] }),
    entry('convert', '(m: Money, to: CurrencyCode, rate: number | string | bigint, options?: { rounding?: RoundingMode }) => Money', 'Convert with a rate (`1 unit of m.currency = rate units of to`), rounded to the target\'s digits. Give the rate as a decimal string. Keep `{ from, to, rate }` next to the result: it is the audit trail.', `convert(money('100.00', 'EUR'), 'USD', '1.0842')   // => { amount: '108.42', currency: 'USD' }
convert(money('100.00', 'EUR'), 'JPY', '162.5')     // => { amount: '16250', currency: 'JPY' }`),
    entry('currencyDigits', '(code: CurrencyCode) => number', 'The minor-unit digits of a currency: what `defineCurrency` gave it, else its ISO 4217 minor unit. The same on every engine (`Intl` is never asked for digits: V8 reports CLDR display digits, 0 for HUF, IDR, COP, IQD and others, while JavaScriptCore reports ISO 4217).', `currencyDigits('EUR')                     // => 2
currencyDigits('JPY')                     // => 0
currencyDigits('KWD')                     // => 3
currencyDigits('HUF')                     // => 2`),
    entry('isCurrency', '(code: string) => boolean', 'Whether `code` is an upper-case ISO 4217 code the platform knows, or a registered one. Never throws.', `isCurrency('EUR')                         // => true
isCurrency('eur')                         // => false`),
    entry('defineCurrency', '(code: string, spec: { digits: number }) => void', 'Register a currency the platform does not know (crypto, points, a test currency), or give an ISO currency the digits your payment provider uses (ISK in hundredths). The code is 2 to 12 upper-case letters or digits starting with a letter. A code is defined once, at startup: the same digits again is fine, different digits throw. At most 64 are registered.', `defineCurrency('PTS', { digits: 0 })
currencyDigits('PTS')                     // => 0
defineCurrency('ISK', { digits: 2 })
fromMinor(12345, 'ISK')                   // => { amount: '123.45', currency: 'ISK' }`),
    typeEntry('Money', 'interface Money { readonly amount: string; readonly currency: CurrencyCode }', 'Exact money as plain data. The amount is canonical decimal text with exactly the currency\'s digits. A Money is structurally the `{ amount, currency }` shape payment APIs and `@pyreon/format` use.', `const price: Money = { amount: '9.99', currency: 'EUR' }`),
    typeEntry('Decimal', 'type Decimal = string', 'Canonical decimal text: optional `-`, digits, optional `.` and digits; no exponent, no `+`, no leading zeros, never `-0`.', `const d: Decimal = '9.90'`),
    typeEntry('CurrencyCode', 'type CurrencyCode = string', 'An ISO 4217 code (`"EUR"`) or a code registered with `defineCurrency`.', `const c: CurrencyCode = 'EUR'`),
    typeEntry('RoundingMode', "type RoundingMode = 'ceil' | 'floor' | 'expand' | 'trunc' | 'halfCeil' | 'halfFloor' | 'halfExpand' | 'halfTrunc' | 'halfEven'", 'The nine rounding modes, named as `Intl.NumberFormat`\'s `roundingMode` names them. The default is `halfExpand`.', `const mode: RoundingMode = 'halfEven'`),
    ...decimalEntries,
    ...fpEntries,
  ],
  gotchas: [
    { label: 'The float-input rule', note: 'A `number` is read by its shortest round-trip text, so `money(9.99, "EUR")` is exactly 9.99. A number (or string) with more decimals than the currency has throws unless `rounding` is given: `money(0.1 + 0.2, "EUR")` is `0.30000000000000004`, which is floating-point noise, not an amount. Trailing zeros that lose nothing (`"9.990"`) are accepted.' },
    { label: 'Rounding', note: 'The default mode is `halfExpand` (round half away from zero: 2.5 to 3, -2.5 to -3), what people call "round half up" and what `Intl` does by default. `halfEven` is banker\'s rounding. Rounding is implemented once on integers and verified against `Intl.NumberFormat` for all nine modes.' },
    { label: 'Order of rounding', note: 'Rounding each line and then summing is not the same as summing and then rounding. Decide which one the invoice means, state it, and use `allocate` when parts must add up to a total.' },
    { label: 'Limits', note: 'Inputs may have at most 4096 digits (a bigger one, or an exponent that would build one, throws a RangeError that says so). Amounts are bigint internally, so size is otherwise unbounded. The currency registry holds at most 64 custom currencies.' },
    { label: 'Defaults', note: '`divide` of decimals and `ratio` need a scale: 20 digits for `decimal.divide`, 10 for `ratio`, both overridable. `divide(Money, n)` rounds to the currency\'s digits.' },
    { label: 'Formatting', note: 'This package formats nothing. `formatCurrency(m)` from `@pyreon/format` takes a Money directly and formats the amount string exactly, with the Money\'s own digits. Never `formatCurrency(Number(m.amount), ...)`: a large amount loses precision as a number.' },
  ],
  since: '0.53.0',
})
