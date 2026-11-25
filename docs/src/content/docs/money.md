---
title: Money
description: Exact amounts of money as plain data for Pyreon — decimal-string amounts, bigint math, nine rounding modes, allocation that never loses a cent
---

<PackageBadge name="@pyreon/money" href="/docs/money" />

`@pyreon/money` makes the right thing the easy thing for prices. A `Money` is plain data, `{ amount: "9.99", currency: "EUR" }`: it survives `JSON.stringify`, `structuredClone`, URL state, storage and a server round trip unchanged, compares field by field, and is the shape most payment and banking APIs already send. All arithmetic runs on `bigint` scaled integers, never on binary floating point.

> **Experimental.** It has no dependencies and formats nothing: `@pyreon/format` displays a Money.

## Why `0.1 + 0.2 !== 0.3`

JavaScript numbers are binary floating point. `0.1` has no exact binary form, so `0.1 + 0.2` is `0.30000000000000004`, `1.1 * 3` is `3.3000000000000003`, and `(1.005).toFixed(2)` is `"1.00"` because `1.005` is really `1.00499999999999989...`. Adding up a cart, taking 21% or splitting a bill in floats drifts by a cent, and the error is invisible until an invoice does not add up. This package never computes in floats: an amount is a decimal string, and every operation works on integers.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/money
```

```bash [bun]
bun add @pyreon/money
```

```bash [pnpm]
pnpm add @pyreon/money
```

```bash [yarn]
yarn add @pyreon/money
```

:::

Entries: `@pyreon/money`, `@pyreon/money/decimal` (exact decimal-string math) and `@pyreon/money/fp` (value-last forms).

## Quick start

```ts
// @check
import { add, allocate, money, multiply, round } from '@pyreon/money'

add(money('0.10', 'EUR'), money('0.20', 'EUR')) // { amount: '0.30', currency: 'EUR' }
multiply(money('19.99', 'EUR'), 3) // { amount: '59.97', currency: 'EUR' }
allocate(money('100.00', 'EUR'), [1, 1, 1]).map((p) => p.amount) // ['33.34', '33.33', '33.33']: the parts sum exactly
round(money('1.23', 'CHF'), { increment: '0.05' }) // { amount: '1.25', currency: 'CHF' }
```

The amount of every Money this package produces has exactly the currency's minor digits (`"9.90"`, `"100"` for JPY, `"0.123"` for KWD), so two equal amounts are the same string. Digits are ISO 4217 minor units (2 for EUR and HUF, 0 for JPY, 3 for KWD), the same on every engine: the package ships ISO 4217's own minor units, because `Intl` disagrees between engines (V8 reports CLDR display digits, 0 for HUF, IDR, COP and IQD, while JavaScriptCore reports ISO 4217), and a Money made on the server must be canonical in the browser. `defineCurrency('PTS', { digits: 0 })` adds a custom currency. When a payment provider counts an ISO currency in other units (ISK in hundredths), `defineCurrency('ISK', { digits: 2 })` at startup gives it those digits everywhere; a code is defined once, and defining it again with different digits throws. The registry is per JavaScript realm: the server and the browser each have their own, so call `defineCurrency` in a module that BOTH the server entry and the client entry import (a shared `currencies.ts`), or a Money valid on one side is rejected on the other. Which codes exist is ISO 4217 list one (178 codes as amended on 2026-09-17), shipped with the package for the same reason: engines list different codes (`Intl.supportedValuesOf('currency')` has 162 in V8 and 307, including withdrawn ones, in JavaScriptCore). A withdrawn code such as `HRK`, for old records, is registered with `defineCurrency`.

## Building a Money, and the float-input rule

```ts
// @check
import { money } from '@pyreon/money'

