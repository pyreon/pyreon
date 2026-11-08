---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

JavaScript `Date` now works on iOS and Android. Before, `new Date(…)` was dropped with a warning, and every date method such as `d.getFullYear()` broke the native build.

On native, a date is its epoch milliseconds: a number, or NaN for an invalid date. That is already how `Date.now()` and the `Intl` formatters represent it, and a `Date`-typed field or parameter becomes a number. New runtime functions (`pyreonDateFrom`, `pyreonDateMake`, `pyreonDateGet`, `pyreonDateTimezoneOffset`, `pyreonDateISO`) support:

- `new Date(x)`, from milliseconds or an ISO date string;
- `new Date(y, m, d, h, mi, s, ms)`, in local time, with the web's roll-over;
- `Date.parse` and `Date.UTC`;
- the local and UTC getters;
- `getTime`, `getTimezoneOffset` and `toISOString`.

Each follows the web's conventions: a 0-based month, Sunday = 0, and the device's time zone. Parsing accepts only the ISO date format, so other strings that browsers guess at give NaN.
