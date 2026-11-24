---
'@pyreon/money': minor
---

Currency digits are now ISO 4217 minor units on every engine. They came from `Intl`, which disagrees between engines: V8 (Node, Chrome) reports CLDR display digits (0 for HUF, IDR, COP, PKR, IQD and others), JavaScriptCore (Bun, Safari) ISO 4217's, so a Money made on the server was not canonical in the browser. Breaking: on V8, `currencyDigits('HUF')` is now 2 (was 0) and `IQD` 3 (was 0), and a stored HUF amount such as `"100"` must be `"100.00"`. `defineCurrency` can now give an ISO currency the digits a payment provider uses (`defineCurrency('ISK', { digits: 2 })`); a code is still defined once. `_currencyStats()` no longer reports `remembered`.