money('9.99', 'EUR') // a string is exact
money(9.99, 'EUR') // a number is read by its shortest text: exactly 9.99, not the binary float near it
money(100, 'JPY') // { amount: '100', currency: 'JPY' }
money('9.990', 'EUR') // { amount: '9.99', ... }: trailing zeros that lose nothing are fine
money('9.995', 'EUR', { rounding: 'halfExpand' }) // { amount: '10.00', ... }: rounding is opt in
// money(0.1 + 0.2, 'EUR') throws: 0.30000000000000004 has more decimals than EUR has (2): that is floating-point noise
// money('9.995', 'EUR') throws too: it would lose value, so round it deliberately
```

A number or string with more decimals than the currency has throws a `[Pyreon]` error that explains floating point and shows the fix, instead of silently hiding the bug this package exists to prevent. Inputs may have at most 4096 digits.

`fromMinor(999, 'EUR')` builds from minor units (cents), `toMinor(m)` gives a `bigint` and `toMinorNumber(m)` a number (it throws beyond 2^53). `isMoney(x)` is the strict guard for data coming in: exactly the two fields, a known currency, a canonical amount.

## Arithmetic and rounding

`add`, `subtract`, `sum` (an empty list needs the currency), `multiply`, `divide`, `percentage`, `ratio`, `compare`, `equals`, `min`, `max`. Mixing currencies throws and names both codes. `multiply` and `divide` take a plain number, a decimal string or a bigint and round to the currency's digits; `divide` of an amount is rounded, so for exact splitting use `allocate`.

Rounding has nine modes, named as `Intl.NumberFormat`'s `roundingMode` names them: `ceil`, `floor`, `expand`, `trunc`, `halfCeil`, `halfFloor`, `halfExpand`, `halfTrunc`, `halfEven`. The default is `halfExpand` (round half away from zero: 2.5 to 3, -2.5 to -3), what people call "round half up" and what `Intl` does by default. `halfEven` is banker's rounding (2.5 to 2, 3.5 to 4). The implementation is checked against `Intl.NumberFormat` for random decimals in every mode.

```ts
// @check
import { money, multiply, round } from '@pyreon/money'

multiply(money('0.05', 'EUR'), '0.5') // 0.03  (0.025 rounds half away from zero)
multiply(money('0.05', 'EUR'), '0.5', { rounding: 'halfEven' }) // 0.02
round(money('12.34', 'EUR'), { digits: 0 }) // 12.00
```

## Allocation

`allocate(m, ratios)` shares an amount so the parts sum **exactly** to it. Each part is its floor share in minor units; the minor units left over go one each to the parts with the largest fractional remainders, ties to the first. A negative amount is shared by its absolute value and the parts take its sign. A ratio of zero gets zero; negative or all-zero ratios throw. Each part is within one minor unit of its exact share. `split(m, n)` is `allocate` with equal ratios.

## Recipes

Every snippet is run by the package's tests with the outputs shown.

**A cart total with a discount and VAT:**

```ts
// @check
import { add, money, multiply, percentage, subtract, sum } from '@pyreon/money'

const lines = [
  { price: money('19.99', 'EUR'), qty: 3 },
  { price: money('5.00', 'EUR'), qty: 1 },
]
const subtotal = sum(lines.map((l) => multiply(l.price, l.qty))) // 64.97
const discount = percentage(subtotal, 10) // 6.50 (6.497 rounded)
const net = subtract(subtotal, discount) // 58.47
const vat = percentage(net, 21) // 12.28
const total = add(net, vat) // 70.75
```

**Splitting a bill three ways without losing a cent:**

```ts
// @check
import { money, split, sum } from '@pyreon/money'

const shares = split(money('100.00', 'EUR'), 3) // ['33.34', '33.33', '33.33']
sum(shares).amount // '100.00'
```

**Invoice lines that add up, and why the order of rounding matters.** Rounding each line and then summing is not the same as summing and then rounding: three lines of 9.99 with 21% VAT give 2.10 each, 6.30 in total, while 21% of the 29.97 total is 6.29. Decide which one the invoice means. To print per-line VAT that adds up to the VAT on the total, share that VAT across the lines by their net amounts:

```ts
// @check
import { allocate, money, percentage, sum } from '@pyreon/money'

const nets = [money('9.99', 'EUR'), money('9.99', 'EUR'), money('9.99', 'EUR')]
const vatOnTotal = percentage(sum(nets), 21) // 6.29
const vatLines = allocate(vatOnTotal, nets.map((n) => n.amount)) // ['2.10', '2.10', '2.09']: sums to 6.29
```

**Cash rounding to 0.05** (CHF has no coins below five rappen):

```ts
// @check
import { money, round } from '@pyreon/money'

round(money('12.34', 'CHF'), { increment: '0.05' }) // 12.35
round(money('12.32', 'CHF'), { increment: '0.05' }) // 12.30
```

**Converting with a rate and keeping the audit trail.** Give the rate as a decimal string and store it with the result:

```ts
// @check
import { convert, money } from '@pyreon/money'

