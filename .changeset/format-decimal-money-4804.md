---
'@pyreon/format': minor
---

Number formatters take decimal strings (`'12345678901234567.89'`) and format them exactly, at any precision, within the double range. A decimal string beyond about 1.8e308 gives the fallback, because every engine prints it as infinity. `NumberInput` now includes `string`; any string that is not a plain decimal still gives the fallback with a dev warning.

Ranges are exact on every engine. V8's own `formatRange` rounds string ends to doubles, so `Intl` lays out a range only when the nearest doubles print exactly like the ends (every amount up to about 15 significant digits). Beyond that, the two exact ends are joined by the locale's range separator, without merging a shared currency sign or suffix. Ends that are numbers, bigints and decimal strings are ordered exactly.

`formatCurrency(m, options?)` and `currencyFormatter(code)` take a Money (`{ amount, currency }`) and show it with its own digits, the same on every engine. A custom code such as `USDT` (2 to 12 upper-case letters or digits) is placed where the locale puts a currency code. It is always shown as the code, with 2 fraction digits for a plain value and the Money's own scale for a Money. An amount with more fraction digits than the engine supports gives the fallback with a dev warning instead of throwing.

The docs now explain that `formatDateRange` uses the locale's CLDR interval data (Czech numeric ranges repeat the year), and that a conversion with `convertTo` is binary-float arithmetic and therefore not exact. A test checks that `formatDateRange` matches `Intl.DateTimeFormat#formatRange` across locales.
