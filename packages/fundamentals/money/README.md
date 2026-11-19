# @pyreon/money

> **Status: Experimental.** Outside the semver promise: the API may change in a minor release. See the [stability policy](https://pyreon.dev/docs/stability-and-direction).

Exact amounts of money as plain data. A `Money` is `{ amount: "9.99", currency: "EUR" }`: JSON-safe, comparable field by field, and never computed in binary floating point (all arithmetic is on `bigint` scaled integers).

> Zero dependencies. It formats nothing; `@pyreon/format` displays a Money.

## Install

```bash
bun add @pyreon/money
```

Entries: `@pyreon/money`, `@pyreon/money/decimal` (exact decimal-string math), `@pyreon/money/fp` (value-last forms).

## Quick start

```ts
import { add, allocate, money, multiply, round } from '@pyreon/money'

add(money('0.10', 'EUR'), money('0.20', 'EUR')) // { amount: '0.30', currency: 'EUR' }
multiply(money('19.99', 'EUR'), 3) // { amount: '59.97', currency: 'EUR' }
allocate(money('100.00', 'EUR'), [1, 1, 1]).map((p) => p.amount) // ['33.34', '33.33', '33.33']
round(money('1.23', 'CHF'), { increment: '0.05' }) // { amount: '1.25', currency: 'CHF' }

money(0.1 + 0.2, 'EUR') // throws: that is floating-point noise, not an amount
```

| Area | Functions |
| --- | --- |
| Build and check | `money`, `fromMinor`, `toMinor`, `toMinorNumber`, `isMoney`, `zero` |
| Arithmetic | `add`, `subtract`, `negate`, `abs`, `sum`, `multiply`, `divide`, `percentage`, `ratio` |
| Sharing | `allocate`, `split` |
| Compare | `compare`, `equals`, `min`, `max`, `isZero`, `isPositive`, `isNegative` |
| Rounding and conversion | `round` (nine `Intl` modes, cash-rounding increments), `convert` |
| Currencies | `currencyDigits`, `isCurrency`, `defineCurrency` |

The default rounding mode is `halfExpand` (round half away from zero); `halfEven` is banker's rounding. Rounding is verified against `Intl.NumberFormat` for all nine modes, arithmetic against an independent rational reference, and `allocate` by property tests.

Full guide with recipes: [docs/money](https://pyreon.dev/docs/money).