const from = money('100.00', 'EUR')
const rate = '1.0842'
const record = { from, to: convert(from, 'USD', rate), rate } // to: { amount: '108.42', currency: 'USD' }
```

**Stripe-style minor units in and out:**

```ts
// @check
import { fromMinor, multiply, toMinorNumber } from '@pyreon/money'

const charge = fromMinor(1999, 'EUR') // { amount: '19.99', currency: 'EUR' }
toMinorNumber(multiply(charge, 3)) // 5997: send this as `amount`
```

**Storing money in a form, the URL or JSON.** A Money is JSON as it stands; guard what comes back:

```ts
// @check
import { isMoney, money } from '@pyreon/money'

const stored = JSON.stringify({ price: money('9.99', 'EUR') }) // '{"price":{"amount":"9.99","currency":"EUR"}}'
const back = JSON.parse(stored) as { price: unknown }

if (isMoney(back.price)) back.price.amount // '9.99'
```

## Composing: `@pyreon/money/fp`

The value-last forms return plain `(m: Money) => Money` functions, so an operation can be built once, named and composed with any `pipe`. This package ships no `pipe` (it has no dependencies): use the one from `@pyreon/time/fp` (it composes functions into a function) or from `@pyreon/rx` (it takes the value first).

```ts
// @check
import { convert, multiply, round } from '@pyreon/money/fp'
import { money } from '@pyreon/money'
import { pipe } from '@pyreon/rx'
import { pipe as compose } from '@pyreon/time/fp'

const withVat = compose(multiply('1.21'), round())
withVat(money('10.00', 'EUR')) // { amount: '12.10', currency: 'EUR' }
pipe(money('100.00', 'EUR'), convert('USD', '1.0842'), round({ digits: 0 })) // { amount: '108.00', currency: 'USD' }
```

## Exact decimals: `@pyreon/money/decimal`

The decimal math is exposed because it is needed anyway: `add`, `subtract`, `multiply`, `divide(a, b, { scale, rounding })` (default scale 20), `compare`, `round`, `normalize` and `isDecimal` on canonical decimal strings, exact at any size.

```ts
// @check
import * as decimal from '@pyreon/money/decimal'

decimal.add('0.1', '0.2') // '0.3'
decimal.multiply('19.99', '3') // '59.97'
decimal.divide('1', '3', { scale: 4 }) // '0.3333'
decimal.round('2.5', { mode: 'halfEven' }) // '2'
```

## Coming from

| You write | Here |
| --- | --- |
| floats `0.1 + 0.2`, `1.1 * 3` | `add(money('0.10', 'EUR'), money('0.20', 'EUR'))`, `multiply(money('1.10', 'EUR'), 3)` |
| `(1.005).toFixed(2)`, `Math.round(x * 100) / 100` | `money('1.005', 'EUR', { rounding: 'halfExpand' })` (`'1.01'`, which `toFixed` gets wrong) |
| dinero.js `dinero({ amount: 1999, currency: EUR })` | `fromMinor(1999, 'EUR')` |
| dinero.js `add(a, b)`, `multiply(a, 3)`, `allocate(a, [1, 1, 1])` | `add(a, b)`, `multiply(a, 3)`, `allocate(a, [1, 1, 1])` |
| dinero.js `toDecimal(a)` | `a.amount` |
| currency.js `currency(1.1).add(2.2)` | `add(money('1.10', 'EUR'), money('2.20', 'EUR'))` |
| currency.js `currency(100).distribute(3)` | `split(money('100', 'EUR'), 3)` |
| big.js `new Big('0.1').plus('0.2')` | `decimal.add('0.1', '0.2')` |
| big.js `new Big(1).div(3).round(4)` | `decimal.divide('1', '3', { scale: 4 })` |
| decimal.js `x.toDecimalPlaces(2)` | `decimal.round(x, { digits: 2 })` |

## Showing a Money

This package formats nothing. `formatCurrency(m)` from `@pyreon/format` takes a Money directly: it formats the amount string exactly (no conversion to a number) and shows the Money's own digits, so a currency given other digits with `defineCurrency` displays them too, and a Money looks the same on every engine (a plain number with a code uses each engine's display digits, which differ for HUF and others). Avoid `formatCurrency(Number(m.amount), ...)`: a large amount loses precision as a number.

## API reference

The complete, generated reference is on the [@pyreon/money API reference](/docs/reference/money) page.
