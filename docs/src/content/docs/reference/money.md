---
title: "@pyreon/money — API Reference"
description: "Exact amounts of money as plain data: decimal-string amounts, bigint math, nine rounding modes, allocation that never loses a cent"
---

> **Generated** from `money`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [money](/docs/money).

A Money is `{ amount: "9.99", currency: "EUR" }`: plain, JSON-safe, exact, with exactly the currency's minor digits so equal amounts are the same string. All arithmetic runs on bigint scaled integers, never on binary floats: `add`, `subtract`, `multiply`, `divide`, `percentage`, `allocate` (parts that sum exactly), `round` (nine `Intl` rounding modes and cash-rounding increments), `convert` with a rate. A `number` is accepted only when its shortest text fits the currency, so `money(0.1 + 0.2, "EUR")` throws and explains floating point instead of hiding the bug. Currency digits are ISO 4217 minor units (ISO 4217 list one is shipped, 178 codes and their minor units, so codes and digits agree on every engine; `Intl` is never asked); `defineCurrency` adds custom currencies or gives an ISO one the digits a payment provider uses. `@pyreon/money/decimal` exposes the exact decimal-string math, `@pyreon/money/fp` the value-last forms. Zero dependencies. It formats nothing: `formatCurrency(m)` from `@pyreon/format` displays a Money exactly.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

not lowered by PMTC yet: pure computation on strings and bigint, so it can become `shared` once Swift and Kotlin ports of the same functions exist (a Money is already how payment APIs send amounts); until then the compiler warns on import rather than miscompiling

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- A Money is plain data: &#123; amount: "9.99", currency: "EUR" &#125;, JSON-safe, comparable field by field
- Exact: bigint scaled-integer math, never a binary float; a float with floating-point noise throws and says how to fix it
- allocate and split: parts sum EXACTLY to the amount; remainder units go to the largest fractional parts, ties to the first
- Nine rounding modes named as Intl.NumberFormat roundingMode names, verified against Intl; cash rounding with increments
- ISO 4217 currency digits, identical on every engine (JPY 0, EUR 2, HUF 2, KWD 3), plus bounded defineCurrency for custom codes and provider overrides; minor-unit converters for Stripe-style APIs
- Exact decimal-string math in @pyreon/money/decimal; value-last forms in @pyreon/money/fp
- Zero dependencies; mixing currencies throws with both codes named

## Complete example

A full, end-to-end usage of the package:

