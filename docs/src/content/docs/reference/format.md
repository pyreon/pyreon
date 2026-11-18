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
- Request-scoped on the server: provideLocale / provideTimeZone use the context stack, never module state, so concurrent requests never share a locale
- Calendar dates never shift: a date-only or offset-less string formats as that day / wall-clock time in every time zone
- Bounded three-tier Intl cache: no options, preset string, options object (identity, then structural key) — every table bounded, no JSON.stringify on the hot path
- Never throws on data: nullish returns the fallback, invalid returns it with a dev-only warning; programmer errors (unknown unit, bad option) throw [Pyreon] errors that say how to fix
- Three tree-shakeable entries: /core (no @pyreon import), the reactive entry, /components (&lt;Num&gt;, &lt;DateTime&gt;)
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
// A named format set:
const f = defineFormats({ price: { kind: 'currency', currency: 'EUR' } })
f.price(1234.5) // → "€1,234.50"
// Parsing is the inverse:
parseNumber('1 234,5', { locale: 'cs' }) // → 1234.5
parseDate('18. 11. 2026', { locale: 'cs' }) // → "2026-11-18"
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`formatNumber`](#formatnumber-function) | function | Format a number with `Intl.NumberFormat`. |
| [`formatCurrency`](#formatcurrency-function) | function | Format money. |
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
| [`formatRelativeTo`](#formatrelativeto-function) | function | Describe `target` relative to an explicit `base`, picking the unit (seconds, minutes, hours, days, weeks, months, years)… |
| [`formatDateRange`](#formatdaterange-function) | function | Format a range with the shared parts collapsed. |
| [`formatNumberRange`](#formatnumberrange-function) | function | Format a numeric range with the shared parts collapsed. |
| [`formatNumberToParts`](#formatnumbertoparts-function) | function | The parts of a formatted number (for custom markup). |
| [`formatDateToParts`](#formatdatetoparts-function) | function | The parts of a formatted date and time (default: date and time, medium and short). |
| [`parseNumber`](#parsenumber-function) | function | Parse what a user typed or a formatter printed. |
| [`parseDate`](#parsedate-function) | function | Parse a NUMERIC date in the locale's day / month / year order (any separators the locale uses, plus `. |
| [`createFormatter`](#createformatter-function) | function | A bound, NON-reactive set of formatters (`number`, `currency`, `percent`, `compact`, `unit`, `bytes`, `duration`,… |
| [`defineFormats`](#defineformats-function) | function | Name a set of formats once and call them anywhere: each key becomes `(value, overrides?) => string`. |
| [`locale`](#locale-function) | function | The active locale (a reactive read). |
| [`setLocale`](#setlocale-function) | function | Set the app-level default locale (client). |
| [`provideLocale`](#providelocale-function) | function | Scope a subtree to a locale. |
| [`timeZone`](#timezone-function) | function | The active IANA time zone (a reactive read): the provided zone, else the app default, else the runtime's zone. |
| [`setTimeZone`](#settimezone-function) | function | Set the app-level default time zone (client). |
| [`provideTimeZone`](#providetimezone-function) | function | Scope a subtree to a time zone, like `provideLocale`: a name or a tracked accessor; request-scoped on the server. |
| [`Num`](#num-component) | component | A formatted number as reactive text (no wrapper element). |
| [`DateTime`](#datetime-component) | component | A `<time datetime="…">` element with the formatted value as text. |
| [`NumberInput`](#numberinput-type) | type | A number-like input. |
| [`DateInput`](#dateinput-type) | type | A date-like input. |
| [`PlainDateString`](#plaindatestring-type) | type | The `YYYY-MM-DD` string `parseDate` returns. |
| [`Unit`](#unit-type) | type | `SimpleUnit` is the union of the units ECMA-262 sanctions (`Intl.supportedValuesOf('unit')`; a test keeps it equal to… |
| [`Duration`](#duration-type) | type | A duration as plain data. |
| [`FormatSpec`](#formatspec-type) | type | The shape `defineFormats` takes: a `kind` and the options of that formatter (`currency` is required for `currency`,… |

## API

### `formatNumber` `function`

```ts
(value: NumberInput, options?: NumberOptions | NumberPreset) => string
```

Format a number with `Intl.NumberFormat`. Options are the platform's `Intl.NumberFormat` options plus `locale` and `fallback`; a string is a preset (`integer`, `plain`, `compact`, `percent`). Nullish or `NaN` input returns the `fallback` (default `''`). The formatter is cached per (locale, options), so calling it in a list or a binding costs one `format()`.

**Example**

```tsx
formatNumber(1234567.891, { locale: 'en-US' }) // → "1,234,567.891"
formatNumber(1234567.891, { locale: 'de' }) // → "1.234.567,891"
formatNumber(0.5, { locale: 'en-US', style: 'percent' }) // → "50%"
formatNumber(1234.5678, { locale: 'en-US', maximumFractionDigits: 1 }) // → "1,234.6"
formatNumber(null, { fallback: '-' }) // → "-"
```

**Common mistakes**

- Building the formatter yourself per call (`new Intl.NumberFormat(...)` in a render function): that is the cost this package caches
- Mutating an options object after passing it: option objects are cached by identity, so treat a hoisted options object as immutable
- Expecting a preset string to carry a locale: a string has no `locale`; use the active locale or `createFormatter`

**See also:** `formatCurrency` · `formatPercent` · `formatCompact` · `defineFormats`

---

### `formatCurrency` `function`

```ts
(value: NumberInput, currency: string, options?: CurrencyOptions | CurrencyPreset) => string
```

Format money. `currency` is an ISO 4217 code; a malformed code returns the `fallback` with a dev warning. Presets: `symbol`, `narrowSymbol`, `code`, `name`, `accounting`.

**Example**

```tsx
formatCurrency(9.99, 'EUR', { locale: 'en-US' }) // → "€9.99"
formatCurrency(1234.5, 'EUR', { locale: 'de' }) // → "1.234,50 €"
formatCurrency(1234.5, 'CZK', { locale: 'cs' }) // → "1 234,50 Kč"
formatCurrency(-5, 'USD', { locale: 'en-US', currencySign: 'accounting' }) // → "($5.00)"
formatCurrency(5, 'USD', { locale: 'en-US', currencyDisplay: 'name' }) // → "5.00 US dollars"
```

**Common mistakes**

- Formatting an amount in minor units (cents) without dividing: `formatCurrency(999, 'EUR')` is 999 euros
- Passing the symbol (`'€'`) instead of the code (`'EUR'`)

**See also:** `formatNumber` · `defineFormats`

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

Format a measurement with a sanctioned `Intl` unit (`Unit` is a union of them, plus `<unit>-per-<unit>` compounds). `unitDisplay` is `short` by default. An unknown unit is a programmer error and throws a `[Pyreon]` error.

**Example**

```tsx
formatUnit(72, 'kilometer-per-hour', { locale: 'en-US' }) // → "72 km/h"
formatUnit(1.5, 'liter', { locale: 'en-US', unitDisplay: 'long' }) // → "1.5 liters"
formatUnit(21, 'celsius', { locale: 'de' }) // → "21 °C"
```

**Common mistakes**

- A unit that is not in `Intl.supportedValuesOf('unit')` (`kilometre`, `km`): it is a type error and throws at runtime

**See also:** `formatBytes` · `Unit`

---

### `formatBytes` `function`

```ts
(bytes: NumberInput, options?: BytesOptions) => string
```

Format a byte count, choosing the unit. Decimal by default (1000 steps, SI units: `1536` is `1.5 kB`); `binary: true` uses 1024 steps and IEC symbols (`1.5 KiB`). Rounding never produces `1000 kB` or `1024 KiB`: the value carries into the next unit. One fraction digit by default (`maximumFractionDigits`).

**Example**

```tsx
formatBytes(1536, { locale: 'en-US' }) // → "1.5 kB"
formatBytes(1536, { locale: 'en-US', binary: true }) // → "1.5 KiB"
formatBytes(999999, { locale: 'en-US' }) // → "1 MB"
formatBytes(5_000_000_000, { locale: 'de' }) // → "5 GB"
formatBytes(1536, { locale: 'en-US', unitDisplay: 'long' }) // → "1.5 kilobytes"
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

Format a duration given as `{ hours, minutes, ... }` or as milliseconds. Styles `long`, `short` (default), `narrow` and `digital` (`1:05:05`). `largest: n` shows only the `n` most significant non-zero units (truncated, not rounded). Uses `Intl.DurationFormat` when the runtime has it and an equivalent fallback built from `Intl.NumberFormat` and `Intl.ListFormat` otherwise.

**Example**

```tsx
formatDuration({ hours: 2, minutes: 5 }, { locale: 'en-US' }) // → "2 hr, 5 min"
formatDuration(3_905_000, { locale: 'en-US', style: 'digital' }) // → "1:05:05"
formatDuration(90_061_000, { locale: 'en-US', style: 'long' }) // → "1 day, 1 hour, 1 minute, 1 second"
formatDuration(90_061_000, { locale: 'en-US', largest: 2 }) // → "1 day, 1 hr"
formatDuration(0, { locale: 'en-US' }) // → "0 sec"
```

**Common mistakes**

- Expecting carries for a Duration object: `{ minutes: 90 }` prints `90 min`; only a millisecond number is broken down
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

Format the date part. Default `dateStyle: 'medium'`; presets `short`, `medium`, `long`, `full`; or any `Intl.DateTimeFormat` options. A date-only string (`2026-11-18`) is a calendar date and shows that day in EVERY time zone; a `Z`/offset string, a number and a `Date` are instants shown in the active `timeZone`.

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
(value: DateInput, options?: DateTimeOptions | DateStylePreset) => string
```

Format the time part. Default `timeStyle: 'short'`. A date-time without an offset (`2026-11-18T14:30`) is a wall-clock time and never shifts.

**Example**

```tsx
formatTime('2026-11-18T14:30', { locale: 'de' }) // → "14:30"
formatTime('2026-11-18T14:30:00Z', { locale: 'en-GB', timeZone: 'Asia/Tokyo' }) // → "23:30"
formatTime('2026-11-18T14:30', { locale: 'de', hour12: true }) // → "02:30 PM"
```

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

Describe `target` relative to an explicit `base`, picking the unit (seconds, minutes, hours, days, weeks, months, years) and truncating toward zero, so 59 minutes 40 seconds is `59 minutes`. `numeric: 'auto'` by default. The base is explicit so the function stays pure; pass the current time yourself.

**Example**

```tsx
formatRelativeTo(Date.UTC(2026, 10, 18, 12, 5), Date.UTC(2026, 10, 18, 12, 0), { locale: 'en-US' }) // → "in 5 minutes"
formatRelativeTo('2026-11-17', '2026-11-18', { locale: 'en-US' }) // → "yesterday"
formatRelativeTo('2026-12-25', '2026-11-18', { locale: 'en-US' }) // → "next month"
formatRelativeTo('2026-11-18', '2026-11-18', { locale: 'de' }) // → "jetzt"
```

**Common mistakes**

- Expecting it to read the clock: it does not. Pass `Date.now()` (or a clock signal) as `base`

**See also:** `formatRelative`

---

### `formatDateRange` `function`

```ts
(start: DateInput, end: DateInput, options?: DateRangeOptions | DateStylePreset) => string
```

Format a range with the shared parts collapsed. Two calendar strings are a range of calendar days in every zone.

**Example**

```tsx
formatDateRange('2026-11-12', '2026-11-15', { locale: 'en-US' }) // → "Nov 12 – 15, 2026"
formatDateRange('2026-11-28', '2026-12-02', { locale: 'en-US' }) // → "Nov 28 – Dec 2, 2026"
formatDateRange('2026-11-12', '2026-11-15', { locale: 'de' }) // → "12.–15.11.2026"
```

**See also:** `formatDate`

---

### `formatNumberRange` `function`

```ts
(start: NumberInput, end: NumberInput, options?: NumberRangeOptions | NumberPreset) => string
```

Format a numeric range with the shared parts collapsed.

**Example**

```tsx
formatNumberRange(3, 5, { locale: 'en-US' }) // → "3–5"
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

Parse what a user typed or a formatter printed. Accepts the locale's digits, decimal, group, minus and percent signs, plain / no-break / narrow no-break / thin spaces for space-grouped locales, and `'` for apostrophe-grouped ones. Returns `null` for anything else, including a group separator used as a decimal (`1.5` in German). Scientific notation is not parsed.

**Example**

```tsx
parseNumber('1 234,5', { locale: 'cs' }) // → 1234.5
parseNumber('1.234,5', { locale: 'de' }) // → 1234.5
parseNumber('12,34,567.5', { locale: 'hi' }) // → 1234567.5
parseNumber('42 %', { locale: 'de' }) // → 0.42
parseNumber('twelve', { locale: 'en-US' }) // → null
parseNumber(formatNumber(-9876.54, { locale: 'fr' }), { locale: 'fr' }) // → -9876.54
```

**Common mistakes**

- Guessing the locale: parse with the locale the user typed in, `1.234` is 1234 in German and 1.234 in English

**See also:** `formatNumber` · `parseDate`

---

### `parseDate` `function`

```ts
(text: string, options?: { locale?: string }) => PlainDateString | null
```

Parse a NUMERIC date in the locale's day / month / year order (any separators the locale uses, plus `. / - space`) or ISO `YYYY-MM-DD` in any locale, to `YYYY-MM-DD`. Impossible dates return `null`. A two-digit year follows the POSIX rule: 00-68 is 2000-2068, 69-99 is 1969-1999. Buddhist and Minguo years are converted; month names and other non-Gregorian calendars return `null`.

**Example**

```tsx
parseDate('18. 11. 2026', { locale: 'cs' }) // → "2026-11-18"
parseDate('11/18/26', { locale: 'en-US' }) // → "2026-11-18"
parseDate('18/11/2026', { locale: 'en-GB' }) // → "2026-11-18"
parseDate('31. 2. 2026', { locale: 'cs' }) // → null
parseDate('1/2/69', { locale: 'en-US' }) // → "1969-01-02"
parseDate('2026-11-18', { locale: 'de' }) // → "2026-11-18"
```

**Common mistakes**

- Expecting month names ("18 November 2026") to parse: only numeric dates do

**See also:** `formatDate` · `parseNumber`

---

### `createFormatter` `function`

```ts
(base?: { locale?: string; timeZone?: string }) => Formatter
```

A bound, NON-reactive set of formatters (`number`, `currency`, `percent`, `compact`, `unit`, `bytes`, `duration`, `list`, `date`, `time`, `dateTime`, `relative`, `relativeTo`, `dateRange`, `numberRange`, `numberToParts`, `dateToParts`, `parseNumber`, `parseDate`) for servers, scripts and tests. It never reads the active locale or zone. Per-call options still override the base.

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

**See also:** `defineFormats`

---

### `defineFormats` `function`

```ts
<const T extends Record<string, FormatSpec>>(specs: T) => DefinedFormats<T>
```

Name a set of formats once and call them anywhere: each key becomes `(value, overrides?) => string`. `kind` selects the formatter (`number`, `currency`, `percent`, `compact`, `unit`, `bytes`, `duration`, `list`, `date`, `time`, `dateTime`, `relative`); the rest are that formatter's options. Keys, value types and overrides are inferred, and a wrong `kind` or `unit` is a type error. A call without overrides reuses the spec object, so it is served by the identity tier of the cache. The reactive entry follows the active locale; the `/core` one uses the options or the runtime default.

**Example**

```tsx
const f = defineFormats({ price: { kind: 'currency', currency: 'EUR', locale: 'en-US' }, size: { kind: 'bytes', locale: 'en-US' }, day: { kind: 'date', dateStyle: 'long', locale: 'en-US' } })
f.price(9.99) // → "€9.99"
f.price(9.99, { currency: 'USD' }) // → "$9.99"
f.size(1536) // → "1.5 kB"
f.day('2026-11-18') // → "November 18, 2026"
```

**Common mistakes**

- Defining the specs inside a component: define them once at module level (the hoisted spec object is what the cache keys on)

**See also:** `createFormatter`

---

### `locale` `function`

```ts
() => string
```

The active locale (a reactive read). Resolution order: an explicit `options.locale`, the nearest `provideLocale`, the app default set by `setLocale`, then `navigator.language` on the client or the runtime default on the server.

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

Set the app-level default locale (client). Every formatter read in an effect, computed or JSX accessor updates. The tag is validated (a malformed tag throws a `[Pyreon]` error) and canonicalized (`EN-us` becomes `en-US`). On the server it does nothing and warns in dev: one process serves many requests, use `provideLocale`.

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

Scope a subtree to a locale. Call it in a component's setup with a tag or an accessor (`() => i18n.locale()`), which is tracked. On the client it is owner-based context; on the server it is request-scoped, so concurrent requests never see each other's locale. This is the seam `@pyreon/i18n` will call.

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

The active IANA time zone (a reactive read): the provided zone, else the app default, else the runtime's zone.

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

Set the app-level default time zone (client). Date formatters of instants update; calendar strings never depend on the zone. A name that is not an IANA zone throws a `[Pyreon]` error. A no-op with a dev warning on the server: use `provideTimeZone`.

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

Scope a subtree to a time zone, like `provideLocale`: a name or a tracked accessor; request-scoped on the server.

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

A formatted number as reactive text (no wrapper element). `kind` is `number` (default), `currency`, `percent`, `compact`, `unit` or `bytes`; `currency` / `unit` are the extra props those need; `options` are the Intl options; `locale` and `fallback` as everywhere. Import from `@pyreon/format/components`.

**Example**

```tsx
// <Num value={total()} kind="currency" currency="EUR" />
// <Num value={bytes()} kind="bytes" />
```

**Common mistakes**

- Passing the signal itself (`value={n}`): pass the read, `value={n()}`

**See also:** `DateTime` · `formatNumber`

---

### `DateTime` `component`

```ts
(props: DateTimeProps) => VNode
```

A `<time datetime="…">` element with the formatted value as text. `datetime` is machine-readable whatever the display locale: the calendar string as given, or the UTC ISO instant. `kind` is `date`, `time` or `dateTime` (default); `format` is a `dateStyle`/`timeStyle` shorthand; `options`, `locale`, `timeZone`, `fallback`; other props go to the `<time>` element. Invalid values render the fallback and no `datetime`.

**Example**

```tsx
// <DateTime value="2026-11-18" kind="date" format="long" />
// <DateTime value={post.publishedAt} class="meta" />
```

**Common mistakes**

- Expecting the server and the browser to agree without a locale: they agree when the same locale and zone are provided on both sides (and ICU versions match)

**See also:** `Num` · `formatDate`

---

### `NumberInput` `type`

```ts
type NumberInput = number | bigint | null | undefined
```

A number-like input. Nullish formats as the `fallback`.

**Example**

```tsx
// formatNumber(null) // → ""
```

**See also:** `DateInput`

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

### `FormatSpec` `type`

```ts
type FormatSpec = { kind: 'number' | 'currency' | … } & that formatter's options
```

The shape `defineFormats` takes: a `kind` and the options of that formatter (`currency` is required for `currency`, `unit` for `unit` and `relative`).

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

> **Engines differ in CLDR data:** Intl output is CLDR data and V8, JavaScriptCore and ICU versions differ (for example a narrow no-break space before PM). For SSR, pass the same locale and time zone on both sides; the hydration test in this package runs real Chromium against Node-rendered markup shape, not byte equality across ICU versions.

> **Native:** Not lowered by PMTC yet (tier web-only). A core set of Intl calls already lowers natively without this package; mapping these functions onto that set is the planned native work.
