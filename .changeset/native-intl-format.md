---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`Intl.DateTimeFormat`, `Intl.NumberFormat` and `toLocaleString` now work on iOS and Android.

`new Intl.DateTimeFormat(locale, options).format(ms)`, `new Intl.NumberFormat(locale, options).format(n)`, `n.toLocaleString(locale, options)` and `new Date(ms).toLocaleDateString / toLocaleTimeString / toLocaleString(…)` lower to new runtime formatters: `PyreonDateTimeFormat` and `PyreonNumberFormat`, built on Foundation on iOS and `android.icu` on Android. A formatter can be bound to a `const` (in a component or at module scope) or used inline. The locale, the time zone, the currency and the digit counts can be runtime values. On native a date is its epoch milliseconds, so `format` takes `Date.now()`, a number, or `new Date(ms)` written at the call.

Supported options: `dateStyle`, `timeStyle`, `timeZone`, `weekday`, `year`, `month`, `day`, `hour`, `minute`, `second`, `hour12`, `hourCycle` and `timeZoneName` for dates. For numbers: `style` (decimal, currency or percent), `currency`, `currencyDisplay` (symbol, code or name), `minimumFractionDigits`, `maximumFractionDigits`, `minimumIntegerDigits` and `useGrouping`. Component options become the same ICU skeleton V8 builds, so the native platform picks its pattern the way the web does. Numbers round half away from zero, as on the web. Every other option, `Intl` member and formatter method gets a named warning.

The output agrees with the web except where each platform's locale data differs. On iOS it matched Safari's `Intl` on all 350 cases of the differential table. A curated set of cases matches Chrome/Node exactly on both platforms.

`n.toLocaleString()` with no arguments used to emit a plain `String(n)` with a warning. It now formats with the device locale, as on the web.

`toLocaleString()` on a non-number follows the web too: a string is returned unchanged and a boolean becomes `"true"` / `"false"`. On an array or an object it gets a named warning rather than a number format.
