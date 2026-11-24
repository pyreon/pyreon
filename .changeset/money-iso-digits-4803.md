---
'@pyreon/money': minor
---

Currencies are now ISO 4217 list one (178 codes as amended on 2026-09-17, shipped with the package) on every engine, with ISO 4217 minor units. Both used to come from `Intl`, which disagrees between engines: V8 (Node, Chrome) reports CLDR display digits (0 for HUF, IDR, COP, PKR, IQD and others) and lists 162 codes; JavaScriptCore (Bun, Safari) reports ISO 4217 digits and lists 307 codes, including withdrawn ones. So a Money made on the server could be invalid in the browser.

Breaking:
- On V8, `currencyDigits('HUF')` is now 2 (was 0) and `IQD` is 3 (was 0), so a stored HUF amount such as `"100"` must become `"100.00"`.
- Codes withdrawn from ISO 4217 are rejected on every engine: `BGN` (Bulgaria adopted the euro in 2026), `HRK`, `ANG`, `CUC`, `SLL`, `ZWL` and others. A stored Bulgarian `{ amount: "10.00", currency: "BGN" }` now fails `isMoney`, and `money('10.00', 'BGN')` throws. To keep reading old records, register the code at startup: `defineCurrency('BGN', { digits: 2 })`.
- `_currencyStats()` no longer reports `remembered`.

`defineCurrency` can now give an ISO currency the digits a payment provider uses (`defineCurrency('ISK', { digits: 2 })`). A code is still defined only once, and the call belongs in a module that both the server and client entries import, because each has its own registry.
