---
title: "@pyreon/format — API Reference"
description: "Locale-aware formatting and parsing — numbers, currency, bytes, durations, lists, dates, relative time — as plain functions over Intl with bounded caches"
---

> **Generated** from `format`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [format](/docs/format).

Experimental. Plain functions over `Intl` for the things every app formats: numbers, currency, percent, compact numbers, units, bytes, durations, lists, dates, times, relative time and ranges, plus `parseNumber` / `parseDate` for user input. One function per operation, plain-data in and strings out, no classes. The same function works in effects and JSX (it reads the active locale and time zone, so the binding updates), in plain code, and on the server (request-scoped locale). Nullish input returns a `fallback`; invalid input returns it with a dev warning; a bad option throws a `[Pyreon]` error that says how to fix it. A date-only string is a calendar date and never shifts with the time zone. Every `Intl.*Format` is cached per (locale, options) in three bounded tiers (no options, preset string, options object by identity then by structural key), so formatting in a list or a binding costs one `format()`. Three entries: `@pyreon/format/core` (pure, no `@pyreon/*` import), `@pyreon/format` (reactive locale and zone, `defineFormats`) and `@pyreon/format/components` (`<Num>`, `<DateTime>`).

> **Peer dependencies:** `@pyreon/core`, `@pyreon/reactivity` — install alongside this package.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

