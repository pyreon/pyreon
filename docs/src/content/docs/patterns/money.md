---
title: "Money and prices"
summary: "Keep amounts as { amount, currency } with a decimal-string amount, do arithmetic with @pyreon/money, and split with allocate so no cent is lost."
seeAlso: [dates-and-times]
---

## The pattern

An amount of money is a decimal string plus a currency code, never a `number` you compute with. `@pyreon/money` does the arithmetic on integers, so the cart, the tax and the split are exact, and the value is plain JSON you can store, send and put in the URL.

```ts
import { allocate, money, multiply, percentage, sum } from '@pyreon/money'

const subtotal = sum([multiply(money('19.99', 'EUR'), 3), money('5.00', 'EUR')]) // 64.97
const vat = percentage(subtotal, 21) // 13.64: rounded to the cent, half away from zero
const shares = allocate(money('100.00', 'EUR'), [1, 1, 1]) // 33.34, 33.33, 33.33: the parts sum to 100.00
```

## Why

Binary floating point cannot represent most decimal fractions, so `0.1 + 0.2` is `0.30000000000000004` and a rounded float is rounded from the wrong value. A string amount and integer math have no such error. `money(0.1 + 0.2, "EUR")` throws on purpose and explains why, instead of hiding the bug.

## Anti-pattern

```ts
// BROKEN: float arithmetic on prices, toFixed as rounding, and parts that do not sum to the total
const total = items.reduce((s, i) => s + i.price * i.qty, 0) // drifts by a cent
const vat = (total * 0.21).toFixed(2) // "1.00" for 1.005: toFixed rounds the binary float
const share = (100 / 3).toFixed(2) // three shares of 33.33 lose a cent

// Correct
const exact = sum(items.map((i) => multiply(i.price, i.qty)))
const tax = percentage(exact, 21)
const parts = allocate(money('100.00', 'EUR'), [1, 1, 1])
```

Also: summing rounded parts and expecting the rounded total (round once at the end, or `allocate`), mixing currencies without `convert`, and formatting with `Number(m.amount)`, which loses precision for large amounts (format the amount string with `Intl`).

## Related

- `@pyreon/money` for the functions, and its docs page for recipes (cart totals, splitting a bill, invoice rounding, cash rounding, conversion, minor units).
