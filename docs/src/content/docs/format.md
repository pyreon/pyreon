---
title: Format
description: Locale-aware formatting and parsing for Pyreon — numbers, currency, bytes, durations, lists, dates, relative time — as plain functions over Intl that follow the active locale and time zone
---

<PackageBadge name="@pyreon/format" href="/docs/format" />

Formatting for everything an app prints: numbers, money, byte sizes, durations, lists, dates, times and relative time, plus parsers for what users type back. Every operation is one plain function over `Intl`. The same function works in JSX and effects (it reads the active locale and time zone, so the binding updates), in plain code (it returns a string) and on the server (the locale is request-scoped).

> **Experimental.** The API may change in a minor release before the package is promoted to Stable.

## Why a format package?

`Intl` is the right engine and a clumsy API. Four problems repeat in every app:

- **Construction cost.** `new Intl.NumberFormat(...)` takes microseconds to tens of microseconds. Written inline in a render function or a list row, it is the dominant cost of the row. `@pyreon/format` caches every formatter per (locale, options), so the hot path is one table lookup and one `format()` call.
- **Locale plumbing.** Every call needs the right locale, and the locale changes at runtime and differs per request on a server. Here the locale is the active reactive value, so a binding updates when it changes, and `provideLocale` scopes it per subtree and per request.
- **Bad data at render time.** `Intl` throws on a `NaN` date or an invalid currency code, and a render function that throws takes the page down. Nullish input returns a fallback, invalid input returns it with a dev warning, and only programmer errors throw.
- **Dates and time zones.** `new Date('2026-11-18')` is midnight UTC, so a plain calendar date shows as the 17th west of Greenwich. A date-only string here is a calendar date and shows the 18th in every zone.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/format
```

```bash [bun]
bun add @pyreon/format
```

```bash [pnpm]
pnpm add @pyreon/format
```

```bash [yarn]
yarn add @pyreon/format
```

:::

`@pyreon/core` and `@pyreon/reactivity` are peer dependencies of the reactive entry and the components. The `/core` entry needs neither.

## Quick start

```tsx
import { formatBytes, formatCurrency, formatDate, formatRelativeTo, setLocale } from '@pyreon/format'

function Order(props: { total: number; size: number; placed: string }) {
  return (
    <ul>
      <li>{formatCurrency(props.total, 'EUR')}</li>
      <li>{formatBytes(props.size)}</li>
      <li>{formatDate(props.placed, 'long')}</li>
    </ul>
  )
}