formats through the platform's Intl; the PMTC native lowering of these calls is planned (the native compiler already lowers a core set of Intl number/date formatting) but not shipped, so native apps render it behind the Web escape hatch or format on the web side today

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- One plain function per operation — formatNumber, formatCurrency, formatPercent, formatCompact, formatUnit, formatBytes, formatDuration, formatList, formatDate, formatTime, formatDateTime, formatRelative, formatRelativeTo, formatDateRange, formatNumberRange — plus parseNumber and parseDate
- Reactive without ceremony: the reactive entry reads the active locale and time zone, so a formatter in an effect, computed or JSX binding updates on setLocale / setTimeZone / a provided accessor
- Relative time that updates itself: useRelativeTime and &lt;RelativeTime&gt; change the text at the moment it changes (the target's own minute and hour marks, local midnight), 200 labels share two timers, a threshold switches to an absolute date, and a server render starts no timer and hydrates cleanly with the ambient clock hand-over
- One locale, one time zone, one clock: they live in @pyreon/ambient and are shared with @pyreon/time (and @pyreon/i18n will feed them), so setLocale or setTimeZone from any package changes every formatted value
- Request-scoped on the server: provideLocale / provideTimeZone use the context stack, never module state, so concurrent requests never share a locale
- Calendar dates never shift: a date-only or offset-less string formats as that day / wall-clock time in every time zone
- Bounded three-tier Intl cache: no options, preset string, options object (identity, then structural key) — every table bounded, no JSON.stringify on the hot path
- Never throws on data: nullish returns the fallback, invalid returns it with a dev-only warning; programmer errors (unknown unit, bad option) throw [Pyreon] errors that say how to fix
- Unit conversion in its own entry, @pyreon/format/units (and /units/core, pure): convert, canConvert, unitDimension, measurementSystem, preferredUnit and a formatUnit that converts; exact definitions, one combined factor, nothing of it in the main entries
- Three tree-shakeable main entries: /core (no @pyreon import), the reactive entry, /components (&lt;Num&gt;, &lt;DateTime&gt;, &lt;RelativeTime&gt;)
- defineFormats names a format set with inferred keys and typed overrides; createFormatter gives a bound non-reactive set for servers and tests

## Complete example

A full, end-to-end usage of the package:

```tsx
// Plain functions: no setup, no instances. Output below is for the en-US locale.
formatNumber(1234567.891, { locale: 'en-US', maximumFractionDigits: 1 }) // → "1,234,567.9"
formatCurrency(9.99, 'EUR', { locale: 'en-US' }) // → "€9.99"
formatCompact(1_240_000, { locale: 'en-US' }) // → "1.2M"
formatBytes(1536, { locale: 'en-US' }) // → "1.5 kB"
formatDuration(3_905_000, { locale: 'en-US', style: 'digital' }) // → "1:05:05"
formatDate('2026-11-18', { locale: 'en-US' }) // → "Nov 18, 2026"
formatRelativeTo('2026-11-17', '2026-11-18', { locale: 'en-US' }) // → "yesterday"
formatList(['a', 'b', 'c'], { locale: 'en-US' }) // → "a, b, and c"
// The active locale is reactive: change it and every binding updates.
setLocale('de')
formatNumber(1234567.891) // → "1.234.567,891"
formatDate('2026-11-18', 'long') // → "18. November 2026"
setLocale('en-US')
// A formatter is a value: a plain (value) => string you can pass anywhere.
const price = currencyFormatter('EUR')
price(1234.5) // → "€1,234.50"
;[999, 1250].map(price.from((cents) => cents / 100)) // → ["€9.99","€12.50"]
price.with({ maximumFractionDigits: 0 })(9.99) // → "€10"
// A named format set (each key is a formatter):
const f = defineFormats({ price: { kind: 'currency', currency: 'EUR' }, priceShort: { extends: 'price', notation: 'compact' } })
f.price(1234.5) // → "€1,234.50"
f.priceShort(1234567) // → "€1.2M"
// Parsing is the inverse:
parseNumber('1 234,5', { locale: 'cs' }) // → 1234.5
parseDate('18. 11. 2026', { locale: 'cs' }) // → "2026-11-18"
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`formatNumber`](#formatnumber-function) | function | Format a number with `Intl.NumberFormat`. |
| [`formatCurrency`](#formatcurrency-function) | function | Format money: a number, bigint or decimal string with an ISO 4217 `currency` code, or a Money (`{ amount, currency }`,… |
| [`formatPercent`](#formatpercent-function) | function | Format a ratio as a percentage: `0.42` is `42%`. |
| [`formatCompact`](#formatcompact-function) | function | Compact notation: `1_240_000` is `1.2M`. |
| [`formatUnit`](#formatunit-function) | function | Format a measurement with a sanctioned `Intl` unit (`Unit` is a union of them, plus `<unit>-per-<unit>` compounds). |
| [`formatBytes`](#formatbytes-function) | function | Format a byte count, choosing the unit. |
| [`formatDuration`](#formatduration-function) | function | Format a duration given as `&#123; hours, minutes, ... |
| [`formatList`](#formatlist-function) | function | Join items the way the locale does: `and` (default), `or`, `unit`. |
| [`formatDate`](#formatdate-function) | function | Format the date part. |
| [`formatTime`](#formattime-function) | function | Format the time part. |
| [`formatDateTime`](#formatdatetime-function) | function | Format date and time together. |
| [`formatRelative`](#formatrelative-function) | function | Format a relative amount in a given unit: `(-3, 'day')` is `3 days ago`. |
| [`formatRelativeTo`](#formatrelativeto-function) | function | Describe `target` relative to an explicit `base`. |
| [`formatDateRange`](#formatdaterange-function) | function | Format a range with the shared parts collapsed, by the locale's CLDR interval pattern… |
| [`formatNumberRange`](#formatnumberrange-function) | function | Format a numeric range with the shared parts collapsed. |
| [`formatNumberToParts`](#formatnumbertoparts-function) | function | The parts of a formatted number (for custom markup). |
| [`formatDateToParts`](#formatdatetoparts-function) | function | The parts of a formatted date and time (default: date and time, medium and short). |
| [`parseNumber`](#parsenumber-function) | function | Parse what a user typed or a formatter printed. |
| [`parseCurrency`](#parsecurrency-function) | function | Parse a money amount: the currency's symbol, narrow symbol, code or name as the locale writes it (read from `Intl`… |
| [`parseDate`](#parsedate-function) | function | Parse a date to `YYYY-MM-DD`. |
| [`createFormatter`](#createformatter-function) | function | A bound, NON-reactive set of one-off functions (`number`, `currency`, `percent`, `compact`, `unit`, `bytes`, `duration`,… |
| [`numberFormatter`](#numberformatter-function) | function | A reusable number formatter: a plain `(value) => string` that follows the active locale like `formatNumber`, with… |
| [`currencyFormatter`](#currencyformatter-function) | function | A reusable currency formatter. |
| [`percentFormatter`](#percentformatter-function) | function | A reusable percent formatter: `percentFormatter()(0.42)` is `42%`. |
| [`compactFormatter`](#compactformatter-function) | function | A reusable compact-notation formatter: `1_240_000` is `1.2M`. |
| [`unitFormatter`](#unitformatter-function) | function | A reusable unit formatter. |
| [`convert`](#convert-function) | function | Convert a number between two units `Intl` can format, from `@pyreon/format/units` (or `/units/core`: pure, no… |
| [`canConvert`](#canconvert-function) | function | Whether `convert(x, from, to)` is defined: both are convertible units of the same (or the inverse) dimension. |
| [`unitDimension`](#unitdimension-function) | function | What a unit measures: `length`, `mass`, `volume`, `temperature`, `area`, `duration`, `digital`, `angle`, `proportion`,… |
| [`measurementSystem`](#measurementsystem-function) | function | The measurement system of a locale's region, from CLDR's supplemental `measurementData`: `us` for US, Liberia and… |
| [`preferredUnit`](#preferredunit-function) | function | The unit a person in the locale's region reads for `unit`: `kilometer` is `mile` and `celsius` is `fahrenheit` in… |
| [`bytesFormatter`](#bytesformatter-function) | function | A reusable byte-size formatter (decimal, or `binary: true`). |
| [`durationFormatter`](#durationformatter-function) | function | A reusable duration formatter. |
| [`listFormatter`](#listformatter-function) | function | A reusable list formatter. |
| [`dateFormatter`](#dateformatter-function) | function | A reusable date formatter (the date part). |
| [`timeFormatter`](#timeformatter-function) | function | A reusable time formatter (the time part). |
| [`dateTimeFormatter`](#datetimeformatter-function) | function | A reusable date-and-time formatter. |
| [`relativeFormatter`](#relativeformatter-function) | function | A reusable relative-time formatter: the target is measured against `options.base`, a date-like value or an accessor… |
| [`defineFormats`](#defineformats-function) | function | Name a set of formats once: each key is a real `Formatter` (`f.price(9.99)`, `f.price.with(...)`, `f.price.from(...)`). |
| [`useRelativeTime`](#userelativetime-hook) | hook | A relative label that keeps itself current: an accessor returning `"3 minutes ago"`, updated by the shared clock of… |
| [`locale`](#locale-function) | function | Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one… |
| [`setLocale`](#setlocale-function) | function | Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one… |
| [`provideLocale`](#providelocale-function) | function | Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one… |
| [`timeZone`](#timezone-function) | function | Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one… |
| [`setTimeZone`](#settimezone-function) | function | Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one… |
| [`provideTimeZone`](#providetimezone-function) | function | Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one… |
| [`Num`](#num-component) | component | A formatted number as reactive text. |
| [`DateTime`](#datetime-component) | component | A `<time datetime="…">` element with the formatted value as text. |
| [`RelativeTime`](#relativetime-component) | component | A `<time>` that says how long ago (or how far ahead) a value is and keeps itself current. |
| [`ConvertedUnitOptions`](#convertedunitoptions-type) | type | Options of `formatUnit` and `unitFormatter` from `@pyreon/format/units`: everything in `UnitOptions`, plus a conversion… |
| [`MeasurementSystem`](#measurementsystem-type) | type | A system of measurement: `us` (US customary), `uk` (metric with road miles) or `metric`. |
| [`UnitDimension`](#unitdimension-type) | type | What `unitDimension` returns: a simple dimension, a named compound (`speed`, `pace`, `fuel-economy`, ...) or… |
| [`NumberInput`](#numberinput-type) | type | A number-like input: a number, a bigint, or a decimal string (an optional `-`, digits, an optional `.` and digits),… |
| [`MoneyLike`](#moneylike-type) | type | The structural shape of a `@pyreon/money` Money, which `formatCurrency` and `currencyFormatter` take. |
| [`DateInput`](#dateinput-type) | type | A date-like input. |
| [`PlainDateString`](#plaindatestring-type) | type | The `YYYY-MM-DD` string `parseDate` returns. |
| [`PlainTimeString`](#plaintimestring-type) | type | A time of day (`14:30`, `14:30:05`, `14:30:05.250`): a wall-clock value that never shifts with the zone. |
| [`Unit`](#unit-type) | type | `SimpleUnit` is the union of the units ECMA-262 sanctions (`Intl.supportedValuesOf('unit')`; a test keeps it equal to… |
| [`Duration`](#duration-type) | type | A duration as plain data. |
| [`Formatter`](#formatter-type) | type | A reusable formatter: a plain function plus `with(overrides)`, `from(map)`, `fallback(text)` and `options`. |
| [`FormatSpec`](#formatspec-type) | type | The shape `defineFormats` takes: a `kind` and the options of that formatter (`currency` is required for `currency`,… |

## API

### `formatNumber` `function`

```ts
(value: NumberInput, options?: NumberOptions | NumberPreset) => string
```

Format a number with `Intl.NumberFormat`. Options are the platform's `Intl.NumberFormat` options plus `locale` and `fallback`; a string is a preset (`integer`, `plain`, `compact`, `percent`). Nullish or `NaN` input returns the `fallback` (default `''`). The formatter is cached per (locale, options), so calling it in a list or a binding costs one `format()`. Differs from raw `Intl` in one default: `signDisplay` is `'negative'`, so `-0` and values that round to zero print `0`, never `-0` (every number-style formatter does this; pass `signDisplay: 'auto'` for the platform default).

**Example**

```tsx
formatNumber(1234567.891, { locale: 'en-US' }) // → "1,234,567.891"
formatNumber(1234567.891, { locale: 'de' }) // → "1.234.567,891"
formatNumber(0.5, { locale: 'en-US', style: 'percent' }) // → "50%"
formatNumber(1234.5678, { locale: 'en-US', maximumFractionDigits: 1 }) // → "1,234.6"
formatNumber(-0, { locale: 'en-US' }) // → "0"
formatNumber(-0.001, { locale: 'en-US', maximumFractionDigits: 2, signDisplay: 'auto' }) // → "-0"
formatNumber(null, { fallback: '-' }) // → "-"
```

**Common mistakes**

- Building the formatter yourself per call (`new Intl.NumberFormat(...)` in a render function, or `value.toLocaleString(...)` in a component): that is the cost this package caches, and `toLocaleString` captures the locale once instead of following the active one
- Mutating an options object after passing it: option objects are cached by identity, so treat a hoisted options object as immutable
- Expecting a preset string to carry a locale: a string has no `locale`; use the active locale or `createFormatter`

**See also:** `formatCurrency` · `formatPercent` · `formatCompact` · `defineFormats`

---

### `formatCurrency` `function`

```ts
(value: NumberInput, currency: string, options?: CurrencyOptions | CurrencyPreset) => string | (value: MoneyLike, options?: CurrencyOptions | CurrencyPreset) => string
```

Format money: a number, bigint or decimal string with an ISO 4217 `currency` code, or a Money (`{ amount, currency }`, what `@pyreon/money` produces) on its own. A decimal string or a Money amount is formatted exactly, at any size (never converted to a float); a Money shows its own digits, so a currency given other digits with `defineCurrency` displays them. A plain value with a code uses the engine's display digits for that currency (HUF: 0 in V8, 2 in JavaScriptCore), so format a Money when the digits must not depend on the engine. A custom code such as `USDT` (2 to 12 upper-case letters or digits) is placed where the locale puts a currency code, always shown as the code (whatever `currencyDisplay` says), with 2 fraction digits for a plain value and the Money's own scale for a Money. An amount with more than 100 fraction digits, or a malformed code or value, returns the `fallback` with a dev warning. Presets: `symbol`, `narrowSymbol`, `code`, `name`, `accounting`.

**Example**

```tsx
formatCurrency(9.99, 'EUR', { locale: 'en-US' }) // → "€9.99"
formatCurrency('12345678901234567.89', 'EUR', { locale: 'en-US' }) // → "€12,345,678,901,234,567.89"
formatCurrency({ amount: '9.99', currency: 'EUR' }, { locale: 'en-US' }) // → "€9.99"
formatCurrency({ amount: '1234.50', currency: 'USDT' }, { locale: 'de' }) // → "1.234,50 USDT"
formatCurrency(1234.5, 'EUR', { locale: 'de' }) // → "1.234,50 €"
formatCurrency(1234.5, 'CZK', { locale: 'cs' }) // → "1 234,50 Kč"
formatCurrency(-5, 'USD', { locale: 'en-US', currencySign: 'accounting' }) // → "($5.00)"
formatCurrency(5, 'USD', { locale: 'en-US', currencyDisplay: 'name' }) // → "5.00 US dollars"
```

**Common mistakes**

- Formatting an amount in minor units (cents) without dividing: `formatCurrency(999, 'EUR')` is 999 euros
- Passing the symbol (`'€'`) instead of the code (`'EUR'`)
- Formatting a Money as `formatCurrency(Number(m.amount), m.currency)`: a large amount loses precision; pass the Money (`formatCurrency(m)`)
- Passing a currency next to a Money (`formatCurrency(m, 'EUR')`): a Money carries its currency, and this throws

**See also:** `formatNumber` · `defineFormats` · `MoneyLike`

---

### `formatPercent` `function`

```ts
(value: NumberInput, options?: PercentOptions) => string
```

Format a ratio as a percentage: `0.42` is `42%`. Multiply nothing yourself.

**Example**

```tsx
formatPercent(0.42, { locale: 'en-US' }) // → "42%"
formatPercent(0.4234, { locale: 'en-US', maximumFractionDigits: 1 }) // → "42.3%"
formatPercent(0.42, { locale: 'de' }) // → "42 %"
```

**Common mistakes**

- Passing 42 for 42%: the value is a ratio (0.42)

**See also:** `formatNumber`

---

### `formatCompact` `function`

```ts
(value: NumberInput, options?: CompactOptions | CompactPreset) => string
```

Compact notation: `1_240_000` is `1.2M`. Presets `short` (default) and `long`.

**Example**

```tsx
formatCompact(1240000, { locale: 'en-US' }) // → "1.2M"
formatCompact(1240000, { locale: 'en-US', compactDisplay: 'long' }) // → "1.2 million"
formatCompact(999, { locale: 'en-US' }) // → "999"
formatCompact(1240000, { locale: 'de' }) // → "1,2 Mio."
```

**See also:** `formatNumber`

---

### `formatUnit` `function`

```ts
(value: NumberInput, unit: Unit, options?: UnitOptions | UnitPreset) => string
```

Format a measurement with a sanctioned `Intl` unit (`Unit` is a union of them, plus `<unit>-per-<unit>` compounds). `unitDisplay` is `short` by default. An unknown unit is a programmer error and throws a `[Pyreon]` error. `@pyreon/format/units` (and `/units/core`) export a `formatUnit` with a conversion in front: `{ convertTo: 'kilometer' }` converts, `{ system: 'auto' | 'metric' | 'us' | 'uk' }` shows the unit of the locale's system (`'auto'` follows the active locale), `convertTo` wins; the main entries never include the conversion table.

**Example**

```tsx
formatUnit(72, 'kilometer-per-hour', { locale: 'en-US' }) // → "72 km/h"
formatUnit(1.5, 'liter', { locale: 'en-US', unitDisplay: 'long' }) // → "1.5 liters"
formatUnit(21, 'celsius', { locale: 'de' }) // → "21 °C"
```

**Common mistakes**

- A unit that is not in `Intl.supportedValuesOf('unit')` (`kilometre`, `km`): it is a type error and throws at runtime

**See also:** `formatBytes` · `Unit` · `convert`

---

### `formatBytes` `function`

```ts
(bytes: NumberInput, options?: BytesOptions) => string
```

Format a byte count, choosing the unit. Decimal by default (1000 steps, SI units: `1536` is `1.5 kB`); `binary: true` uses 1024 steps and IEC symbols (`1.5 KiB`). Below a kilobyte the byte count is written with the symbol in the locale's own kilobyte pattern (`0 B`, `999 B`, `1,023 B`; number order, spacing and bidi marks come from Intl; locales that write short units as words, such as Arabic, keep Intl's word). `unitDisplay: 'long'` gives the plural-correct word (`999 bytes`). Rounding never produces `1000 kB` or `1024 KiB`: the value carries into the next unit. Above petabytes Intl has no unit: short and narrow display continue with EB, ZB, YB (derived from the locale's petabyte text by swapping its leading "P", so French reads `Eo`; a locale whose petabyte text does not start with "P", such as Russian, stops at petabytes) and binary continues with EiB, ZiB, YiB; `long` display stops at petabytes with grouping. One fraction digit by default (`maximumFractionDigits`).

**Example**

```tsx
formatBytes(1536, { locale: 'en-US' }) // → "1.5 kB"
formatBytes(0, { locale: 'en-US' }) // → "0 B"
formatBytes(999, { locale: 'en-US' }) // → "999 B"
formatBytes(1536, { locale: 'en-US', binary: true }) // → "1.5 KiB"
formatBytes(1023, { locale: 'en-US', binary: true }) // → "1,023 B"
formatBytes(999, { locale: 'en-US', unitDisplay: 'long' }) // → "999 bytes"
formatBytes(999999, { locale: 'en-US' }) // → "1 MB"
formatBytes(5_000_000_000, { locale: 'de' }) // → "5 GB"
formatBytes(1e21, { locale: 'en-US' }) // → "1 ZB"
```

**Common mistakes**

- Expecting `KB`: the SI symbol is `kB`; use `binary: true` for `KiB`
- Passing kilobytes: the input is bytes

**See also:** `formatUnit`

---

### `formatDuration` `function`

```ts
(value: Duration | number | null | undefined, options?: DurationOptions | DurationStyle) => string
```

Format a duration given as `{ hours, minutes, ... }` or as milliseconds. Styles `long`, `short` (default), `narrow` and `digital`. Human defaults: from one second on the smallest unit shown is seconds (rounded, with carry: 59,999 ms is `1 min`), milliseconds only below one second; `smallest` sets the finest unit (`'minute'` rounds 59 min 59.6 s to `1 hr`) and `largest: n` shows only the `n` most significant non-zero units (truncated). Fractional fields balance down (`{ hours: 1.5 }` is `1 hr, 30 min`). `digital` is `h:mm:ss`, minutes unpadded below an hour (`1:05`), with a fraction only when `smallest: 'millisecond'` or `fractionalDigits` ask for it. Uses `Intl.DurationFormat` for the word styles when the runtime has it and an equivalent fallback built from `Intl.NumberFormat` and `Intl.ListFormat` otherwise; the digital style is written here, so it is the same in every runtime.

**Example**

```tsx
formatDuration({ hours: 2, minutes: 5 }, { locale: 'en-US' }) // → "2 hr, 5 min"
formatDuration(3_905_000, { locale: 'en-US', style: 'digital' }) // → "1:05:05"
formatDuration(65_432, { locale: 'en-US', style: 'digital' }) // → "1:05"
formatDuration(59_999, { locale: 'en-US' }) // → "1 min"
formatDuration(1_500, { locale: 'en-US', smallest: 'millisecond' }) // → "1 sec, 500 ms"
formatDuration({ hours: 1.5 }, { locale: 'en-US' }) // → "1 hr, 30 min"
formatDuration(90_061_000, { locale: 'en-US', style: 'long' }) // → "1 day, 1 hour, 1 minute, 1 second"
formatDuration(90_061_000, { locale: 'en-US', largest: 2 }) // → "1 day, 1 hr"
formatDuration(0, { locale: 'en-US' }) // → "0 sec"
```

**Common mistakes**

- Expecting carries for a whole Duration field: `{ minutes: 90 }` prints `90 min`; only a millisecond number is broken down, and a round-up carries
- Passing seconds: a number is milliseconds

**See also:** `formatRelativeTo`

---

### `formatList` `function`

```ts
(items: Iterable<string> | null | undefined, options?: ListOptions | ListPreset) => string
```

Join items the way the locale does: `and` (default), `or`, `unit`. Any iterable; non-strings go through `String`, nullish entries are skipped, an empty list returns the `fallback`.

**Example**

```tsx
formatList(['red', 'green', 'blue'], { locale: 'en-US' }) // → "red, green, and blue"
formatList(['red', 'green', 'blue'], { locale: 'en-US', type: 'disjunction' }) // → "red, green, or blue"
formatList(['red', 'green', 'blue'], { locale: 'de' }) // → "red, green und blue"
formatList([], { fallback: 'none' }) // → "none"
```

**See also:** `formatNumber`

---

### `formatDate` `function`

```ts
(value: DateInput, options?: DateTimeOptions | DateStylePreset) => string
```

Format the date part. Default `dateStyle: 'medium'`; presets `short`, `medium`, `long`, `full`; or any `Intl.DateTimeFormat` options. A date-only string (`2026-11-18`) is a calendar date and shows that day in EVERY time zone; a `Z`/offset string, a number and a `Date` are instants shown in the active `timeZone`. An invalid `timeZone` (it often comes from profile data) warns once in dev and falls back to the active zone instead of throwing.

**Example**

```tsx
formatDate('2026-11-18', { locale: 'en-US' }) // → "Nov 18, 2026"
formatDate('2026-11-18', { locale: 'en-US', timeZone: 'Pacific/Kiritimati' }) // → "Nov 18, 2026"
formatDate('2026-11-18', { locale: 'cs', dateStyle: 'full' }) // → "středa 18. listopadu 2026"
formatDate('2026-11-18T23:30:00Z', { locale: 'en-US', timeZone: 'Asia/Tokyo' }) // → "Nov 19, 2026"
formatDate('2026-11-18', { locale: 'en-US', month: 'long', year: 'numeric' }) // → "November 2026"
formatDate(null, { fallback: 'unknown' }) // → "unknown"
```

**Common mistakes**

- Passing `new Date('2026-11-18')` for a calendar date: that is midnight UTC, an instant, and shows the 17th west of UTC. Pass the string
- Passing an unparseable string: it returns the fallback (with a dev warning), it never throws

**See also:** `formatTime` · `formatDateTime` · `DateInput`

---

### `formatTime` `function`

```ts
(value: DateInput | PlainTimeString, options?: DateTimeOptions | DateStylePreset) => string
```

Format the time part. Default `timeStyle: 'short'`. A date-time without an offset (`2026-11-18T14:30`) and a time of day (`14:30`, `14:30:05`, `14:30:05.250`) are wall-clock values and never shift. `formatTime` is the only date formatter that accepts a time of day; the others reject it with a message that says to use `formatTime`.

**Example**

```tsx
formatTime('2026-11-18T14:30', { locale: 'de' }) // → "14:30"
formatTime('14:30', { locale: 'en-US' }) // → "2:30 PM"
formatTime('14:30:05', { locale: 'en-US', timeStyle: 'medium' }) // → "2:30:05 PM"
formatTime('2026-11-18T14:30:00Z', { locale: 'en-GB', timeZone: 'Asia/Tokyo' }) // → "23:30"
```

**Common mistakes**

- Passing a time of day to `formatDate` or `formatDateTime`: there is no date to show, they return the fallback with a warning

**See also:** `formatDate` · `formatDateTime`

---

### `formatDateTime` `function`

```ts
(value: DateInput, options?: DateTimeOptions | DateStylePreset) => string
```

Format date and time together. Default `dateStyle: 'medium'` with `timeStyle: 'short'`.

**Example**

```tsx
formatDateTime('2026-11-18T14:30', { locale: 'de' }) // → "18.11.2026, 14:30"
formatDateTime('2026-11-18T14:30:00Z', { locale: 'ja', timeZone: 'Asia/Tokyo' }) // → "2026/11/18 23:30"
formatDateTime(Date.UTC(2026, 10, 18, 14, 30), { locale: 'de', timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) // → "18.11.26, 14:30"
```

**See also:** `formatDate` · `formatTime`

---

### `formatRelative` `function`

```ts
(value: number, unit: RelativeUnit, options?: RelativeOptions | RelativePreset) => string
```

Format a relative amount in a given unit: `(-3, 'day')` is `3 days ago`. `numeric: 'auto'` gives words (`yesterday`).

**Example**

```tsx
formatRelative(-3, 'day', { locale: 'en-US' }) // → "3 days ago"
formatRelative(-1, 'day', { locale: 'en-US', numeric: 'auto' }) // → "yesterday"
formatRelative(2, 'hour', { locale: 'de' }) // → "in 2 Stunden"
formatRelative(5, 'minute', { locale: 'en-US', style: 'narrow' }) // → "in 5m"
```

**Common mistakes**

- An unknown unit (`fortnight`) is a programmer error and throws

**See also:** `formatRelativeTo`

---

### `formatRelativeTo` `function`

```ts
(target: DateInput, base: DateInput, options?: RelativeOptions | RelativePreset) => string
```

Describe `target` relative to an explicit `base`. Under a minute it is seconds, under an hour minutes, under 24 hours hours (elapsed time, truncated toward zero, so 59 minutes 40 seconds is `59 minutes`). From 24 hours on the distance is counted by the CALENDAR in the zone (`timeZone`, else the active zone; calendar strings in UTC), so "yesterday", "tomorrow" and "last month" are literally true: under 7 calendar days it is days; then weeks (7-day blocks) while the distance is under 30 days or the calendar month is the same; then calendar months up to 11, then calendar years (`last year` is the previous calendar year). `numeric: 'auto'` by default. The base is explicit so the function stays pure; pass the current time yourself.

**Example**

```tsx
formatRelativeTo(Date.UTC(2026, 10, 18, 12, 5), Date.UTC(2026, 10, 18, 12, 0), { locale: 'en-US' }) // → "in 5 minutes"
formatRelativeTo('2026-11-17', '2026-11-18', { locale: 'en-US' }) // → "yesterday"
formatRelativeTo('2026-11-16T13:00:00Z', '2026-11-18T01:00:00Z', { locale: 'en-US', timeZone: 'UTC' }) // → "2 days ago"
formatRelativeTo('2026-10-05', '2026-11-18', { locale: 'en-US' }) // → "last month"
formatRelativeTo('2025-12-15', '2026-12-20', { locale: 'en-US' }) // → "last year"
formatRelativeTo('2026-12-25', '2026-11-18', { locale: 'en-US' }) // → "next month"
formatRelativeTo('2026-11-18', '2026-11-18', { locale: 'de' }) // → "heute"
```

**Common mistakes**

- Expecting it to read the clock: it does not. Pass `Date.now()` (or a clock signal) as `base`
- Expecting 36 hours to be "yesterday": from 24 hours on the calendar decides, so it depends on the time of day of the base

**See also:** `formatRelative` · `relativeFormatter`

---

### `formatDateRange` `function`

```ts
(start: DateInput, end: DateInput, options?: DateRangeOptions | DateStylePreset) => string
```

Format a range with the shared parts collapsed, by the locale's CLDR interval pattern (`Intl.DateTimeFormat#formatRange`; Pyreon joins no text itself). Two calendar strings are a range of calendar days in every zone. A reversed pair (a range picker mid-selection) is ordered first, so the earlier date always comes first; equal ends give the single value where Intl does. What is collapsed is locale data and differs between engines' CLDR versions: Czech numeric dates give `21.10.2026 – 27.10.2026` (no year collapse), while `dateStyle: 'long'` gives `21.–27. 10. 2026`.

**Example**

```tsx
formatDateRange('2026-11-12', '2026-11-15', { locale: 'en-US' }) // → "Nov 12 – 15, 2026"
formatDateRange('2026-11-15', '2026-11-12', { locale: 'en-US' }) // → "Nov 12 – 15, 2026"
formatDateRange('2026-11-28', '2026-12-02', { locale: 'en-US' }) // → "Nov 28 – Dec 2, 2026"
formatDateRange('2026-11-12', '2026-11-15', { locale: 'de' }) // → "12.–15.11.2026"
formatDateRange('2026-10-21', '2026-10-27', { locale: 'cs', dateStyle: 'long' }) // → "21.–27. 10. 2026"
```

**Common mistakes**

- Comparing a range with a typed literal: the text is the engine's CLDR data (thin spaces, and some locales such as sk and pl differ between V8 and JavaScriptCore); compare with `Intl`'s own `formatRange` output

**See also:** `formatDate`

---

### `formatNumberRange` `function`

```ts
(start: NumberInput, end: NumberInput, options?: NumberRangeOptions | NumberPreset) => string
```

Format a numeric range with the shared parts collapsed. A reversed pair is ordered first (`5, 3` reads `3–5`).

**Example**

```tsx
formatNumberRange(3, 5, { locale: 'en-US' }) // → "3–5"
formatNumberRange(5, 3, { locale: 'en-US' }) // → "3–5"
formatNumberRange(1000, 25000, { locale: 'en-US', style: 'currency', currency: 'EUR' }) // → "€1,000.00 – €25,000.00"
```

**See also:** `formatNumber`

---

### `formatNumberToParts` `function`

```ts
(value: NumberInput, options?: NumberOptions | NumberPreset) => Intl.NumberFormatPart[]
```

The parts of a formatted number (for custom markup). Nullish or invalid input returns `[]`.

**Example**

```tsx
formatNumberToParts(1234.5, { locale: 'en-US' }).map((p) => p.type) // → ["integer","group","integer","decimal","fraction"]
```

**See also:** `formatNumber`

---

### `formatDateToParts` `function`

```ts
(value: DateInput, options?: DateTimeOptions | DateStylePreset) => Intl.DateTimeFormatPart[]
```

The parts of a formatted date and time (default: date and time, medium and short). Nullish or invalid input returns `[]`.

**Example**

```tsx
formatDateToParts('2026-11-18', { locale: 'en-US', year: 'numeric', month: 'long', day: 'numeric' }).map((p) => p.value).join('|') // → "November| |18|, |2026"
```

**See also:** `formatDate`

---

### `parseNumber` `function`

```ts
(text: string, options?: { locale?: string }) => number | null
```

Parse what a user typed or a formatter printed. Accepts the locale's digits, decimal, group, minus and percent signs, plain / no-break / narrow no-break / thin spaces for space-grouped locales, and `'` for apostrophe-grouped ones. In a locale whose decimal separator is a comma and whose group separator is not a dot (Czech, French, Russian, Polish), a lone `.` is also accepted as the decimal separator (what a numpad types); the rule comes from `Intl` parts, and where the dot groups (German, Spanish, Italian, Dutch, Brazilian Portuguese) `1.234` stays 1234 and `1.5` is `null`. Returns `null` for anything else. Not parsed: scientific notation (`1e3`), compact notation (`1.2M`), currency symbols (use `parseCurrency`) and words.

**Example**

```tsx
parseNumber('1 234,5', { locale: 'cs' }) // → 1234.5
parseNumber('1234.5', { locale: 'cs' }) // → 1234.5
parseNumber('1.234', { locale: 'de' }) // → 1234
parseNumber('1.234,5', { locale: 'de' }) // → 1234.5
parseNumber('12,34,567.5', { locale: 'hi' }) // → 1234567.5
parseNumber('42 %', { locale: 'de' }) // → 0.42
parseNumber('twelve', { locale: 'en-US' }) // → null
parseNumber(formatNumber(-9876.54, { locale: 'fr' }), { locale: 'fr' }) // → -9876.54
```

**Common mistakes**

- Guessing the locale: parse with the locale the user typed in, `1.234` is 1234 in German and 1.234 in English

**See also:** `formatNumber` · `parseCurrency` · `parseDate`

---

### `parseCurrency` `function`

```ts
(text: string, currency: string, options?: { locale?: string }) => number | null
```

Parse a money amount: the currency's symbol, narrow symbol, code or name as the locale writes it (read from `Intl` parts), before or after the number, and accounting parentheses are removed, then the number is read as `parseNumber` does. A bare number is accepted. Another currency's symbol, extra text and anything else return `null`.

**Example**

```tsx
parseCurrency('€9.99', 'EUR', { locale: 'en-US' }) // → 9.99
parseCurrency('9,99 €', 'EUR', { locale: 'de' }) // → 9.99
parseCurrency('1 234,50 Kč', 'CZK', { locale: 'cs' }) // → 1234.5
parseCurrency('($5.00)', 'USD', { locale: 'en-US' }) // → -5
parseCurrency('9.99 euros', 'EUR', { locale: 'en-US' }) // → 9.99
parseCurrency('€9.99', 'USD', { locale: 'en-US' }) // → null
```

**Common mistakes**

- Passing the amount in minor units: the result is the amount as written (`9.99`), not cents

**See also:** `parseNumber` · `formatCurrency`

---

### `parseDate` `function`

```ts
(text: string, options?: { locale?: string }) => PlainDateString | null
```

Parse a date to `YYYY-MM-DD`. Reads NUMERIC dates in the locale's day / month / year order (any separators the locale uses, plus `. / - space`), ISO `YYYY-MM-DD` in any locale, and the locale's own medium and long forms with month names (`Nov 18, 2026`, `18. listopadu 2026`, `18 nov. 2026`, `2026年11月18日`): long and short names, with or without the trailing dot, case-insensitive, genitive forms included, from a per-locale table built from Intl on first use. Impossible dates return `null`. A two-digit year follows the POSIX rule: 00-68 is 2000-2068, 69-99 is 1969-1999. Buddhist and Minguo years are converted. Not parsed: weekday names, times, natural language ("next Friday"), and other non-Gregorian calendars.

**Example**

```tsx
parseDate('18. 11. 2026', { locale: 'cs' }) // → "2026-11-18"
parseDate('11/18/26', { locale: 'en-US' }) // → "2026-11-18"
parseDate('Nov 18, 2026', { locale: 'en-US' }) // → "2026-11-18"
parseDate('18. listopadu 2026', { locale: 'cs' }) // → "2026-11-18"
parseDate('18 nov. 2026', { locale: 'fr' }) // → "2026-11-18"
parseDate('31. 2. 2026', { locale: 'cs' }) // → null
parseDate('1/2/69', { locale: 'en-US' }) // → "1969-01-02"
parseDate('2026-11-18', { locale: 'de' }) // → "2026-11-18"
```

**Common mistakes**

- Expecting weekday names or times to parse: only the date is read
- Relying on a two-digit year outside 1969-2068

**See also:** `formatDate` · `parseNumber`

---

### `createFormatter` `function`

```ts
(base?: { locale?: string; timeZone?: string }) => BoundFormatters
```

A bound, NON-reactive set of one-off functions (`number`, `currency`, `percent`, `compact`, `unit`, `bytes`, `duration`, `list`, `date`, `time`, `dateTime`, `relative`, `relativeTo`, `dateRange`, `numberRange`, `numberToParts`, `dateToParts`, `parseNumber`, `parseDate`) for servers, scripts and tests. It never reads the active locale or zone. Per-call options still override the base. For reusable single-purpose formatters use the `*Formatter` factories.

**Example**

```tsx
const f = createFormatter({ locale: 'cs', timeZone: 'Europe/Prague' })
f.number(1234567.5) // → "1 234 567,5"
f.currency(99, 'CZK') // → "99,00 Kč"
f.date('2026-11-18', 'long') // → "18. listopadu 2026"
f.parseNumber('1 234,5') // → 1234.5
```

**Common mistakes**

- Using it in a component and expecting the app locale to apply: it is fixed on purpose; use the top-level functions

**See also:** `defineFormats` · `numberFormatter`

---

### `numberFormatter` `function`

```ts
(options?: NumberOptions | NumberPreset) => Formatter<NumberInput, 'number'>
```

A reusable number formatter: a plain `(value) => string` that follows the active locale like `formatNumber`, with `.with(overrides)`, `.from(map)`, `.fallback(text)`, `.parts(value)`, `.range(a, b)` and `.options`. Because it is just a function it drops into `Array#map`, a chart axis or a table column. The `Intl` formatter is looked up once per locale; a call is a string compare and one `format()`. Every `*Formatter` factory has this shape.

**Example**

```tsx
const n = numberFormatter({ locale: 'en-US', maximumFractionDigits: 1 })
n(1234.5678) // → "1,234.6"
;[1000, 2500.55].map(n) // → ["1,000","2,500.6"]
n.with({ maximumFractionDigits: 0 })(1234.5678) // → "1,235"
n.range(3, 5) // → "3–5"
n.parts(1.5).map((p) => p.type) // → ["integer","decimal","fraction"]
```

**Common mistakes**

- Creating a formatter per render to "configure" it: create it once at module level, then call it (creation is cheap and shares the cache, but a hoisted formatter is clearer)
- Mutating the options object you passed: a formatter freezes its own copy, so later mutation changes nothing; derive with `.with()`

**See also:** `formatNumber` · `currencyFormatter` · `defineFormats`

---

### `currencyFormatter` `function`

```ts
(currency: string, options?: CurrencyOptions | CurrencyPreset) => Formatter<CurrencyInput, 'currency'>
```

A reusable currency formatter. `price.with({ maximumFractionDigits: 0 })` derives a rounded one, `price.from((cents) => cents / 100)` adapts cents, `price.range(10, 20)` formats a range. It takes numbers, decimal strings and Money values in its currency (a Money in another currency is the fallback with a dev warning). A malformed code returns the fallback with a dev warning.

**Example**

```tsx
const price = currencyFormatter('EUR', { locale: 'en-US' })
price(9.99) // → "€9.99"
price.with({ maximumFractionDigits: 0 })(9.99) // → "€10"
price.from((cents) => cents / 100)(999) // → "€9.99"
;[999, 1250].map(price.from((cents) => cents / 100)) // → ["€9.99","€12.50"]
price.range(10, 20) // → "€10.00 – €20.00"
price.parts(9.99).map((p) => p.type) // → ["currency","integer","decimal","fraction"]
```

**Common mistakes**

- Building "€9.99 per month" by concatenation: the platform has no locale data for a currency "per" pattern; format the value and put it in a translated message
- Passing cents without `.from`: `price(999)` is nine hundred ninety-nine euros

**See also:** `formatCurrency` · `numberFormatter`

---

### `percentFormatter` `function`

```ts
(options?: PercentOptions) => Formatter<NumberInput, 'percent'>
```

A reusable percent formatter: `percentFormatter()(0.42)` is `42%`.

**Example**

```tsx
const pct = percentFormatter({ locale: 'en-US', maximumFractionDigits: 1 })
pct(0.4234) // → "42.3%"
```

**See also:** `formatPercent`

---

### `compactFormatter` `function`

```ts
(options?: CompactOptions | CompactPreset) => Formatter<NumberInput, 'compact'>
```

A reusable compact-notation formatter: `1_240_000` is `1.2M`.

**Example**

```tsx
const short = compactFormatter({ locale: 'en-US' })
short(1240000) // → "1.2M"
short.with({ compactDisplay: 'long' })(1240000) // → "1.2 million"
```

**See also:** `formatCompact`

---

### `unitFormatter` `function`

```ts
(unit: Unit, options?: UnitOptions | UnitPreset) => Formatter<NumberInput, 'unit'>
```

A reusable unit formatter. An unknown unit is a type error and throws a `[Pyreon]` error. `@pyreon/format/units` exports one that takes `{ convertTo, system }` as well (the converted value is formatted in the target unit, `system: 'auto'` follows the active locale, and `parts`, `range`, `with` and `from` work).

**Example**

```tsx
const speed = unitFormatter('kilometer-per-hour', { locale: 'en-US' })
speed(72) // → "72 km/h"
speed.with({ unitDisplay: 'long' })(72) // → "72 kilometers per hour"
```

**See also:** `formatUnit`

---

### `convert` `function`

```ts
(value: number, from: Unit, to: Unit) => number
```

Convert a number between two units `Intl` can format, from `@pyreon/format/units` (or `/units/core`: pure, no `@pyreon/*` import). Every factor is an EXACT definition (inch = 25.4 mm, pound = 0.45359237 kg, US gallon = 231 cubic inches, international acre = 4046.8564224 m2, kilobyte = 1000 bytes as in CLDR; sources cited in `convert.ts`) held as a rational and applied ONCE (one combined factor, never chained through an intermediate unit), so the result is as accurate as a multiply and a divide allow: `convert(5, 'mile', 'kilometer')` is exactly the double nearest 8.04672. Compound units (`-per-`) convert when their parts do. A compound and its inverse (`liter-per-kilometer` and `mile-per-gallon`, a pace and a speed) are reciprocals, not ratios, so the value is inverted (a zero is `Infinity`). Temperature is affine (celsius and fahrenheit only; kelvin is not an Intl unit). `gallon` and `fluid-ounce` are the US units (the imperial ones are not sanctioned by ECMA-402). `month` and `year` have no fixed length and throw. A dimension mismatch throws a `[Pyreon]` error naming both dimensions.

**Example**

```tsx
// import { convert } from '@pyreon/format/units'
convert(5, 'mile', 'kilometer') // → 8.04672
convert(100, 'celsius', 'fahrenheit') // → 212
convert(1, 'gallon', 'liter') // → 3.785411784
convert(36, 'kilometer-per-hour', 'meter-per-second') // → 10
convert(35, 'mile-per-gallon', 'liter-per-kilometer') * 100 // → 6.720416666666666
```

**Common mistakes**

- Treating `gallon` or `fluid-ounce` as imperial for `uk`: they are the US units (CLDR and ECMA-402); the imperial units are not convertible here
- Chaining conversions through an intermediate unit: `convert` applies one exact factor, so convert directly
- Converting `month` or `year`: they have no fixed length; use `@pyreon/time` for calendar arithmetic

**See also:** `canConvert` · `unitDimension` · `formatUnit`

---

### `canConvert` `function`

```ts
(from: Unit, to: Unit) => boolean
```

Whether `convert(x, from, to)` is defined: both are convertible units of the same (or the inverse) dimension. Never throws; an unknown unit, `month` and `year` are `false`.

**Example**

```tsx
// import { canConvert } from '@pyreon/format/units'
canConvert('mile', 'kilometer') // → true
canConvert('mile', 'kilogram') // → false
canConvert('month', 'day') // → false
```

**See also:** `convert` · `unitDimension`

---

### `unitDimension` `function`

```ts
(unit: Unit) => UnitDimension
```

What a unit measures: `length`, `mass`, `volume`, `temperature`, `area`, `duration`, `digital`, `angle`, `proportion`, or for a compound `speed`, `pace`, `fuel-economy`, `fuel-consumption`, `density`, `flow-rate`, `mass-flow`, `data-rate`, else `<a>-per-<b>`. An unknown unit throws.

**Example**

```tsx
// import { unitDimension } from '@pyreon/format/units'
unitDimension('mile') // → "length"
unitDimension('kilometer-per-hour') // → "speed"
unitDimension('mile-per-gallon') // → "fuel-economy"
```

**See also:** `convert` · `canConvert`

---

### `measurementSystem` `function`

```ts
(locale?: string) => 'metric' | 'us' | 'uk'
```

The measurement system of a locale's region, from CLDR's supplemental `measurementData`: `us` for US, Liberia and Myanmar, `uk` for Great Britain (metric, with miles and miles per hour on the road), `metric` everywhere else. A locale with no region is resolved by its likely region (`en` is `en-US`). An invalid tag is `metric`. In `@pyreon/format/units` the locale defaults to the ACTIVE locale (a reactive read); in `/units/core` to the runtime's.

**Example**

```tsx
// import { measurementSystem } from '@pyreon/format/units'
measurementSystem('en-US') // → "us"
measurementSystem('en-GB') // → "uk"
measurementSystem('cs') // → "metric"
```

**See also:** `preferredUnit`

---

### `preferredUnit` `function`

```ts
(unit: Unit, locale?: string) => Unit
```

The unit a person in the locale's region reads for `unit`: `kilometer` is `mile` and `celsius` is `fahrenheit` in `en-US`; `mile` is `kilometer` and `fahrenheit` is `celsius` in `cs`; in `en-GB` distances and speeds stay miles and the rest is metric. A unit with no counterpart (`second`, `byte`) comes back unchanged. The table is deliberately small and simplified from CLDR's unit preferences: it maps a unit to the same scale in the other system, not to a use case (a height in feet and inches, a road in miles).

**Example**

```tsx
// import { preferredUnit } from '@pyreon/format/units'
preferredUnit('kilometer', 'en-US') // → "mile"
preferredUnit('celsius', 'en-US') // → "fahrenheit"
preferredUnit('mile', 'cs') // → "kilometer"
```

**See also:** `measurementSystem` · `formatUnit`

---

### `bytesFormatter` `function`

```ts
(options?: BytesOptions) => Formatter<NumberInput, 'bytes'>
```

A reusable byte-size formatter (decimal, or `binary: true`). `parts` carries the IEC symbol for binary.

**Example**

```tsx
const size = bytesFormatter({ locale: 'en-US' })
size(1536) // → "1.5 kB"
size.with({ binary: true })(1536) // → "1.5 KiB"
;[1536, 5000000].map(size) // → ["1.5 kB","5 MB"]
```

**See also:** `formatBytes`

---

### `durationFormatter` `function`

```ts
(options?: DurationOptions | DurationStyle) => Formatter<DurationInput, 'duration'>
```

A reusable duration formatter. It has no `parts` or `range`: `Intl.DurationFormat` is not available everywhere and has no range.

**Example**

```tsx
const took = durationFormatter({ locale: 'en-US', style: 'narrow' })
took(3905000) // → "1h 5m 5s"
took.from((seconds) => seconds * 1000)(3905) // → "1h 5m 5s"
```

**See also:** `formatDuration`

---

### `listFormatter` `function`

```ts
(options?: ListOptions | ListPreset) => Formatter<ListInput, 'list'>
```

A reusable list formatter. Formatters compose through plain values: `listFormatter()(items.map(price))`.

**Example**

```tsx
const or = listFormatter({ locale: 'en-US', type: 'disjunction' })
or(['red', 'green', 'blue']) // → "red, green, or blue"
or.parts(['a', 'b']).map((p) => p.type) // → ["element","literal","element"]
```

**See also:** `formatList`

---

### `dateFormatter` `function`

```ts
(options?: DateTimeOptions | DateStylePreset) => Formatter<DateInput, 'date'>
```

A reusable date formatter (the date part). Calendar strings never shift with the zone; `range` collapses shared parts.

**Example**

```tsx
const day = dateFormatter({ locale: 'en-US', dateStyle: 'long' })
day('2026-11-18') // → "November 18, 2026"
day.range('2026-11-12', '2026-11-15') // → "November 12 – 15, 2026"
day.with({ dateStyle: 'short' })('2026-11-18') // → "11/18/26"
day.parts('2026-11-18').map((p) => p.type) // → ["month","literal","day","literal","year"]
```

**See also:** `formatDate` · `timeFormatter` · `dateTimeFormatter`

---

### `timeFormatter` `function`

```ts
(options?: DateTimeOptions | DateStylePreset) => Formatter<DateInput, 'time'>
```

A reusable time formatter (the time part).

**Example**

```tsx
const clock = timeFormatter({ locale: 'de', timeZone: 'UTC' })
clock('2026-11-18T14:30:00Z') // → "14:30"
```

**See also:** `formatTime`

---

### `dateTimeFormatter` `function`

```ts
(options?: DateTimeOptions | DateStylePreset) => Formatter<DateInput, 'dateTime'>
```

A reusable date-and-time formatter.

**Example**

```tsx
const stamp = dateTimeFormatter({ locale: 'de' })
stamp('2026-11-18T14:30') // → "18.11.2026, 14:30"
```

**See also:** `formatDateTime`

---

### `relativeFormatter` `function`

```ts
(options: RelativeFormatterOptions) => Formatter<DateInput, 'relative'>
```

A reusable relative-time formatter: the target is measured against `options.base`, a date-like value or an accessor (`base: () => now()` is tracked, so a clock signal keeps it current). In the reactive entry `base` may be omitted: it is then the ambient clock (`now()` of `@pyreon/ambient`, read on every call; it does not tick, so a label that updates itself is `useRelativeTime` or `<RelativeTime>`). `@pyreon/format/core` requires `base`. `numeric` defaults to `auto`. It has no `parts` or `range`.

**Example**

```tsx
const since = relativeFormatter({ locale: 'en-US', base: '2026-11-18' })
since('2026-11-17') // → "yesterday"
since('2026-11-25') // → "next week"
```

**Common mistakes**

- Omitting `base` in `@pyreon/format/core`: every call returns the fallback (dev warning). The reactive entry defaults it to the ambient clock
- Expecting a formatter call to update the text by itself: it reads the clock once per call; use `useRelativeTime` or `<RelativeTime>` for a label that keeps current

**See also:** `formatRelativeTo` · `useRelativeTime`

---

### `defineFormats` `function`

```ts
<const T extends Record<string, FormatSpec | ExtendedSpec<keyof T>>>(specs: T) => DefinedFormats<T>
```

Name a set of formats once: each key is a real `Formatter` (`f.price(9.99)`, `f.price.with(...)`, `f.price.from(...)`). `kind` selects the factory (`number`, `currency`, `percent`, `compact`, `unit`, `bytes`, `duration`, `list`, `date`, `time`, `dateTime`, `relative`); the rest are that formatter's options. A spec may extend another by name: `{ extends: 'price', notation: 'compact' }` inherits the kind and merges options. An unknown name or a cycle throws a `[Pyreon]` error at definition time, and the type rejects an unknown name. Entries take ONE argument (they are callbacks-safe); per-call overrides are `.with()`, hoisted.

**Example**

```tsx
const f = defineFormats({ price: { kind: 'currency', currency: 'EUR', locale: 'en-US' }, priceShort: { extends: 'price', notation: 'compact' }, size: { kind: 'bytes', locale: 'en-US' }, day: { kind: 'date', dateStyle: 'long', locale: 'en-US' } })
f.price(9.99) // → "€9.99"
f.priceShort(1234567) // → "€1.2M"
f.price.with({ currency: 'USD' })(9.99) // → "$9.99"
f.size(1536) // → "1.5 kB"
f.day('2026-11-18') // → "November 18, 2026"
```

**Common mistakes**

- Passing overrides as a second argument (`f.price(9.99, { currency: 'USD' })`): entries take one argument so `Array#map` cannot pass an index as options; derive with `.with()` and hoist it
- Defining the specs inside a component: define them once at module level

**See also:** `createFormatter` · `numberFormatter`

---

### `useRelativeTime` `hook`

```ts
(target: DateInput | (() => DateInput), options?: RelativeTimeOptions | (() => RelativeTimeOptions | undefined)) => () => string
```

A relative label that keeps itself current: an accessor returning `"3 minutes ago"`, updated by the shared clock of `@pyreon/ambient`. The text is `formatRelativeTo` against the clock, so it is calendar-true ("yesterday" in the time zone). It updates at the moment the text changes: each second under a minute, at the TARGET'S OWN minute and hour marks ("1 minute ago" appears when the target is one minute old, not at the next wall-clock minute), at local midnight once it counts days, when a future target comes within a day, and at the `threshold`. Every label shares one timer for those marks and one for seconds, so 200 labels cost two timers. `target` and `options` may be accessors (tracked). Options are `numeric` (`'auto'` by default), `style`, `locale`, `timeZone`, `fallback` and `threshold: { after, as? }`: once the target is `after` away (milliseconds or `{ seconds, minutes, hours, days, weeks }`, in either direction) the label is the date, formatted `as` (a date style or `Intl.DateTimeFormat` options, default `'medium'`). Call it in a component's setup and read the accessor in JSX. On a server it prints the request's clock (`provideClock`) and starts no timer; outside a component it is a plain reading.

**Example**

```tsx
const ago = useRelativeTime(Date.now() - 180_000, { locale: 'en-US' })
ago() // → "3 minutes ago"
const old = useRelativeTime('2020-01-05', { locale: 'en-US', timeZone: 'UTC', threshold: { after: { days: 7 }, as: 'medium' } })
old() // → "Jan 5, 2020"
```

**Common mistakes**

- Calling it in an event handler or a timer: it needs the component's scope to release its timer; call it in setup
- Using `formatRelativeTo(value, Date.now())` in JSX and expecting it to tick: that is one reading; the label only changes when something else re-renders it
- A date-only target such as `'2026-11-18'` is a DAY: it reads as today, tomorrow, yesterday or in 3 days in the display zone at any hour, never as hours (`2026-11-18` at 10:00 on the 18th is "today")

**See also:** `RelativeTime` · `formatRelativeTo` · `relativeFormatter`

---

### `locale` `function`

```ts
() => string
```

Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one value. The active locale (a reactive read). Resolution order: an explicit `options.locale`, the nearest `provideLocale`, the app default set by `setLocale`, then `navigator.language` on the client or the runtime default on the server.

**Example**

```tsx
setLocale('cs')
locale() // → "cs"
formatNumber(1234.5) // → "1 234,5"
```

**Common mistakes**

- Reading it in an event handler and expecting a `provideLocale` from the component tree: context is only visible inside the component's setup and its effects

**See also:** `setLocale` · `provideLocale`

---

### `setLocale` `function`

```ts
(tag: string) => void
```

Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one value. Set the app-level default locale (client). Every formatter read in an effect, computed or JSX accessor updates. The tag is validated (a malformed tag throws a `[Pyreon]` error) and canonicalized (`EN-us` becomes `en-US`). On the server it does nothing and warns in dev: one process serves many requests, use `provideLocale`.

**Example**

```tsx
setLocale('de')
formatNumber(1234.5) // → "1.234,5"
setLocale('en-US')
formatNumber(1234.5) // → "1,234.5"
```

**Common mistakes**

- Calling it on the server to set a per-request locale: it is a no-op there; use `provideLocale` in the root component

**See also:** `locale` · `provideLocale`

---

### `provideLocale` `function`

```ts
(tag: string | (() => string)) => void
```

Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one value. Scope a subtree to a locale. Call it in a component's setup with a tag or an accessor (`() => i18n.locale()`), which is tracked. On the client it is owner-based context; on the server it is request-scoped, so concurrent requests never see each other's locale. This is the seam `@pyreon/i18n` will call.

**Example**

```tsx
// in a component's setup:
// provideLocale('de')
// provideLocale(() => userSettings.locale())
```

**Common mistakes**

- Calling it outside a component: it applies to the whole page for good (dev warning); use `setLocale`
- Passing an unvalidated tag from request data: a malformed static tag throws; an accessor value that is malformed degrades to the runtime default with a dev warning

**See also:** `setLocale` · `locale`

---

### `timeZone` `function`

```ts
() => string
```

Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one value. The active IANA time zone (a reactive read): the provided zone, else the app default, else the runtime's zone.

**Example**

```tsx
setTimeZone('Asia/Tokyo')
timeZone() // → "Asia/Tokyo"
setTimeZone('UTC')
timeZone() // → "UTC"
```

**See also:** `setTimeZone` · `provideTimeZone`

---

### `setTimeZone` `function`

```ts
(zone: string) => void
```

Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one value. Set the app-level default time zone (client). Date formatters of instants update; calendar strings never depend on the zone. A name that is not an IANA zone throws a `[Pyreon]` error. A no-op with a dev warning on the server: use `provideTimeZone`.

**Example**

```tsx
setTimeZone('Asia/Tokyo')
formatDateTime(Date.UTC(2026, 10, 18, 23, 30), { locale: 'en-US', dateStyle: 'short', timeStyle: 'short' }) // → "11/19/26, 8:30 AM"
setTimeZone('UTC')
formatDateTime(Date.UTC(2026, 10, 18, 23, 30), { locale: 'en-US', dateStyle: 'short', timeStyle: 'short' }) // → "11/18/26, 11:30 PM"
```

**See also:** `timeZone` · `provideTimeZone`

---

### `provideTimeZone` `function`

```ts
(zone: string | (() => string)) => void
```

Re-exported from `@pyreon/ambient`, which owns it, so `@pyreon/format`, `@pyreon/time` and every component share one value. Scope a subtree to a time zone, like `provideLocale`: a name or a tracked accessor; request-scoped on the server.

**Example**

```tsx
// in a component's setup:
// provideTimeZone('Europe/Prague')
```

**See also:** `setTimeZone` · `provideLocale`

---

### `Num` `component`

```ts
(props: NumProps) => VNodeChild
```

A formatted number as reactive text. With no extra props it renders no wrapper element. `kind` is `number` (default), `currency`, `percent`, `compact`, `unit` or `bytes`; `currency` / `unit` are the extra props those need; `options` are the Intl options; `locale` and `fallback` as everywhere. Pass a built formatter as `format` (it then replaces `kind`/`options`/`locale`/`fallback`), and `parts` to wrap a part of the output without string surgery (`parts={{ currency: (text) => <sup>{text}</sup> }}`; unwrapped parts are joined into one text node so server and client markup agree). `tabular` renders a `<span>` with `font-variant-numeric: tabular-nums` set once, so numbers in columns and live values do not jitter; `isolate` adds `unicode-bidi: isolate` for a number inside text of another direction; `class`, `id`, `style` and any other prop are forwarded to the `<span>`. Import from `@pyreon/format/components`.

**Example**

```tsx
// <Num value={total()} kind="currency" currency="EUR" />
// <Num value={total()} format={price} />
// <Num value={9.99} format={price} parts={{ currency: (text) => <sup>{text}</sup> }} />
// <Num value={size()} kind="bytes" tabular class="size" />
```

**Common mistakes**

- Passing the signal itself (`value={n}`): pass the read, `value={n()}`

**See also:** `DateTime` · `formatNumber`

---

### `DateTime` `component`

```ts
(props: DateTimeProps) => VNode
```

A `<time datetime="…">` element with the formatted value as text. `datetime` is machine-readable whatever the display locale: the calendar string as given, or the UTC ISO instant. `title` is the exact reading (the full date, and for an instant the time with its zone name; a calendar value has no zone), so hovering a short or relative date reveals it; a `title` you pass wins. `kind` is `date`, `time` or `dateTime` (default); `format` is a `dateStyle`/`timeStyle` shorthand or a built formatter (`dateFormatter('long')`) with `parts={{ month: (t) => <b>{t}</b> }}` to wrap parts; `options`, `locale`, `timeZone`, `fallback`; `isolate` (default true) sets `unicode-bidi: isolate`; other props (`class`, `id`, ...) go to the `<time>` element. Invalid values render the fallback and no `datetime` or `title`.

**Example**

```tsx
// <DateTime value="2026-11-18" kind="date" format="long" />
// <DateTime value={post.publishedAt} class="meta" />
// <DateTime value={post.updatedAt} format={relative} />  // hover shows the exact date and time
```

**Common mistakes**

- Expecting the server and the browser to agree without a locale: they agree when the same locale and zone are provided on both sides (and ICU versions match)

**See also:** `Num` · `formatDate`

---

### `RelativeTime` `component`

```ts
(props: RelativeTimeProps) => VNode
```

A `<time>` that says how long ago (or how far ahead) a value is and keeps itself current. It is `useRelativeTime` in an element: `datetime` is the machine value, `title` the exact date and time (the full date, and for an instant the time with its zone name; a `title` you pass wins), the text updates by itself on the shared timers (two for the whole page), and `unicode-bidi: isolate` is on by default. Props: `value`, `numeric`, `locale`, `timeZone`, `threshold` (`{ after: { days: 7 }, as: 'medium' }`), `fallback`, `options` (`style` and the rest) and `isolate`; other props go to the element. A server render prints the request's clock and starts no timer; with `clockScript()` or `clockAttributes()` from `@pyreon/ambient` the page hydrates to the same text and then updates once to real time.

**Example**

```tsx
// <RelativeTime value={comment.createdAt} />
// <RelativeTime value={post.updatedAt} threshold={{ after: { days: 7 } }} />  // "3 hours ago" ... "Nov 12, 2026"
// <RelativeTime value={issue.dueDate} />  // a date-only value is a day: "today", "tomorrow", "in 3 days"
```

**Common mistakes**

- Passing `style` for the Intl style: `style` is the element's style; use `options={{ style: 'short' }}`
- Server-rendering without handing the instant over: the client's first render reads its own clock and can differ from the server text; emit `clockScript()` (or spread `clockAttributes()`) from `@pyreon/ambient`

**See also:** `useRelativeTime` · `DateTime`

---

### `ConvertedUnitOptions` `type`

```ts
interface ConvertedUnitOptions extends UnitOptions { convertTo?: Unit; system?: 'auto' | 'metric' | 'us' | 'uk' }
```

Options of `formatUnit` and `unitFormatter` from `@pyreon/format/units`: everything in `UnitOptions`, plus a conversion before formatting. `convertTo` names the unit; `system` picks the locale's own (`'auto'`, which follows the active locale in the reactive entry) or a fixed system. `convertTo` wins when both are given. A conversion is arithmetic on a binary float (`Number(value)` times a factor), so a converted decimal string or bigint is no longer exact: `formatUnit('12345678901234567.89', 'meter', { convertTo: 'kilometer' })` shows about 17 significant digits. Without `convertTo` or `system`, a decimal string is formatted exactly.

**Example**

```tsx
// formatUnit(100, 'kilometer', { system: 'auto', locale: 'en-US' })
```

**See also:** `formatUnit` · `convert`

---

### `MeasurementSystem` `type`

```ts
type MeasurementSystem = 'metric' | 'us' | 'uk'
```

A system of measurement: `us` (US customary), `uk` (metric with road miles) or `metric`.

**Example**

```tsx
// const s: MeasurementSystem = measurementSystem('en-US')
```

**See also:** `measurementSystem`

---

### `UnitDimension` `type`

```ts
type UnitDimension = 'length' | 'mass' | 'volume' | 'area' | 'duration' | 'digital' | 'temperature' | 'angle' | 'proportion' | 'speed' | ... | `${string}-per-${string}`
```

What `unitDimension` returns: a simple dimension, a named compound (`speed`, `pace`, `fuel-economy`, ...) or `<a>-per-<b>`.

**Example**

```tsx
// const d: UnitDimension = unitDimension('mile')
```

**See also:** `unitDimension`

---

### `NumberInput` `type`

```ts
type NumberInput = number | bigint | string | null | undefined
```

A number-like input: a number, a bigint, or a decimal string (an optional `-`, digits, an optional `.` and digits), which is formatted exactly at any size. Nullish formats as the `fallback`; any other string (`"1e3"`, `" 12 "`, `""`) is invalid.

**Example**

```tsx
// formatNumber(null) // → ""
// formatNumber('12345678901234567890.5', { locale: 'en-US' }) // → "12,345,678,901,234,567,890.5"
```

**See also:** `DateInput` · `MoneyLike`

---

### `MoneyLike` `type`

```ts
interface MoneyLike { readonly amount: string; readonly currency: string }
```

The structural shape of a `@pyreon/money` Money, which `formatCurrency` and `currencyFormatter` take. No dependency on that package. `CurrencyInput = NumberInput | MoneyLike`.

**Example**

```tsx
// formatCurrency({ amount: '9.99', currency: 'EUR' }, { locale: 'en-US' }) // → "€9.99"
```

**See also:** `formatCurrency` · `NumberInput`

---

### `DateInput` `type`

```ts
type DateInput = Date | number | string | null | undefined
```

A date-like input. `Date` and `number` (epoch milliseconds) are instants. An ISO string with `Z` or an offset is an instant. An ISO date (`2026-11-18`) or date-time without offset (`2026-11-18T14:30`) is a calendar value and never shifts with the time zone.

**Example**

```tsx
// formatDate('2026-11-18')           // the 18th everywhere
// formatDate('2026-11-18T14:30')     // 14:30 everywhere
// formatDate('2026-11-18T14:30Z')    // an instant, shown in the active zone
```

**See also:** `formatDate`

---

### `PlainDateString` `type`

```ts
type PlainDateString = `${number}-${number}-${number}`
```

The `YYYY-MM-DD` string `parseDate` returns. Structurally the `PlainDate` of `@pyreon/time`, so a literal compiles without a cast.

**Example**

```tsx
// const d: PlainDateString = '2026-11-18'
```

**See also:** `parseDate`

---

### `PlainTimeString` `type`

```ts
type PlainTimeString = `${number}:${number}` | `${number}:${number}:${number}` | `${number}:${number}:${number}.${number}`
```

A time of day (`14:30`, `14:30:05`, `14:30:05.250`): a wall-clock value that never shifts with the zone. Accepted by the time formatters only. Structurally the `PlainTime` of `@pyreon/time`.

**Example**

```tsx
// formatTime('14:30')
```

**See also:** `formatTime` · `DateInput`

---

### `Unit` `type`

```ts
type Unit = SimpleUnit | `${SimpleUnit}-per-${SimpleUnit}`
```

`SimpleUnit` is the union of the units ECMA-262 sanctions (`Intl.supportedValuesOf('unit')`; a test keeps it equal to the runtime list). Compound units use `-per-`.

**Example**

```tsx
// formatUnit(5, 'kilometer')
// formatUnit(5, 'kilometer-per-hour')
```

**See also:** `formatUnit`

---

### `Duration` `type`

```ts
interface Duration { years?; months?; weeks?; days?; hours?; minutes?; seconds?; milliseconds? }
```

A duration as plain data. Fields share one sign.

**Example**

```tsx
// formatDuration({ hours: 2, minutes: 5 })
```

**See also:** `formatDuration`

---

### `Formatter` `type`

```ts
type Formatter<In, K extends FormatterKind> = ((value: In) => string) & { with, from, fallback, options, parts?, range? }
```

A reusable formatter: a plain function plus `with(overrides)`, `from(map)`, `fallback(text)` and `options`. `parts(value)` exists on number-style, date-style and list kinds, `range(a, b)` on number-style and date-style kinds, and is absent from the type elsewhere.

**Example**

```tsx
// const price: Formatter<NumberInput, 'currency'> = currencyFormatter('EUR')
```

**See also:** `numberFormatter`

---

### `FormatSpec` `type`

```ts
type FormatSpec = { kind: 'number' | 'currency' | … } & that formatter's options
```

The shape `defineFormats` takes: a `kind` and the options of that formatter (`currency` is required for `currency`, `unit` for `unit`, `base` for `relative`), or `{ extends: name, ...options }`.

**Example**

```tsx
// { kind: 'currency', currency: 'EUR' }
// { kind: 'date', dateStyle: 'long' }
```

**See also:** `defineFormats`

---

## Package-level notes

> **Experimental:** This package is Experimental: the API may change in a minor release before it is promoted to Stable.

> **Calendar values versus instants:** A date-only string (`2026-11-18`) and a date-time without an offset (`2026-11-18T14:30`) are CALENDAR values: they format as that day / clock time in every zone and ignore the `timeZone` option (a `timeZoneName` option is dropped and the long/full time styles become medium, because a calendar value has no zone to show). A string with `Z` or an offset, a number and a `Date` are instants shown in the active zone. Do not build `new Date('2026-11-18')` for a calendar date: it is an instant at midnight UTC.

> **Context is only visible in setup and effects:** `provideLocale` is owner-based context. A formatter called in a component body, an effect, a computed or a JSX accessor sees it; one called from an event handler or a timer outside any scope sees the app default. Capture the formatted value (or the formatter result) in setup if a handler needs the provided locale.

> **Options objects are cached by identity:** A hoisted options object is looked up by identity, so do not mutate it after the first call. A fresh inline literal of the same shape is served by a structural key (no JSON.stringify), at a small extra cost per call.

> **Locale tags from data:** A tag you hand to setLocale / provideLocale (static) / setTimeZone is validated and throws a [Pyreon] error if malformed. A tag that arrives at format time (an accessor value, an options.locale) may be request data, so a malformed one degrades to the runtime default with a dev warning instead of throwing.

> **Relative time that updates itself:** `useRelativeTime` and `<RelativeTime>` are built on the shared clock of `@pyreon/ambient`: every label shares one timer for the target-relative minute and hour marks and one for seconds; the timers are created by the first reader, stop with the last, and never run on a server. A formatter call (`formatRelativeTo`, `relativeFormatter`) is ONE reading and does not tick. For a server-rendered page emit `clockScript()` (or spread `clockAttributes()`) from `@pyreon/ambient` so the first client render prints what the server printed; the page then updates once to real time.

> **A date-only target is that day in the display zone:** In relative time a date-only value (`2026-11-18`) is a DAY, not a moment: it is compared as a calendar day in the display zone and never as hours, so "yesterday", "today", "tomorrow" and "in 3 days" are literally true for a person in that zone at any hour (`2026-11-18` at 10:00 on the 18th is "today", not "10 hours ago"). `@pyreon/time`'s `relativeDistance` gives the same words (a shared table of cases is tested in both packages). A date-time without a zone is a moment: under 24 hours it is elapsed time. Two date-only values compare as calendar days.

> **Spaces in output are non-breaking and thin spaces:** Intl writes U+00A0, U+2009 and U+202F where a plain space would sit: `formatDateRange` puts U+2009 around the en dash, `formatTime` writes U+202F before PM, Czech and French group digits with U+00A0 and U+202F. The examples in this documentation show them as plain spaces so they stay readable. Compare with `===` only against the platform's own output from the same process (`new Intl.DateTimeFormat(locale, options).formatRange(a, b)`), never against a typed literal; to see them in a failing test message, `text.replace(/[\u00a0\u2009\u202f]/g, '·')`.

> **Converting units: US versus imperial, and what is not a ratio:** `gallon` and `fluid-ounce` are the US liquid units (ECMA-402 and CLDR), also for `system: "uk"`: the imperial ones are not sanctioned by ECMA-402, so they are not convertible here. `kilobyte` is 1000 bytes (CLDR); the 1024 story is `formatBytes({ binary: true })`. Temperature is affine (celsius and fahrenheit; kelvin is not an Intl unit), a fuel economy and its inverse (`mile-per-gallon`, `liter-per-kilometer`) are reciprocals, and `month` and `year` have no fixed length and are not convertible. `uk` is metric except that distances and speeds are miles; `preferredUnit` is a small table, not CLDR use-case preferences.

> **Engines differ in CLDR data:** Intl output is CLDR data and V8, JavaScriptCore and ICU versions differ (for example a narrow no-break space before PM). For SSR, pass the same locale and time zone on both sides; the hydration test in this package runs real Chromium against Node-rendered markup shape, not byte equality across ICU versions.

> **Composing formatters:** A formatter is a plain function, so compose with plain values: `listFormatter()(items.map(price))`, `bytesFormatter()(used)` inside a template string, `price.from(row => row.total)` as a table column. There is deliberately NO per-unit currency helper ("€9.99/month"): the platform has no locale data for the "per" pattern outside unit formatting, and a hand-made pattern is wrong in many languages. Format the value and embed it in a translated message ("&#123;price&#125; per month").

> **Native:** Not lowered by PMTC yet (tier web-only). A core set of Intl calls already lowers natively without this package; mapping these functions onto that set is the planned native work.
