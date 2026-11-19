# @pyreon/money

## 0.54.0

### Minor Changes

- [#4738](https://github.com/pyreon/pyreon/pull/4738) [`e8fedbe`](https://github.com/pyreon/pyreon/commit/e8fedbe3ad940127ec9337b73ec9be1d2a3c9a04) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package `@pyreon/money` (Experimental): exact amounts of money as plain data, with zero dependencies.

  - **Values:** a `Money` is `{ amount: "9.99", currency: "EUR" }`, JSON-safe, with exactly the currency's minor digits, so equal amounts are the same string. `money`, `fromMinor`, `toMinor`, `toMinorNumber`, `isMoney`, `zero`. A `number` is read by its shortest text and a value with more decimals than the currency has throws (floating-point noise such as `0.1 + 0.2` is explained) unless `rounding` is given.
  - **Arithmetic on `bigint`, never on binary floats:** `add`, `subtract`, `sum`, `multiply`, `divide`, `percentage`, `ratio`, `compare`, `equals`, `min`, `max`; mixing currencies throws and names both.
  - **`allocate` and `split`:** parts that sum exactly to the amount, remainder units to the largest fractional parts, ties to the first.
  - **Rounding:** nine modes named as `Intl.NumberFormat`'s `roundingMode` names (default `halfExpand`, `halfEven` for banker's rounding), cash-rounding increments, verified against `Intl`.
  - **Currencies:** digits from the platform, bounded `defineCurrency`; `convert` with a rate.
  - **Entries:** `@pyreon/money/decimal` (exact decimal-string math) and `@pyreon/money/fp` (value-last forms that compose with any `pipe`).