setLocale('de') // every binding above re-renders in German
```

## Three entries

| Entry | Depends on | What |
| --- | --- | --- |
| `@pyreon/format/core` | nothing | Every formatter and parser as a pure function. Locale and time zone come from the options; the default is the runtime's. No `@pyreon/*` import. |
| `@pyreon/format` | `@pyreon/core`, `@pyreon/reactivity` | The same names, defaulting to the active locale and zone. Adds the locale API. |
| `@pyreon/format/components` | `@pyreon/core` | `<Num>` and `<DateTime>`. |

Every function is individually tree-shakeable (`sideEffects: false`, nothing runs on import).

## Numbers

```ts
import { formatNumber, formatCurrency, formatPercent, formatCompact, formatUnit, formatBytes } from '@pyreon/format'

formatNumber(1234567.891, { locale: 'en-US' })                 // "1,234,567.891"
formatNumber(1234567.891, { locale: 'de' })                    // "1.234.567,891"
formatCurrency(9.99, 'EUR', { locale: 'en-US' })               // "€9.99"
formatPercent(0.42, { locale: 'en-US' })                       // "42%"
formatCompact(1_240_000, { locale: 'en-US' })                  // "1.2M"
formatUnit(72, 'kilometer-per-hour', { locale: 'en-US' })      // "72 km/h"
formatBytes(1536, { locale: 'en-US' })                         // "1.5 kB"
```

Options are the platform's `Intl.NumberFormat` options plus `locale` and `fallback`. A string in place of the options is a preset: `'integer'`, `'plain'`, `'compact'`, `'percent'` for `formatNumber`; a `currencyDisplay` or `'accounting'` for `formatCurrency`; `'short'`, `'narrow'`, `'long'` for `formatUnit`.

`Unit` is a union of the units ECMA-262 sanctions, plus `<unit>-per-<unit>` compounds, so a misspelt unit is a type error.

### Bytes

Decimal by default (1000 steps, SI units); `binary: true` uses 1024 steps and IEC symbols. Rounding never prints `1000 kB` or `1024 KiB`: the value carries into the next unit.

```ts
formatBytes(1536, { locale: 'en-US' })                  // "1.5 kB"
formatBytes(1536, { locale: 'en-US', binary: true })    // "1.5 KiB"
formatBytes(999999, { locale: 'en-US' })                // "1 MB"
```

## Durations

```ts
import { formatDuration } from '@pyreon/format'

formatDuration({ hours: 2, minutes: 5 }, { locale: 'en-US' })                 // "2 hr, 5 min"
formatDuration(3_905_000, { locale: 'en-US', style: 'digital' })              // "1:05:05"
formatDuration(90_061_000, { locale: 'en-US', largest: 2 })                   // "1 day, 1 hr"
```

Styles are `long`, `short` (default), `narrow` and `digital`. A number is milliseconds and is broken down into days, hours, minutes, seconds and milliseconds; a `Duration` object is shown as given. `largest: n` keeps the `n` most significant non-zero units, truncating the rest. `Intl.DurationFormat` is used when the runtime has it; otherwise an equivalent is built from `Intl.NumberFormat` and `Intl.ListFormat`.

## Dates and times

```ts
import { formatDate, formatTime, formatDateTime, formatDateRange, formatRelative, formatRelativeTo } from '@pyreon/format'

formatDate('2026-11-18', { locale: 'en-US' })                     // "Nov 18, 2026"
formatDate('2026-11-18', { locale: 'cs', dateStyle: 'full' })     // "středa 18. listopadu 2026"
formatDateRange('2026-11-12', '2026-11-15', { locale: 'en-US' })  // "Nov 12 – 15, 2026"
formatRelative(-3, 'day', { locale: 'en-US' })                    // "3 days ago"
formatRelativeTo('2026-11-17', '2026-11-18', { locale: 'en-US' }) // "yesterday"
```

`formatDate` shows the date part (default `dateStyle: 'medium'`), `formatTime` the time part (`timeStyle: 'short'`), `formatDateTime` both. Presets are `'short'`, `'medium'`, `'long'`, `'full'`. `formatRelativeTo(target, base)` picks the unit (seconds, minutes, hours, days, weeks, months, years) and truncates toward zero, so 59 minutes 40 seconds is "59 minutes", never "60 minutes". The base is explicit: the functions stay pure.

### Calendar values never shift

| Input | Meaning | Time zone |
| --- | --- | --- |
| `'2026-11-18'` | a calendar date | ignored: the 18th everywhere |
| `'2026-11-18T14:30'` | a wall-clock time | ignored: 14:30 everywhere |
| `'2026-11-18T14:30:00Z'`, `'…+02:00'` | an instant | the active zone |
| `Date`, `number` (epoch ms) | an instant | the active zone |

```ts
formatDate('2026-11-18', { locale: 'en-US', timeZone: 'Pacific/Kiritimati' })        // "Nov 18, 2026"
formatDate('2026-11-18T23:30:00Z', { locale: 'en-US', timeZone: 'Asia/Tokyo' })      // "Nov 19, 2026"
```

Do not build `new Date('2026-11-18')` for a calendar date: it is an instant at midnight UTC. A `timeZoneName` option next to a calendar value is dropped, and the `long` and `full` time styles become `medium`, because a calendar value has no zone to show.

## Lists

```ts
import { formatList } from '@pyreon/format'

formatList(['red', 'green', 'blue'], { locale: 'en-US' })                          // "red, green, and blue"
formatList(['red', 'green', 'blue'], { locale: 'en-US', type: 'disjunction' })     // "red, green, or blue"
```

Any iterable works. Presets are `'and'`, `'or'` and `'unit'`. Nullish entries are skipped, other values go through `String`, and an empty list returns the `fallback`.

## Locale and time zone

```ts
import { locale, setLocale, provideLocale, timeZone, setTimeZone, provideTimeZone } from '@pyreon/format'
```

| Function | What |
| --- | --- |
| `locale()` | The active locale. A reactive read. |
| `setLocale(tag)` | The app-level default (client). A no-op with a dev warning on the server. |
| `provideLocale(tag \| () => tag)` | Scope a subtree. Call it in a component's setup. An accessor is tracked. |
| `timeZone()` | The active IANA zone. A reactive read. |
| `setTimeZone(zone)` | The app-level default zone (client). |
| `provideTimeZone(zone \| () => zone)` | Scope a subtree to a zone. |

Resolution order for the locale: an explicit `options.locale`, then the nearest `provideLocale`, then `setLocale`, then `navigator.language` on the client or the runtime default on the server. The zone follows the same order and ends at the runtime's zone.

A formatter reads the active values, so it updates inside an effect, a computed or a JSX accessor. An explicit `locale` or `timeZone` option does not subscribe.

```tsx
import { effect } from '@pyreon/reactivity'

effect(() => {
  console.log(formatNumber(1234.5)) // re-runs on setLocale()
})
```

Tags you pass to `setLocale`, `provideLocale(string)` and `setTimeZone` are validated and a malformed one throws a `[Pyreon]` error. A tag that arrives at format time (an accessor value, an `options.locale`) may be request data, so a malformed one falls back to the runtime default with a dev warning.

### Scoping and `@pyreon/i18n`

`provideLocale` takes an accessor, which is exactly what an i18n provider calls: `provideLocale(() => i18n.locale())`. A formatter inside that subtree follows the i18n locale and tracks it.

Context is visible in a component's setup and in the effects and computeds created there. A formatter called from an event handler or a timer outside any scope sees the app default, not a provided locale; format in setup (or in a computed) when a handler needs the provided value.

### On the server

`provideLocale` and `provideTimeZone` write to the request-scoped context stack, never to module state, and `setLocale` does nothing on the server. Two interleaved requests with different locales never see each other's.

```tsx
function App(props: { request: Request }) {
  provideLocale(pickLocale(props.request))
  return <Page />
}
```

Intl output is CLDR data, and engines and ICU versions differ in small ways (a narrow no-break space before `PM`, for example). Pass the same locale and time zone on the server and the client, and the markup agrees.

## Parsing

```ts
import { parseNumber, parseDate } from '@pyreon/format'

parseNumber('1 234,5', { locale: 'cs' })          // 1234.5
parseNumber('12,34,567.5', { locale: 'hi' })      // 1234567.5
parseNumber('twelve', { locale: 'en-US' })        // null
parseDate('18. 11. 2026', { locale: 'cs' })       // "2026-11-18"
parseDate('31. 2. 2026', { locale: 'cs' })        // null
```

`parseNumber` accepts the locale's digits, decimal, group, minus and percent signs, plain, no-break and narrow no-break spaces as group separators where the locale groups with a space, and `'` for apostrophe-grouped locales. Anything else is `null`, including a group separator used as a decimal (`1.5` in German is not guessed). Scientific notation is not parsed. `parseNumber(formatNumber(x)) === x` holds for the formatter's output in every locale tested, including Arabic-Indic digits.

`parseDate` reads numeric dates in the locale's day, month, year order, or ISO `YYYY-MM-DD` in any locale, and returns `YYYY-MM-DD`. Impossible dates are `null`. A two-digit year follows the POSIX rule: `00`-`68` is 2000-2068, `69`-`99` is 1969-1999. Buddhist and Minguo years are converted. Month names and other non-Gregorian calendars return `null`.

## Composing formatters

A formatter is a value: a plain `(value) => string` that follows the active locale and time zone like the free functions. Because it is just a function it drops into every place that takes a formatting callback (`Array#map`, a chart axis, a table column, an `@pyreon/rx` pipe) with no adapter. There is one factory per kind, each exported on its own so each tree-shakes:

| Factory | Input | Extra methods |
| --- | --- | --- |
| `numberFormatter`, `currencyFormatter(currency)`, `percentFormatter`, `compactFormatter`, `unitFormatter(unit)` | number | `parts`, `range` |
| `bytesFormatter` | number | `parts` |
| `durationFormatter` | duration or milliseconds | none |
| `listFormatter` | an iterable of strings | `parts` |
| `dateFormatter`, `timeFormatter`, `dateTimeFormatter` | date-like | `parts`, `range` |
| `relativeFormatter({ base })` | date-like, measured against `base` | none |

Every formatter also has `with`, `from`, `fallback` and `options`. A method that does not exist for a kind is absent from its type.

```ts
import { currencyFormatter, bytesFormatter, percentFormatter, listFormatter } from '@pyreon/format'

const price = currencyFormatter('EUR', { locale: 'en-US' })
price(9.99)                                    // "€9.99"
price.range(10, 20)                            // "€10.00 – €20.00"
price.parts(9.99).map((p) => p.type)           // ["currency", "integer", "decimal", "fraction"]
```

### Derive with `with`, adapt with `from`

`with(overrides)` returns a new formatter with options merged over the original's; the original is untouched, and `undefined` unsets an option. `from(map)` adapts the input: the result takes whatever `map` takes.

```ts
const rounded = price.with({ maximumFractionDigits: 0 })
rounded(9.99)                                  // "€10"

const fromCents = price.from((cents: number) => cents / 100)
fromCents(999)                                 // "€9.99"
;[999, 1250].map(fromCents)                    // ["€9.99", "€12.50"]  (a plain callback)

const fromRow = fromCents.from((row: { total: number }) => row.total)   // chain adapters
fromRow({ total: 1250 })                       // "€12.50"
```

`with`, `from` and `fallback` commute: `price.with(a).from(m).fallback(t)` and `price.fallback(t).from(m).with(a)` format identically. `fallback(text)` sets what nullish and invalid input render as.

### Compose through plain values

Formatters return strings, so they compose with each other and with the free functions:

```ts
const size = bytesFormatter({ locale: 'en-US' })
const pct = percentFormatter({ locale: 'en-US' })
const usage = (used: number, total: number) => `${size(used)} of ${size(total)} (${pct(used / total)})`
usage(1536, 4096)                              // "1.5 kB of 4.1 kB (38%)"

listFormatter({ locale: 'en-US' })([1250, 2500].map(fromCents))   // "€12.50 and €25.00"
```

### Cost

A formatter freezes a copy of its options when it is created and looks its `Intl` object up once per locale (and zone). A call is a locale read, a string compare and one `format()`; nothing is hashed or allocated per call. `with`, `from` and `fallback` create a small function and share the underlying cache entries, so creating thousands of identical derived formatters constructs one `Intl` object and adds one cache entry. A formatter whose options name a `locale` does not subscribe to the active locale.

### Named formats: `defineFormats`

Each key is a real formatter. A spec may extend another by name: it inherits the kind and merges options over the base's. An unknown name is a type error, and a cycle throws a `[Pyreon]` error at definition time.

```ts
import { defineFormats } from '@pyreon/format'

const f = defineFormats({
  price: { kind: 'currency', currency: 'EUR' },
  priceShort: { extends: 'price', notation: 'compact' },
  size: { kind: 'bytes' },
})

f.price(9.99)
f.priceShort(1_234_567)                        // "€1.2M" under en-US
f.price.with({ currency: 'USD' })(9.99)        // "$9.99" under en-US
f.price.from((cents: number) => cents / 100)
```

`kind` selects the factory (`number`, `currency`, `percent`, `compact`, `unit`, `bytes`, `duration`, `list`, `date`, `time`, `dateTime`, `relative`); the other fields are that factory's options. Entries take exactly one argument, so `[...].map(f.price)` is safe; per-call overrides are `.with()`, hoisted. Define the specs once at module level.

### What is deliberately missing: "per month" currency

There is no per-unit currency helper ("€9.99/month"). The platform exposes no locale data for the "per" pattern outside unit formatting, so a hand-made pattern would be wrong in many languages (word order, the preposition, spacing). Format the value and embed it in a translated message:

```ts
const price = currencyFormatter('EUR')
t('billing.perMonth', { price: price(9.99) })   // "{{price}} per month" in the message catalog
```

### `createFormatter`

`createFormatter({ locale, timeZone })` is a bound, non-reactive set of the one-off functions (`number`, `currency`, `date`, `parseNumber`, ...) for servers, scripts and tests. It never reads the active locale or zone.

```ts
import { createFormatter } from '@pyreon/format'

const f = createFormatter({ locale: 'cs', timeZone: 'Europe/Prague' })
f.number(1234567.5)            // "1 234 567,5"
f.date('2026-11-18', 'long')   // "18. listopadu 2026"
```

## Components

```tsx
import { Num, DateTime } from '@pyreon/format/components'

<Num value={total()} kind="currency" currency="EUR" />
<Num value={total()} format={price} />
<Num value={9.99} format={price} parts={{ currency: (text) => <sup>{text}</sup> }} />
<DateTime value="2026-11-18" kind="date" format="long" />
<DateTime value="2026-11-18" format={dateFormatter('long')} parts={{ month: (t) => <b>{t}</b> }} />
```

`<Num>` renders reactive text with no wrapper element. `kind` is `number` (default), `currency`, `percent`, `compact`, `unit` or `bytes`. Pass a built formatter as `format` and it replaces `kind`, `options`, `locale` and `fallback`: configure those on the formatter. `parts` wraps parts of the output (the keys are the `Intl` part types, typed per component): a part without a wrapper stays plain text, and the plain parts between wrapped ones are joined into one text node, so the server HTML and the client agree and hydration adopts it.

`<DateTime>` renders `<time datetime="…">` with a machine-readable value whatever the display locale: the calendar string as given, or the UTC ISO instant. `format` is a `dateStyle`/`timeStyle` shorthand or a built date formatter. An invalid value renders the `fallback` and no `datetime`.

## Never throws on data

| Input | Result |
| --- | --- |
| `null`, `undefined` | the `fallback` (default `''`), silently |
| `NaN`, an unparseable date string, a malformed currency code | the `fallback`, with a dev-only `[Pyreon]` warning (once per cause) |
| An unknown unit, a bad option, an unknown preset | throws a `[Pyreon]` error that says how to fix it |

```ts
formatNumber(null, { fallback: '-' })        // "-"
formatDate('2026-02-30', { fallback: '?' })  // "?" (and one dev warning)
```

## Performance

Formatters are cached in one bounded table per kind, keyed locale, then variant (zone, currency or unit), then slot. A slot has three lookup tiers: no options (the locale's default formatter), a preset string, and an options object looked up by identity first (hoisted options) and then by a structural key built without `JSON.stringify` (inline literals). A call with no options or a preset does one signal read, one table lookup and one `format()` call.

- Hoist option objects and do not mutate them after the first call.
- Every table is bounded (locales, variants, presets and option shapes), so request-derived locales and generated options cannot grow memory.

The package ships benchmarks (`bench/format-rivals.ts`, `bench/format-reactive.ts`, `bench/format-size.ts`). No measured numbers are published yet.

## Multiplatform

`@pyreon/format` is `web-only` today: PMTC does not lower these functions yet. A core set of `Intl` calls already lowers natively without this package; mapping these functions onto it is the planned native work.

## API Reference

See the generated [reference page](/docs/reference/format) for every export with signatures, examples and common mistakes.
