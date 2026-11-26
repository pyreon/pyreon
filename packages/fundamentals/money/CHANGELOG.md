# @pyreon/money

## 0.55.0

### Minor Changes

- [#4813](https://github.com/pyreon/pyreon/pull/4813) [`1a039d7`](https://github.com/pyreon/pyreon/commit/1a039d7348c4dd441ecd5f25594328bf75e21fdb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Currencies are now ISO 4217 list one (178 codes as amended on 2026-09-17, shipped with the package) on every engine, with ISO 4217 minor units. Both used to come from `Intl`, which disagrees between engines: V8 (Node, Chrome) reports CLDR display digits (0 for HUF, IDR, COP, PKR, IQD and others) and lists 162 codes; JavaScriptCore (Bun, Safari) reports ISO 4217 digits and lists 307 codes, including withdrawn ones. So a Money made on the server could be invalid in the browser.

  Breaking:
  - On V8, `currencyDigits('HUF')` is now 2 (was 0) and `IQD` is 3 (was 0), so a stored HUF amount such as `"100"` must become `"100.00"`.
  - Codes withdrawn from ISO 4217 are rejected on every engine: `BGN` (Bulgaria adopted the euro in 2026), `HRK`, `ANG`, `CUC`, `SLL`, `ZWL` and others. A stored Bulgarian `{ amount: "10.00", currency: "BGN" }` now fails `isMoney`, and `money('10.00', 'BGN')` throws. To keep reading old records, register the code at startup: `defineCurrency('BGN', { digits: 2 })`.
  - `_currencyStats()` no longer reports `remembered`.

  `defineCurrency` can now give an ISO currency the digits a payment provider uses (`defineCurrency('ISK', { digits: 2 })`). A code is still defined only once, and the call belongs in a module that both the server and client entries import, because each has its own registry.

### Patch Changes

- [#4858](https://github.com/pyreon/pyreon/pull/4858) [`aee634a`](https://github.com/pyreon/pyreon/commit/aee634aac159f80ead617e32fe105b34b1b8cc9d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every published package declares the supported Node.js floor: `"engines": { "node": ">=22" }`. 73 packages declared no `engines`, 13 said `>= 22` and the seven `@pyreon/compiler-*` binaries still said `>=18`. Node.js 22 is the floor of the support matrix (Node.js 22+, Bun 1.3+, browsers at Baseline 2024, iOS 17+, Android minSdk 26+), now stated on the stability page and in SECURITY.md; the new `check-support-matrix` gate keeps every package, the native platform floors and both documents in agreement, so a new package cannot ship without the field.

  Upgrade: manual — run on Node.js 22 or later (or Bun 1.3 or later); npm warns on an older Node.js

## 0.54.0

### Minor Changes

- [#4738](https://github.com/pyreon/pyreon/pull/4738) [`e8fedbe`](https://github.com/pyreon/pyreon/commit/e8fedbe3ad940127ec9337b73ec9be1d2a3c9a04) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package `@pyreon/money` (Experimental): exact amounts of money as plain data, with zero dependencies.

  - **Values:** a `Money` is `{ amount: "9.99", currency: "EUR" }`, JSON-safe, with exactly the currency's minor digits, so equal amounts are the same string. `money`, `fromMinor`, `toMinor`, `toMinorNumber`, `isMoney`, `zero`. A `number` is read by its shortest text and a value with more decimals than the currency has throws (floating-point noise such as `0.1 + 0.2` is explained) unless `rounding` is given.
  - **Arithmetic on `bigint`, never on binary floats:** `add`, `subtract`, `sum`, `multiply`, `divide`, `percentage`, `ratio`, `compare`, `equals`, `min`, `max`; mixing currencies throws and names both.
  - **`allocate` and `split`:** parts that sum exactly to the amount, remainder units to the largest fractional parts, ties to the first.
  - **Rounding:** nine modes named as `Intl.NumberFormat`'s `roundingMode` names (default `halfExpand`, `halfEven` for banker's rounding), cash-rounding increments, verified against `Intl`.
  - **Currencies:** digits from the platform, bounded `defineCurrency`; `convert` with a rate.
  - **Entries:** `@pyreon/money/decimal` (exact decimal-string math) and `@pyreon/money/fp` (value-last forms that compose with any `pipe`).
