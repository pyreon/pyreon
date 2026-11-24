---
'@pyreon/format': minor
---

Number formatters take decimal strings (`'12345678901234567.89'`), formatted exactly at any size, and `formatCurrency(m, options?)` / `currencyFormatter(code)` take a Money (`{ amount, currency }`) and show it with its own digits. Ranges of decimal strings are ordered by value. `NumberInput` now includes `string`; any string that is not a plain decimal still gives the fallback with a dev warning. The `formatDateRange` docs now explain that ranges are the locale's CLDR interval data (Czech numeric ranges repeat the year), and a test locks parity with `Intl.DateTimeFormat#formatRange` across locales.