```tsx
import { money, add, multiply, allocate, round } from '@pyreon/money'

add(money('0.10', 'EUR'), money('0.20', 'EUR'))      // => { amount: '0.30', currency: 'EUR' }
multiply(money('19.99', 'EUR'), 3)                  // => { amount: '59.97', currency: 'EUR' }
allocate(money('100.00', 'EUR'), [1, 1, 1]).map((p) => p.amount)   // => ['33.34', '33.33', '33.33']
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`money`](#money-function-experimental) | function | Build a Money. |
| [`fromMinor`](#fromminor-function-experimental) | function | A Money from minor units (cents), the Stripe style. |
| [`toMinor`](#tominor-function-experimental) | function | The amount in minor units as a bigint. |
| [`toMinorNumber`](#tominornumber-function-experimental) | function | The amount in minor units as a number; throws beyond the safe integer range and says to use `toMinor`. |
| [`isMoney`](#ismoney-function-experimental) | function | Strict guard: exactly the fields `amount` and `currency`, a known currency, a canonical amount with exactly that… |
| [`zero`](#zero-function-experimental) | function | Zero in a currency. |
| [`add`](#add-function-experimental) | function | Exact sum of two amounts of one currency. |
| [`subtract`](#subtract-function-experimental) | function | Exact difference `a - b`. |
| [`negate`](#negate-function-experimental) | function | The amount with the opposite sign; never produces a negative zero. |
| [`abs`](#abs-function-experimental) | function | The amount without its sign. |
| [`sum`](#sum-function-experimental) | function | The sum of a list of one currency. |
| [`multiply`](#multiply-function-experimental) | function | The amount times a plain number, rounded to the currency's digits (default `halfExpand`: round half away from zero). |
| [`divide`](#divide-function-experimental) | function | The amount divided by a plain number, rounded to the currency's digits. |
| [`allocate`](#allocate-function-experimental) | function | Share an amount by ratios so the parts sum EXACTLY to it. |
| [`split`](#split-function-experimental) | function | Split into equal parts that sum exactly to the amount; the first parts get the extra cent. |
| [`percentage`](#percentage-function-experimental) | function | `percent` percent of an amount, rounded to the currency's digits. |
| [`ratio`](#ratio-function-experimental) | function | `a / b` as a decimal string with trailing zeros removed, rounded to `scale` digits (default 10). |
| [`compare`](#compare-function-experimental) | function | Order two amounts of one currency (usable as an `Array#sort` comparator). |
| [`equals`](#equals-function-experimental) | function | Whether two amounts are equal; different currencies are not equal (this does not throw). |
| [`min`](#min-function-experimental) | function | The smallest amount. |
| [`max`](#max-function-experimental) | function | The largest amount. |
| [`isZero`](#iszero-function-experimental) | function | Whether the amount is zero. |
| [`isPositive`](#ispositive-function-experimental) | function | Whether the amount is above zero. |
| [`isNegative`](#isnegative-function-experimental) | function | Whether the amount is below zero. |
| [`round`](#round-function-experimental) | function | Round to fewer digits or to a multiple of an increment (cash rounding), by one of the nine modes named as… |
| [`convert`](#convert-function-experimental) | function | Convert with a rate (`1 unit of m.currency = rate units of to`), rounded to the target's digits. |
| [`currencyDigits`](#currencydigits-function-experimental) | function | The minor-unit digits of a currency: what `defineCurrency` gave it, else its ISO 4217 minor unit. |
| [`isCurrency`](#iscurrency-function-experimental) | function | Whether `code` is a current ISO 4217 code (list one as amended 2026-09-17, shipped: engines list different codes) or a… |
| [`defineCurrency`](#definecurrency-function-experimental) | function | Register a currency the platform does not know (crypto, points, a test currency), or give an ISO currency the digits… |
| [`Money`](#money-type-experimental) | type | Exact money as plain data. |
| [`Decimal`](#decimal-type-experimental) | type | Canonical decimal text: optional `-`, digits, optional `.` and digits; no exponent, no `+`, no leading zeros, never… |
| [`CurrencyCode`](#currencycode-type-experimental) | type | An ISO 4217 code (`"EUR"`) or a code registered with `defineCurrency`. |
| [`RoundingMode`](#roundingmode-type-experimental) | type | The nine rounding modes, named as `Intl.NumberFormat`'s `roundingMode` names them. |
| [`decimal.isDecimal`](#decimalisdecimal-function-experimental) | function | Whether `x` is a canonical decimal string: an optional `-`, digits with no leading zero, an optional `.` and digits; no… |
| [`decimal.normalize`](#decimalnormalize-function-experimental) | function | The canonical form of a decimal given as text (a leading `+`, `.5`, an exponent are accepted), a number (by its shortest… |
| [`decimal.add`](#decimaladd-function-experimental) | function | Exact sum of two decimals of any size. |
| [`decimal.subtract`](#decimalsubtract-function-experimental) | function | Exact difference. |
| [`decimal.multiply`](#decimalmultiply-function-experimental) | function | Exact product; the scale is the sum of the scales. |
| [`decimal.divide`](#decimaldivide-function-experimental) | function | The quotient rounded to `scale` digits (default 20) by `rounding` (default `halfExpand`). |
| [`decimal.compare`](#decimalcompare-function-experimental) | function | Compare two decimals by value (`"9.90"` equals `"9.9"`). |
| [`decimal.round`](#decimalround-function-experimental) | function | Round to `digits` fraction digits (default 0) or to a multiple of `increment`, by one of the nine `Intl` rounding modes… |
| [`fp.add`](#fpadd-function-experimental) | function | Value-last `add`. |
| [`fp.subtract`](#fpsubtract-function-experimental) | function | Value-last `subtract`. |
| [`fp.multiply`](#fpmultiply-function-experimental) | function | Value-last `multiply`: `multiply("1.21")` is a function you can name, map and compose. |
| [`fp.divide`](#fpdivide-function-experimental) | function | Value-last `divide`. |
| [`fp.percentage`](#fppercentage-function-experimental) | function | Value-last `percentage`. |
| [`fp.round`](#fpround-function-experimental) | function | Value-last `round`, including cash rounding. |
| [`fp.convert`](#fpconvert-function-experimental) | function | Value-last `convert`. |
| [`fp.allocate`](#fpallocate-function-experimental) | function | Value-last `allocate`. |
| [`fp.split`](#fpsplit-function-experimental) | function | Value-last `split`. |
| [`fp.equals`](#fpequals-function-experimental) | function | A predicate: true for an amount equal to `other`. |

## API

### `money` `function` — **experimental**

```ts
(amount: number | string | bigint, currency: CurrencyCode, options?: { rounding?: RoundingMode }) => Money
```

Build a Money. A string is exact; a number is read by its shortest round-trip text (`9.99` is exactly 9.99); a bigint is whole units. A number or string with more decimals than the currency has throws (floating-point noise such as `0.1 + 0.2` is explained) unless `rounding` is given; trailing zeros that lose nothing are fine. The result has exactly the currency's digits. Input is at most 4096 digits.

**Example**

```tsx
money(9.99, 'EUR')                        // => { amount: '9.99', currency: 'EUR' }
money('10', 'EUR')                        // => { amount: '10.00', currency: 'EUR' }
money(100, 'JPY')                         // => { amount: '100', currency: 'JPY' }
money('9.995', 'EUR', { rounding: 'halfExpand' })   // => { amount: '10.00', currency: 'EUR' }
```

**Common mistakes**

- Doing arithmetic on `number` prices and wrapping the result: `money(price * qty, "EUR")` is float arithmetic first. Keep amounts as Money and use `multiply`
- Passing `0.1 + 0.2`: it throws on purpose. Round deliberately with `{ rounding }`, or better, never compute in floats

**See also:** `fromMinor` · `add`

---

### `fromMinor` `function` — **experimental**

```ts
(units: number | bigint | string, currency: CurrencyCode) => Money
```

A Money from minor units (cents), the Stripe style. A number must be a safe integer; use a bigint or a digit string above 2^53.

**Example**

```tsx
fromMinor(999, 'EUR')                     // => { amount: '9.99', currency: 'EUR' }
fromMinor('123456789012345678901', 'EUR') // => { amount: '1234567890123456789.01', currency: 'EUR' }
```

**See also:** `toMinor`

---

### `toMinor` `function` — **experimental**

```ts
(m: Money) => bigint
```

The amount in minor units as a bigint.

**Example**

```tsx
toMinor(money('9.99', 'EUR'))             // => 999n
```

**See also:** `toMinorNumber` · `fromMinor`

---

### `toMinorNumber` `function` — **experimental**

```ts
(m: Money) => number
```

The amount in minor units as a number; throws beyond the safe integer range and says to use `toMinor`.

**Example**

```tsx
toMinorNumber(money('9.99', 'EUR'))       // => 999
```

---

### `isMoney` `function` — **experimental**

```ts
(x: unknown) => x is Money
```

Strict guard: exactly the fields `amount` and `currency`, a known currency, a canonical amount with exactly that currency's digits. Never throws. Use it at every boundary where data comes in.

**Example**

```tsx
isMoney({ amount: '9.99', currency: 'EUR' })   // => true
isMoney({ amount: '9.9', currency: 'EUR' })    // => false
isMoney({ amount: 9.99, currency: 'EUR' })     // => false
```

---

### `zero` `function` — **experimental**

```ts
(currency: CurrencyCode) => Money
```

Zero in a currency.

**Example**

```tsx
zero('EUR')                               // => { amount: '0.00', currency: 'EUR' }
```

---

### `add` `function` — **experimental**

```ts
(a: Money, b: Money) => Money
```

Exact sum of two amounts of one currency. Mixing currencies throws and names both.

**Example**

```tsx
add(money('0.10', 'EUR'), money('0.20', 'EUR'))   // => { amount: '0.30', currency: 'EUR' }
```

**Common mistakes**

- Adding amounts of different currencies: it throws. Convert one side first with `convert`

**See also:** `sum` · `subtract`

---

### `subtract` `function` — **experimental**

```ts
(a: Money, b: Money) => Money
```

Exact difference `a - b`.

**Example**

```tsx
subtract(money('1.00', 'EUR'), money('0.01', 'EUR'))   // => { amount: '0.99', currency: 'EUR' }
```

---

### `negate` `function` — **experimental**

```ts
(m: Money) => Money
```

The amount with the opposite sign; never produces a negative zero.

**Example**

```tsx
negate(money('5', 'EUR'))                 // => { amount: '-5.00', currency: 'EUR' }
```

---

### `abs` `function` — **experimental**

```ts
(m: Money) => Money
```

The amount without its sign.

**Example**

```tsx
abs(money('-5', 'EUR'))                  // => { amount: '5.00', currency: 'EUR' }
```

---

### `sum` `function` — **experimental**

```ts
(list: Iterable<Money>, currency?: CurrencyCode) => Money
```

The sum of a list of one currency. An empty list needs `currency`.

**Example**

```tsx
sum([money('1.10', 'EUR'), money('2.20', 'EUR')])   // => { amount: '3.30', currency: 'EUR' }
sum([], 'EUR')                            // => { amount: '0.00', currency: 'EUR' }
```

**Common mistakes**

- Summing rounded parts and expecting the rounded total: round once at the end, or allocate

---

### `multiply` `function` — **experimental**

```ts
(m: Money, factor: number | string | bigint, options?: { rounding?: RoundingMode }) => Money
```

The amount times a plain number, rounded to the currency's digits (default `halfExpand`: round half away from zero). Prefer a string factor; a number is read by its shortest text.

**Example**

```tsx
multiply(money('19.99', 'EUR'), 3)        // => { amount: '59.97', currency: 'EUR' }
multiply(money('10.00', 'EUR'), '1.21')   // => { amount: '12.10', currency: 'EUR' }
multiply(money('0.05', 'EUR'), '0.5', { rounding: 'halfEven' })   // => { amount: '0.02', currency: 'EUR' }
```

**See also:** `percentage` · `allocate`

---

### `divide` `function` — **experimental**

```ts
(m: Money, divisor: number | string | bigint, options?: { rounding?: RoundingMode }) => Money
```

The amount divided by a plain number, rounded to the currency's digits. A zero divisor throws. To split without losing a cent use `allocate`: dividing three ways and multiplying back does not give the amount.

**Example**

```tsx
divide(money('10.00', 'EUR'), 3)          // => { amount: '3.33', currency: 'EUR' }
```

**See also:** `allocate` · `split`

---

### `allocate` `function` — **experimental**

```ts
(m: Money, ratios: readonly (number | string)[]) => Money[]
```

Share an amount by ratios so the parts sum EXACTLY to it. Each part is its floor share in minor units; the minor units left over go one each to the parts with the largest fractional remainders, ties to the first. A negative amount is shared by its absolute value and the parts take its sign. A ratio of zero gets zero; negative or all-zero ratios throw. Each part is within one minor unit of its exact share.

**Example**

```tsx
allocate(money('100.00', 'EUR'), [1, 1, 1]).map((p) => p.amount)   // => ['33.34', '33.33', '33.33']
allocate(money('0.05', 'EUR'), [3, 7]).map((p) => p.amount)         // => ['0.02', '0.03']
```

**See also:** `split`

---

### `split` `function` — **experimental**

```ts
(m: Money, parts: number) => Money[]
```

Split into equal parts that sum exactly to the amount; the first parts get the extra cent.

**Example**

```tsx
split(money('100.00', 'EUR'), 3).map((p) => p.amount)   // => ['33.34', '33.33', '33.33']
```

---

### `percentage` `function` — **experimental**

```ts
(m: Money, percent: number | string | bigint, options?: { rounding?: RoundingMode }) => Money
```

`percent` percent of an amount, rounded to the currency's digits. Over 100 and negative percentages work.

**Example**

```tsx
percentage(money('200.00', 'EUR'), 21)    // => { amount: '42.00', currency: 'EUR' }
```

---

### `ratio` `function` — **experimental**

```ts
(a: Money, b: Money, options?: { scale?: number; rounding?: RoundingMode }) => Decimal
```

`a / b` as a decimal string with trailing zeros removed, rounded to `scale` digits (default 10). Both amounts must be one currency; a zero `b` throws.

**Example**

```tsx
ratio(money('1.00', 'EUR'), money('4.00', 'EUR'))   // => '0.25'
ratio(money('1.00', 'EUR'), money('3.00', 'EUR'), { scale: 4 })   // => '0.3333'
```

---

### `compare` `function` — **experimental**

```ts
(a: Money, b: Money) => -1 | 0 | 1
```

Order two amounts of one currency (usable as an `Array#sort` comparator). Different currencies throw.

**Example**

```tsx
compare(money('1.00', 'EUR'), money('2.00', 'EUR'))   // => -1
```

---

### `equals` `function` — **experimental**

```ts
(a: Money, b: Money) => boolean
```

Whether two amounts are equal; different currencies are not equal (this does not throw).

**Example**

```tsx
equals(money('1.5', 'EUR'), money('1.50', 'EUR'))   // => true
equals(money('1', 'EUR'), money('1', 'USD'))        // => false
```

---

### `min` `function` — **experimental**

```ts
(...amounts: [Money, ...Money[]]) => Money
```

The smallest amount.

**Example**

```tsx
min(money('3', 'EUR'), money('2', 'EUR'))   // => { amount: '2.00', currency: 'EUR' }
```

---

### `max` `function` — **experimental**

```ts
(...amounts: [Money, ...Money[]]) => Money
```

The largest amount.

**Example**

```tsx
max(money('3', 'EUR'), money('2', 'EUR'))   // => { amount: '3.00', currency: 'EUR' }
```

---

### `isZero` `function` — **experimental**

```ts
(m: Money) => boolean
```

Whether the amount is zero.

**Example**

```tsx
isZero(zero('EUR'))                       // => true
```

---

### `isPositive` `function` — **experimental**

```ts
(m: Money) => boolean
```

Whether the amount is above zero.

**Example**

```tsx
isPositive(money('0.01', 'EUR'))          // => true
```

---

### `isNegative` `function` — **experimental**

```ts
(m: Money) => boolean
```

Whether the amount is below zero.

**Example**

```tsx
isNegative(money('-0.01', 'EUR'))         // => true
```

---

### `round` `function` — **experimental**

```ts
(m: Money, options?: { digits?: number; increment?: string | number; mode?: RoundingMode }) => Money
```

Round to fewer digits or to a multiple of an increment (cash rounding), by one of the nine modes named as `Intl.NumberFormat` names them: `ceil`, `floor`, `expand`, `trunc`, `halfCeil`, `halfFloor`, `halfExpand` (default, "round half up"), `halfTrunc`, `halfEven` (banker's rounding). `digits` and `increment` do not combine; an increment finer than the currency's minor unit throws. With no options it is the amount itself.

**Example**

```tsx
round(money('12.34', 'EUR'), { digits: 0 })                  // => { amount: '12.00', currency: 'EUR' }
round(money('1.23', 'CHF'), { increment: '0.05' })           // => { amount: '1.25', currency: 'CHF' }
round(money('2.50', 'EUR'), { digits: 0, mode: 'halfEven' }) // => { amount: '2.00', currency: 'EUR' }
```

**Common mistakes**

- `toFixed(2)` as rounding: it works on the binary float, so `(1.005).toFixed(2)` is "1.00". Use `money("1.005", "EUR", { rounding: "halfExpand" })`

---

### `convert` `function` — **experimental**

```ts
(m: Money, to: CurrencyCode, rate: number | string | bigint, options?: { rounding?: RoundingMode }) => Money
```

Convert with a rate (`1 unit of m.currency = rate units of to`), rounded to the target's digits. Give the rate as a decimal string. Keep `{ from, to, rate }` next to the result: it is the audit trail.

**Example**

```tsx
convert(money('100.00', 'EUR'), 'USD', '1.0842')   // => { amount: '108.42', currency: 'USD' }
convert(money('100.00', 'EUR'), 'JPY', '162.5')     // => { amount: '16250', currency: 'JPY' }
```

---

### `currencyDigits` `function` — **experimental**

```ts
(code: CurrencyCode) => number
```

The minor-unit digits of a currency: what `defineCurrency` gave it, else its ISO 4217 minor unit. The same on every engine (`Intl` is never asked for digits: V8 reports CLDR display digits, 0 for HUF, IDR, COP, IQD and others, while JavaScriptCore reports ISO 4217).

**Example**

```tsx
currencyDigits('EUR')                     // => 2
currencyDigits('JPY')                     // => 0
currencyDigits('KWD')                     // => 3
currencyDigits('HUF')                     // => 2
```

---

### `isCurrency` `function` — **experimental**

```ts
(code: string) => boolean
```

Whether `code` is a current ISO 4217 code (list one as amended 2026-09-17, shipped: engines list different codes) or a registered one. Never throws.

**Example**

```tsx
isCurrency('EUR')                         // => true
isCurrency('eur')                         // => false
```

---

### `defineCurrency` `function` — **experimental**

```ts
(code: string, spec: { digits: number }) => void
```

Register a currency the platform does not know (crypto, points, a test currency), or give an ISO currency the digits your payment provider uses (ISK in hundredths). The code is 2 to 12 upper-case letters or digits starting with a letter. A code is defined once, at startup, in a module both the server and client entries import (each realm has its own registry): the same digits again is fine, different digits throw. At most 64 are registered.

**Example**

```tsx
defineCurrency('PTS', { digits: 0 })
currencyDigits('PTS')                     // => 0
defineCurrency('ISK', { digits: 2 })
fromMinor(12345, 'ISK')                   // => { amount: '123.45', currency: 'ISK' }
```

---

### `Money` `type` — **experimental**

```ts
interface Money { readonly amount: string; readonly currency: CurrencyCode }
```

Exact money as plain data. The amount is canonical decimal text with exactly the currency's digits. A Money is structurally the `{ amount, currency }` shape payment APIs and `@pyreon/format` use.

**Example**

```tsx
const price: Money = { amount: '9.99', currency: 'EUR' }
```

---

### `Decimal` `type` — **experimental**

```ts
type Decimal = string
```

Canonical decimal text: optional `-`, digits, optional `.` and digits; no exponent, no `+`, no leading zeros, never `-0`.

**Example**

```tsx
const d: Decimal = '9.90'
```

---

### `CurrencyCode` `type` — **experimental**

```ts
type CurrencyCode = string
```

An ISO 4217 code (`"EUR"`) or a code registered with `defineCurrency`.

**Example**

```tsx
const c: CurrencyCode = 'EUR'
```

---

### `RoundingMode` `type` — **experimental**

```ts
type RoundingMode = 'ceil' | 'floor' | 'expand' | 'trunc' | 'halfCeil' | 'halfFloor' | 'halfExpand' | 'halfTrunc' | 'halfEven'
```

The nine rounding modes, named as `Intl.NumberFormat`'s `roundingMode` names them. The default is `halfExpand`.

**Example**

```tsx
const mode: RoundingMode = 'halfEven'
```

---

### `decimal.isDecimal` `function` — **experimental**

```ts
(x: unknown) => x is Decimal
```

Whether `x` is a canonical decimal string: an optional `-`, digits with no leading zero, an optional `.` and digits; no `+`, no exponent, never `-0`. Never throws.

**Example**

```tsx
import { isDecimal } from '@pyreon/money/decimal'
isDecimal('9.90')   // => true
isDecimal('.5')     // => false
isDecimal('1e3')    // => false
```

**See also:** `normalize`

---

### `decimal.normalize` `function` — **experimental**

```ts
(value: number | string | bigint) => Decimal
```

The canonical form of a decimal given as text (a leading `+`, `.5`, an exponent are accepted), a number (by its shortest text) or a bigint. The scale is kept: `"1.50"` stays `"1.50"`. At most 4096 digits.

**Example**

```tsx
import { normalize } from '@pyreon/money/decimal'
normalize('+.5')      // => '0.5'
normalize('1.5e2')    // => '150'
normalize('-0.00')    // => '0.00'
```

**See also:** `normalize`

---

### `decimal.add` `function` — **experimental**

```ts
(a, b) => Decimal
```

Exact sum of two decimals of any size.

**Example**

```tsx
import { add } from '@pyreon/money/decimal'
add('0.1', '0.2')      // => '0.3'
```

**See also:** `normalize`

---

### `decimal.subtract` `function` — **experimental**

```ts
(a, b) => Decimal
```

Exact difference.

**Example**

```tsx
import { subtract } from '@pyreon/money/decimal'
subtract('0.3', '0.1') // => '0.2'
```

**See also:** `normalize`

---

### `decimal.multiply` `function` — **experimental**

```ts
(a, b) => Decimal
```

Exact product; the scale is the sum of the scales.

**Example**

```tsx
import { multiply } from '@pyreon/money/decimal'
multiply('19.99', '3') // => '59.97'
```

**See also:** `normalize`

---

### `decimal.divide` `function` — **experimental**

```ts
(a, b, options?: { scale?: number; rounding?: RoundingMode }) => Decimal
```

The quotient rounded to `scale` digits (default 20) by `rounding` (default `halfExpand`). A zero divisor throws.

**Example**

```tsx
import { divide } from '@pyreon/money/decimal'
divide('1', '3', { scale: 4 })  // => '0.3333'
```

**See also:** `normalize`

---

### `decimal.compare` `function` — **experimental**

```ts
(a, b) => -1 | 0 | 1
```

Compare two decimals by value (`"9.90"` equals `"9.9"`).

**Example**

```tsx
import { compare } from '@pyreon/money/decimal'
compare('9.90', '9.9')   // => 0
```

**See also:** `normalize`

---

### `decimal.round` `function` — **experimental**

```ts
(value, options?: { digits?: number; increment?: number | string; mode?: RoundingMode }) => Decimal
```

Round to `digits` fraction digits (default 0) or to a multiple of `increment`, by one of the nine `Intl` rounding modes (default `halfExpand`). The result has the target scale.

**Example**

```tsx
import { round } from '@pyreon/money/decimal'
round('2.5')                          // => '3'
round('2.5', { mode: 'halfEven' })     // => '2'
round('1.23', { increment: '0.05' })   // => '1.25'
```

**See also:** `normalize`

---

### `fp.add` `function` — **experimental**

```ts
(b: Money) => (m: Money) => Money
```

Value-last `add`.

**Example**

```tsx
import { add } from '@pyreon/money/fp'
add({ amount: '1.00', currency: 'EUR' })({ amount: '2.50', currency: 'EUR' })   // => { amount: '3.50', currency: 'EUR' }
```

---

### `fp.subtract` `function` — **experimental**

```ts
(b: Money) => (m: Money) => Money
```

Value-last `subtract`.

**Example**

```tsx
import { subtract } from '@pyreon/money/fp'
subtract({ amount: '1.00', currency: 'EUR' })({ amount: '2.50', currency: 'EUR' })   // => { amount: '1.50', currency: 'EUR' }
```

---

### `fp.multiply` `function` — **experimental**

```ts
(factor, options?) => (m: Money) => Money
```

Value-last `multiply`: `multiply("1.21")` is a function you can name, map and compose.

**Example**

```tsx
import { multiply } from '@pyreon/money/fp'
multiply('1.21')({ amount: '10.00', currency: 'EUR' })   // => { amount: '12.10', currency: 'EUR' }
```

---

### `fp.divide` `function` — **experimental**

```ts
(divisor, options?) => (m: Money) => Money
```

Value-last `divide`.

**Example**

```tsx
import { divide } from '@pyreon/money/fp'
divide(3)({ amount: '10.00', currency: 'EUR' })   // => { amount: '3.33', currency: 'EUR' }
```

---

### `fp.percentage` `function` — **experimental**

```ts
(percent, options?) => (m: Money) => Money
```

Value-last `percentage`.

**Example**

```tsx
import { percentage } from '@pyreon/money/fp'
percentage(21)({ amount: '200.00', currency: 'EUR' })   // => { amount: '42.00', currency: 'EUR' }
```

---

### `fp.round` `function` — **experimental**

```ts
(options?) => (m: Money) => Money
```

Value-last `round`, including cash rounding.

**Example**

```tsx
import { round } from '@pyreon/money/fp'
round({ increment: '0.05' })({ amount: '1.23', currency: 'CHF' })   // => { amount: '1.25', currency: 'CHF' }
```

---

### `fp.convert` `function` — **experimental**

```ts
(to, rate, options?) => (m: Money) => Money
```

Value-last `convert`.

**Example**

```tsx
import { convert } from '@pyreon/money/fp'
convert('USD', '1.0842')({ amount: '100.00', currency: 'EUR' })   // => { amount: '108.42', currency: 'USD' }
```

---

### `fp.allocate` `function` — **experimental**

```ts
(ratios) => (m: Money) => Money[]
```

Value-last `allocate`.

**Example**

```tsx
import { allocate } from '@pyreon/money/fp'
allocate([1, 1, 1])({ amount: '100.00', currency: 'EUR' }).map((p) => p.amount)   // => ['33.34', '33.33', '33.33']
```

---

### `fp.split` `function` — **experimental**

```ts
(parts) => (m: Money) => Money[]
```

Value-last `split`.

**Example**

```tsx
import { split } from '@pyreon/money/fp'
split(2)({ amount: '0.01', currency: 'EUR' }).map((p) => p.amount)   // => ['0.01', '0.00']
```

---

### `fp.equals` `function` — **experimental**

```ts
(other: Money) => (m: Money) => boolean
```

A predicate: true for an amount equal to `other`.

**Example**

```tsx
import { equals } from '@pyreon/money/fp'
equals({ amount: '1.00', currency: 'EUR' })({ amount: '1.00', currency: 'EUR' })   // => true
```

---

## Package-level notes

> **The float-input rule:** A `number` is read by its shortest round-trip text, so `money(9.99, "EUR")` is exactly 9.99. A number (or string) with more decimals than the currency has throws unless `rounding` is given: `money(0.1 + 0.2, "EUR")` is `0.30000000000000004`, which is floating-point noise, not an amount. Trailing zeros that lose nothing (`"9.990"`) are accepted.

> **Rounding:** The default mode is `halfExpand` (round half away from zero: 2.5 to 3, -2.5 to -3), what people call "round half up" and what `Intl` does by default. `halfEven` is banker's rounding. Rounding is implemented once on integers and verified against `Intl.NumberFormat` for all nine modes.

> **Order of rounding:** Rounding each line and then summing is not the same as summing and then rounding. Decide which one the invoice means, state it, and use `allocate` when parts must add up to a total.

> **Limits:** Inputs may have at most 4096 digits (a bigger one, or an exponent that would build one, throws a RangeError that says so). Amounts are bigint internally, so size is otherwise unbounded. The currency registry holds at most 64 custom currencies.

> **Defaults:** `divide` of decimals and `ratio` need a scale: 20 digits for `decimal.divide`, 10 for `ratio`, both overridable. `divide(Money, n)` rounds to the currency's digits.

> **Formatting:** This package formats nothing. `formatCurrency(m)` from `@pyreon/format` takes a Money directly and formats the amount string exactly, with the Money's own digits. Never `formatCurrency(Number(m.amount), ...)`: a large amount loses precision as a number.
