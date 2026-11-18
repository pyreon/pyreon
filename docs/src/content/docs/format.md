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

`@pyreon/core` and `@pyreon/reactivity` are REQUIRED peer dependencies of the reactive entry and the components (they import them when they load; every Pyreon app has both): `npm install @pyreon/format @pyreon/core @pyreon/reactivity`. The `/core` entry imports no `@pyreon/*` package, so a project that uses only `@pyreon/format/core` needs neither. `@pyreon/ambient` (the locale, time zone and clock) is a regular dependency and installs with the reactive entry.

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
| `@pyreon/format` | `@pyreon/core`, `@pyreon/reactivity`, `@pyreon/ambient` | The same names, defaulting to the active locale and zone. Adds the locale API (re-exported from `@pyreon/ambient`) and `useRelativeTime`. |
| `@pyreon/format/components` | `@pyreon/core`, `@pyreon/reactivity`, `@pyreon/ambient` | `<Num>`, `<DateTime>` and `<RelativeTime>`. |

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
formatBytes(1536, { locale: 'en-US' })                  // → "1.5 kB"
formatBytes(1536, { locale: 'en-US', binary: true })    // → "1.5 KiB"
formatBytes(999999, { locale: 'en-US' })                // → "1 MB"
```

Below a kilobyte the byte count is written with the symbol, in the locale's own kilobyte pattern: the number order, spacing and bidi marks come from `Intl`, with the byte symbol in the unit's place. Locales that write short units as words (Arabic, Hebrew, Thai) keep `Intl`'s word for a byte. `unitDisplay: 'long'` gives the plural-correct word.

```ts
formatBytes(0, { locale: 'en-US' })                                  // → "0 B"
formatBytes(999, { locale: 'en-US' })                                // → "999 B"
formatBytes(1023, { locale: 'en-US', binary: true })                 // → "1,023 B"
formatBytes(999, { locale: 'en-US', unitDisplay: 'long' })           // → "999 bytes"
formatBytes(1, { locale: 'en-US', unitDisplay: 'long' })             // → "1 byte"
```

Above petabytes `Intl` has no unit. Short and narrow display continue with EB, ZB and YB, derived from the locale's own petabyte text by swapping its leading "P" (French writes octets: `Po`, so `Eo`, `Zo`, `Yo`); a locale whose petabyte text does not start with "P" (Russian, Arabic) stops at petabytes, with grouping. Binary continues with EiB, ZiB and YiB, which are language neutral. `unitDisplay: 'long'` stops at petabytes, because the unit word cannot be derived. A value above a yottabyte stays in YB with grouping.

```ts
formatBytes(1e18, { locale: 'en-US' })                               // → "1 EB"
formatBytes(1e21, { locale: 'en-US' })                               // → "1 ZB"
formatBytes(1e21, { locale: 'en-US', unitDisplay: 'long' })          // → "1,000,000 petabytes"
```

### Negative zero

`signDisplay` defaults to `'negative'` in every number-style formatter, so `-0` and values that round to zero print `0`, never `-0` or `-$0.00`. This is one of the few places where the default differs from raw `Intl` (`signDisplay: 'auto'`); pass `signDisplay: 'auto'` for the platform behaviour.

```ts
formatNumber(-0, { locale: 'en-US' })                                                            // → "0"
formatCurrency(-0.001, 'USD', { locale: 'en-US' })                                               // → "$0.00"
formatNumber(-0.001, { locale: 'en-US', maximumFractionDigits: 2, signDisplay: 'auto' })         // → "-0"
```

## Durations

```ts
import { formatDuration } from '@pyreon/format'

formatDuration({ hours: 2, minutes: 5 }, { locale: 'en-US' })                 // → "2 hr, 5 min"
formatDuration(3_905_000, { locale: 'en-US', style: 'digital' })              // → "1:05:05"
formatDuration(90_061_000, { locale: 'en-US', largest: 2 })                   // → "1 day, 1 hr"
```

Styles are `long`, `short` (default), `narrow` and `digital`. A number is milliseconds and is broken down into days, hours, minutes, seconds and milliseconds; a `Duration` object is shown as given, and a fractional field balances down into the smaller units.

**Human defaults.** From one second on, seconds are the smallest unit shown, rounded half up with carry into the larger units; milliseconds appear only for a duration under one second. `smallest` sets the finest unit shown (`'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'`) and rounds the finer parts away with carries; `largest: n` keeps the `n` most significant non-zero units, truncating the rest.

```ts
formatDuration(59_999, { locale: 'en-US' })                                   // → "1 min"
formatDuration(999, { locale: 'en-US' })                                      // → "999 ms"
formatDuration(1_500, { locale: 'en-US', smallest: 'millisecond' })           // → "1 sec, 500 ms"
formatDuration(3_599_600, { locale: 'en-US', smallest: 'minute' })            // → "1 hr"
formatDuration({ hours: 1.5 }, { locale: 'en-US' })                           // → "1 hr, 30 min"
formatDuration({ days: 0.5 }, { locale: 'en-US' })                            // → "12 hr"
formatDuration({ minutes: 90 }, { locale: 'en-US' })                          // → "90 min"
```

A round-up carries (59 min 59.6 s with `smallest: 'minute'` is `1 hr`); a whole field you pass is never re-balanced (`{ minutes: 90 }` stays `90 min`). Hours roll into days, and months into years, only where that unit is already part of the value.

**Digital style** is the media-player convention: `h:mm:ss`, minutes unpadded when there are no hours, seconds always two digits, digits of the locale, `:` as the separator. A fraction appears only when you ask for milliseconds (`smallest: 'millisecond'`) or a `fractionalDigits` count. Weeks and days fold into hours; months and years have no fixed length and are invalid in this style. It is written in this package, so it reads the same in every runtime.

```ts
formatDuration(65_432, { locale: 'en-US', style: 'digital' })                                    // → "1:05"
formatDuration(5_000, { locale: 'en-US', style: 'digital' })                                     // → "0:05"
formatDuration(59_999, { locale: 'en-US', style: 'digital' })                                    // → "1:00"
formatDuration(65_432, { locale: 'en-US', style: 'digital', smallest: 'millisecond' })           // → "1:05.432"
formatDuration(25 * 3_600_000, { locale: 'en-US', style: 'digital' })                            // → "25:00:00"
```

The word styles use `Intl.DurationFormat` when the runtime has it and an equivalent built from `Intl.NumberFormat` and `Intl.ListFormat` otherwise.

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

### A time of day

`'14:30'`, `'14:30:05'` and `'14:30:05.250'` are wall-clock times (`PlainTimeString`): `formatTime` and `timeFormatter` accept them and never shift them with the zone. They have no date, so `formatDate`, `formatDateTime`, ranges and relative time reject them with a message that says to use `formatTime`.

```ts
formatTime('14:30', { locale: 'en-US' })                                       // → "2:30 PM"
formatTime('14:30:05', { locale: 'en-US', timeStyle: 'medium' })               // → "2:30:05 PM"
formatDate('14:30', { locale: 'en-US', fallback: 'no date' })                  // → "no date"
```

### Relative time counts the calendar

`formatRelativeTo(target, base)` picks the unit from the distance:

| Distance | Unit | How it is counted |
| --- | --- | --- |
| under 1 minute | seconds | elapsed, truncated toward zero |
| under 1 hour | minutes | elapsed |
| under 24 hours | hours | elapsed |
| 24 hours or more, under 7 calendar days | days | calendar days between the local dates in `timeZone` |
| under 30 days, or the same calendar month | weeks | 7-day blocks of calendar days |
| up to 11 calendar months | months | calendar months (`last month` is the previous calendar month) |
| 12 calendar months or more | years | calendar years (`last year` is the previous calendar year) |

From a day on, the calendar decides, so "yesterday", "tomorrow" and "last month" are always literally true; the zone is the `timeZone` option, else the active zone. Under a day, elapsed time is used even across midnight (23 hours is "23 hours ago"). The thresholds are not options.

```ts
formatRelativeTo('2026-11-16T13:00:00Z', '2026-11-18T01:00:00Z', { locale: 'en-US', timeZone: 'UTC' })   // → "2 days ago"
formatRelativeTo('2026-10-05', '2026-11-18', { locale: 'en-US' })                                       // → "last month"
formatRelativeTo('2025-12-15', '2026-12-20', { locale: 'en-US' })                                       // → "last year"
formatRelativeTo('2026-10-22', '2026-11-18', { locale: 'en-US' })                                       // → "3 weeks ago"
```

### A date-only target is that day in the display zone

In relative time a date-only value (`2026-11-18`) is the midnight that starts that day **in the display zone**, not UTC midnight. Seen from far from UTC the old reading was wrong by hours or a whole day (at 10:00 in Tokyo on the 18th the date was "1 hour ago"; at midnight on the 19th in Kiritimati it was "10 hours ago" although the 18th was already yesterday). With the day in the zone, "yesterday", "today" and "tomorrow" are literally true for the person reading, and `@pyreon/time`'s `relativeDistance` gives the same words: both packages test the same table of cases.

```ts
formatRelativeTo('2026-11-18', '2026-11-18T01:00:00Z', { locale: 'en-US', timeZone: 'Asia/Tokyo' }) // → "10 hours ago"
formatRelativeTo('2026-11-18', '2026-11-18T10:00:00Z', { locale: 'en-US', timeZone: 'Pacific/Kiritimati' }) // → "yesterday"
formatRelativeTo('2026-11-18', '2026-11-17T20:00:00Z', { locale: 'en-US', timeZone: 'America/Los_Angeles' }) // → "in 12 hours"
formatRelativeTo('2026-11-17', '2026-11-18', { locale: 'en-US' }) // → "yesterday"
```

Under 24 hours the distance is still elapsed time, so a date-only value seen at 10:00 on its own day is "10 hours ago", not "today": it has no time of day to count from. Two date-only values compare as calendar days.

### Reversed ranges

A range picker mid-selection produces reversed pairs. `formatDateRange`, `formatNumberRange` and `Formatter#range` order the pair first, so the earlier value always comes first; equal ends give the single value where `Intl` does.

```ts
formatDateRange('2026-11-15', '2026-11-12', { locale: 'en-US' })     // → "Nov 12 – 15, 2026"
formatNumberRange(5, 3, { locale: 'en-US' })                         // → "3–5"
```

### An invalid time zone

A zone often comes from user profile data, so an invalid `timeZone` option is treated like an invalid locale: one dev warning, then the active (runtime) zone. A literal you hand to `setTimeZone`, `provideTimeZone` or `createFormatter` is validated and throws a `[Pyreon]` error.

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

These are the functions of [`@pyreon/ambient`](/docs/ambient), re-exported: the active locale, the active time zone and the clock belong to neither the formatting nor the time package. An app that uses `@pyreon/format`, `@pyreon/time` and `@pyreon/i18n` has **one** locale, **one** time zone and **one** clock: `setLocale` from any of them changes what every formatter prints, and `@pyreon/i18n` will feed its locale into the same value, so a language switch moves numbers, dates and relative times with the translations. `@pyreon/format/core` has no dependency and takes the locale and zone as options.

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
import { parseNumber, parseCurrency, parseDate } from '@pyreon/format'

parseNumber('1 234,5', { locale: 'cs' })                     // → 1234.5
parseNumber('12,34,567.5', { locale: 'hi' })                 // → 1234567.5
parseNumber('twelve', { locale: 'en-US' })                   // → null
parseCurrency('€9.99', 'EUR', { locale: 'en-US' })           // → 9.99
parseDate('18. 11. 2026', { locale: 'cs' })                  // → "2026-11-18"
parseDate('18. listopadu 2026', { locale: 'cs' })            // → "2026-11-18"
parseDate('31. 2. 2026', { locale: 'cs' })                   // → null
```

**`parseNumber`** accepts the locale's digits, decimal, group, minus and percent signs, plain, no-break and narrow no-break spaces as group separators where the locale groups with a space, and `'` for apostrophe-grouped locales. Anything else is `null`. `parseNumber(formatNumber(x)) === x` holds for the formatter's output in every locale tested, including Arabic-Indic digits.

A numpad types `.`. In a locale whose decimal separator is a comma and whose group separator is not a dot (Czech, French, Russian, Polish, ...), a lone `.` is accepted as the decimal separator. Where the dot is the group separator (German, Spanish, Italian, Dutch, Brazilian Portuguese, ...) it is never read as a decimal: `1.234` stays 1234 and `1.5` is `null`. The rule comes from `Intl` parts, not from a list of locales.

```ts
parseNumber('1234.5', { locale: 'cs' })                      // → 1234.5
parseNumber('1.234', { locale: 'de' })                       // → 1234
parseNumber('1.5', { locale: 'de' })                         // → null
```

**`parseCurrency(text, currency, options?)`** removes that currency's symbol, narrow symbol, code and name as the locale writes them (read from `Intl` parts), before or after the number, and accounting parentheses (negative), then reads the number as `parseNumber` does. A bare number is accepted; another currency's symbol, extra text and anything else are `null`.

```ts
parseCurrency('9,99 €', 'EUR', { locale: 'de' })             // → 9.99
parseCurrency('($5.00)', 'USD', { locale: 'en-US' })         // → -5
parseCurrency('9.99 euros', 'EUR', { locale: 'en-US' })      // → 9.99
parseCurrency('€9.99', 'USD', { locale: 'en-US' })           // → null
```

**`parseDate`** reads numeric dates in the locale's day, month, year order, ISO `YYYY-MM-DD` in any locale, and the locale's own medium and long forms with month names: long and short names, with or without the trailing dot, case-insensitive, genitive forms included (Czech `18. listopadu 2026`), built from `Intl` on first use into a bounded per-locale table. A name that would mean two months is dropped, never guessed. It returns `YYYY-MM-DD`; impossible dates are `null`. A two-digit year follows the POSIX rule: `00`-`68` is 2000-2068, `69`-`99` is 1969-1999. Buddhist and Minguo years are converted. `parseDate(formatDate(d, style))` returns `d` for `short`, `medium` and `long` across the tested locales.

```ts
parseDate('Nov 18, 2026', { locale: 'en-US' })               // → "2026-11-18"
parseDate('18 nov. 2026', { locale: 'fr' })                  // → "2026-11-18"
parseDate('1/2/69', { locale: 'en-US' })                     // → "1969-01-02"
```

**What is NOT parsed:** compact notation (`1.2M`), scientific notation (`1e3`), natural language (`next Friday`, `tomorrow`), weekday names, times, and non-Gregorian calendars other than Buddhist and Minguo (a Persian date returns `null`, not a wrong date). Parse what the user typed in the locale they typed it in: `1.234` is 1234 in German and 1.234 in English.

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
import { Num, DateTime, RelativeTime } from '@pyreon/format/components'

<>
  <Num value={total()} kind="currency" currency="EUR" />
  <Num value={total()} format={price} />
  <Num value={9.99} format={price} parts={{ currency: (text) => <sup>{text}</sup> }} />
  <DateTime value="2026-11-18" kind="date" format="long" />
  <DateTime value="2026-11-18" format={dateFormatter('long')} parts={{ month: (t) => <b>{t}</b> }} />
  <RelativeTime value={comment.createdAt} threshold={{ after: { days: 7 } }} />
</>
```

`<Num>` renders reactive text with no wrapper element. `kind` is `number` (default), `currency`, `percent`, `compact`, `unit` or `bytes`. Pass a built formatter as `format` and it replaces `kind`, `options`, `locale` and `fallback`: configure those on the formatter. `parts` wraps parts of the output (the keys are the `Intl` part types, typed per component): a part without a wrapper stays plain text, and the plain parts between wrapped ones are joined into one text node, so the server HTML and the client agree and hydration adopts it.

`<DateTime>` renders `<time datetime="…">` with a machine-readable value whatever the display locale: the calendar string as given, or the UTC ISO instant. `format` is a `dateStyle`/`timeStyle` shorthand or a built date or relative formatter. `title` is set to the exact reading unless you pass one: the full date, and for an instant the time with its zone name (a calendar value has no zone), so hovering a short or relative date reveals the exact one. An invalid value renders the `fallback` and no `datetime` or `title`.

`<RelativeTime>` is [`useRelativeTime`](#relative-time-that-updates-itself) in a `<time>`: `datetime`, an exact `title` and bidi isolation as for `<DateTime>`, and the text keeps itself current.

`<Num tabular>` renders a `<span>` with `font-variant-numeric: tabular-nums`, set once and never per update, so numbers in columns and live-updating values do not jitter. `class`, `id`, `style` and any other prop are forwarded to the element (`<Num>` with none of them stays a bare text node). For right-to-left locales, `<DateTime>` isolates its content by default (`unicode-bidi: isolate`; `isolate={false}` turns it off) and `<Num isolate>` does the same, so a number or date inside text of the other direction keeps its own order.

## Relative time that updates itself

`formatRelativeTo` is one reading. For a label that stays current, `useRelativeTime` returns an accessor and `<RelativeTime>` is the same thing in a `<time>` element:

```tsx
import { useRelativeTime } from '@pyreon/format'
import { RelativeTime } from '@pyreon/format/components'

function Comment(props: { comment: Comment }) {
  const ago = useRelativeTime(() => props.comment.createdAt)

  return <span>{ago}</span> // "just now", "3 minutes ago", "yesterday" ... changes by itself
}

<RelativeTime value={comment.createdAt} />
```

The text is `formatRelativeTo` against the shared clock of `@pyreon/ambient`, so it is the same calendar-true text, and it changes **at the moment it changes**: each second under a minute, at the target's own minute and hour marks (`1 minute ago` appears when the target is one minute old, not at the next wall-clock minute), at local midnight once it counts days, and when a future target comes within a day. Every label on the page shares one timer for those marks and one for the seconds, so 200 comments cost two timers; the timers are created by the first label, stop with the last, never run while the page is hidden, and never run on a server.

| Option | |
| --- | --- |
| `numeric` | `'auto'` (default) says "yesterday"; `'always'` says "1 day ago" |
| `style` | `'long'`, `'short'`, `'narrow'` (on `<RelativeTime>` pass it in `options`: `style` is the element's) |
| `locale`, `timeZone` | override the active ones |
| `fallback` | text for a missing or invalid value |
| `threshold` | `{ after, as? }`: past this distance show an absolute date |

### Switching to a date after a week

`threshold: { after: { days: 7 }, as: 'medium' }` reads "3 hours ago", "yesterday", "last week", then "Nov 12, 2026". `after` is milliseconds or `{ seconds, minutes, hours, days, weeks }` (summed) of elapsed time, in either direction, and `as` is a date style or `Intl.DateTimeFormat` options (`{ month: 'long', day: 'numeric' }`), default `'medium'`. A future target beyond the threshold shows its date and turns relative when it comes within it. Once a past label has switched to its date it never changes again and costs no timer.

```ts
const old = useRelativeTime('2020-01-05', { locale: 'en-US', timeZone: 'UTC', threshold: { after: { days: 7 }, as: 'medium' } })
old() // → "Jan 5, 2020"
```

### Recipes

- **Comment timestamps.** `<RelativeTime value={comment.createdAt} threshold={{ after: { days: 7 } }} />`: relative for a week, then the date, one pair of timers for the whole thread.
- **An "Updated just now" badge.** `<RelativeTime value={doc.savedAt} />` reads "now" for the first second, then "5 seconds ago" on the shared second timer, and flips to "1 minute ago" exactly when the save is a minute old. Wrap it for the wording around it: `<span>Saved <RelativeTime value={doc.savedAt} /></span>`.
- **The exact time on hover.** `<RelativeTime>` sets `title` to the full date and time (with the zone name for an instant) and `datetime` to the machine value; pass your own `title` to replace it.
- **A due date.** `<RelativeTime value="2026-11-20" numeric="always" />` counts the calendar in the display zone: "in 2 days", then from the day before "tomorrow", and from midnight on the day itself "in 3 hours".

### Server rendering

On a server the label prints the request's clock and starts no timer. Provide the instant the page renders at and hand it to the client, and the first client render prints exactly what the server printed, then updates once to real time:

```tsx
import { clockScript, provideClock } from '@pyreon/ambient'

provideClock(requestStartedAt) // in the root component, on the server
// in the page head: clockScript() (or spread clockAttributes() on <html> under a strict CSP)
```

Without the hand-over the client's first render reads its own clock and the text can differ from the server's; see [ambient](/docs/ambient) for the details. A relative formatter without a `base` (`relativeFormatter({ locale: 'en-US' })`) reads the same clock once per call; it does not tick.

## Recipes

Each snippet below is run by the package tests: the shown output is what the call returns.

### A price with the original struck through and the percent off

Format the amounts with one formatter, the discount with another; `Num` renders reactive text and keeps the markup yours.

```ts
const price = currencyFormatter('EUR', { locale: 'en-US' })
const off = percentFormatter({ locale: 'en-US', maximumFractionDigits: 0 })
price(79.99) // → "€79.99"
price(59.99) // → "€59.99"
off(1 - 59.99 / 79.99) // → "25%"
```

### File sizes in a table column

Right-align the cell and use `tabular` so the digits line up and a live-updating size does not jitter. In a row, `from` adapts the row to the value.

```ts
const size = bytesFormatter({ locale: 'en-US' })
;[0, 999, 1536, 5_000_000, 3_200_000_000].map(size) // → ["0 B","999 B","1.5 kB","5 MB","3.2 GB"]
const sizeOf = size.from((file: { bytes: number }) => file.bytes)
sizeOf({ name: 'report.pdf', bytes: 2_500_000 }) // → "2.5 MB"
```

### "Updated 3 minutes ago" with the exact time on hover

`<DateTime>` puts the exact date and time (with the zone) in `title` for you, and `<RelativeTime>` does the same while keeping the text current (see above). A relative formatter takes the clock as an accessor, so a clock signal keeps the text current.

```ts
const base = Date.UTC(2026, 10, 18, 12, 3)
const since = relativeFormatter({ locale: 'en-US', base })
since(Date.UTC(2026, 10, 18, 12, 0)) // → "3 minutes ago"
since(Date.UTC(2026, 10, 17, 12, 0)) // → "yesterday"
since('2026-10-05') // → "last month"
```

### A locale-aware number input

Show the value with `formatNumber`, read what the user types with `parseNumber`. Parsing is strict on purpose: `null` means "not a number yet", so keep the draft text and validate on blur. A numpad `.` works in comma locales.

```ts
const cs = { locale: 'cs' }
formatNumber(1234.5, cs) // → "1 234,5"
parseNumber('1 234,5', cs) // → 1234.5
parseNumber('1234.5', cs) // → 1234.5
parseNumber('12,3,4', cs) // → null
parseNumber(formatNumber(1234567.891, cs), cs) // → 1234567.891
```

### A price field that accepts "€9.99"

`parseCurrency` strips the currency's symbol, code or name as the locale writes it, in prefix or suffix position, and reads accounting parentheses.

```ts
parseCurrency('€9.99', 'EUR', { locale: 'en-US' }) // → 9.99
parseCurrency('9,99 €', 'EUR', { locale: 'de' }) // → 9.99
parseCurrency('($5.00)', 'USD', { locale: 'en-US' }) // → -5
parseCurrency('€9.99', 'USD', { locale: 'en-US' }) // → null
```

### A date range label

`formatDateRange` collapses what the two dates share and orders a reversed pair, so a range picker can show a label while the user is still choosing.

```ts
formatDateRange('2026-11-12', '2026-11-15', { locale: 'en-US' }) // → "Nov 12 – 15, 2026"
formatDateRange('2026-11-28', '2026-12-02', { locale: 'en-US' }) // → "Nov 28 – Dec 2, 2026"
formatDateRange('2026-11-15', '2026-11-12', { locale: 'en-US' }) // → "Nov 12 – 15, 2026"
formatDateRange('2026-11-12', '2026-11-12', { locale: 'en-US' }) // → "Nov 12, 2026"
```

### Durations for media and for humans

The digital style is the player convention (`h:mm:ss`, minutes unpadded below an hour); the word styles round to seconds, with carry, from one second on.

```ts
const ms = 205_432
formatDuration(ms, { locale: 'en-US', style: 'digital' }) // → "3:25"
formatDuration(3_905_000, { locale: 'en-US', style: 'digital' }) // → "1:05:05"
formatDuration(ms, { locale: 'en-US' }) // → "3 min, 25 sec"
formatDuration(ms, { locale: 'en-US', style: 'long' }) // → "3 minutes, 25 seconds"
formatDuration(ms, { locale: 'en-US', style: 'long', largest: 1 }) // → "3 minutes"
formatDuration(59_999, { locale: 'en-US' }) // → "1 min"
```

## Coming from other libraries

The call here that does the same job as the one you know. The result column is what the call returns (the package tests run every row). Where a library rounds or words things differently the row says so instead of pretending to be identical.

| Instead of | Use | Result |
| --- | --- | --- |
| `new Intl.NumberFormat('de').format(1234.5)` | `formatNumber(1234.5, { locale: 'de' })` | `"1.234,5"` |
| `n.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })` | `formatCurrency(9.99, 'EUR', { locale: 'en-US' })` | `"€9.99"` |
| `n.toLocaleString('en-US', { maximumFractionDigits: 0 })` | `formatNumber(1234.5, { locale: 'en-US', maximumFractionDigits: 0 })` | `"1,235"` |
| `new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-1, 'day')` | `formatRelative(-1, 'day', { locale: 'en-US', numeric: 'auto' })` | `"yesterday"` |
| `new Intl.ListFormat('en').format(['a', 'b', 'c'])` | `formatList(['a', 'b', 'c'], { locale: 'en-US' })` | `"a, b, and c"` |
| `new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(d)` | `formatDate('2026-11-18', { locale: 'en-US', dateStyle: 'long' })` | `"November 18, 2026"` |
| numeral: `numeral(1234.567).format('0,0.00')` | `formatNumber(1234.567, { locale: 'en-US', minimumFractionDigits: 2, maximumFractionDigits: 2 })` | `"1,234.57"` |
| numeral: `numeral(0.42).format('0%')` | `formatPercent(0.42, { locale: 'en-US' })` | `"42%"` |
| numeral: `numeral(1230974).format('0.0a')` | `formatCompact(1230974, { locale: 'en-US' })` | `"1.2M"` |
| numeral: `numeral(9.99).format('$0.00')` | `formatCurrency(9.99, 'USD', { locale: 'en-US' })` | `"$9.99"` |
| numeral: `numeral('1,234.5').value()` | `parseNumber('1,234.5', { locale: 'en-US' })` | `1234.5` |
| pretty-bytes: `prettyBytes(1337)` (1.34 kB) | `formatBytes(1337, { locale: 'en-US', maximumFractionDigits: 2 })` | `"1.34 kB"` |
| pretty-bytes: `prettyBytes(1337, { binary: true })` | `formatBytes(1337, { locale: 'en-US', binary: true, maximumFractionDigits: 2 })` | `"1.31 KiB"` |
| pretty-ms: `prettyMilliseconds(1337000000)` | `formatDuration(1337000000, { locale: 'en-US', style: 'narrow' })` | `"15d 11h 23m 20s"` |
| pretty-ms: `prettyMilliseconds(3905000, { colonNotation: true })` | `formatDuration(3905000, { locale: 'en-US', style: 'digital' })` | `"1:05:05"` |
| humanize-duration: `humanizeDuration(3905000)` | `formatDuration(3905000, { locale: 'en-US', style: 'long' })` | `"1 hour, 5 minutes, 5 seconds"` |
| date-fns: `format(d, 'PPP')` | `formatDate('2026-11-18', { locale: 'en-US', dateStyle: 'long' })` | `"November 18, 2026"` |
| date-fns: `format(d, 'p')` | `formatTime('2026-11-18T14:30', { locale: 'en-US' })` | `"2:30 PM"` |
| date-fns: `formatDistance(d, base, { addSuffix: true })` | `formatRelativeTo('2026-11-15', '2026-11-18', { locale: 'en-US' })` | `"3 days ago"` |
| Day.js: `dayjs(d).format('LL')` | `formatDate('2026-11-18', { locale: 'en-US', dateStyle: 'long' })` | `"November 18, 2026"` |
| Day.js: `dayjs(d).format('LLL')` | `formatDateTime('2026-11-18T14:30', { locale: 'en-US', dateStyle: 'long', timeStyle: 'short' })` | `"November 18, 2026 at 2:30 PM"` |
| Day.js: `dayjs(d).fromNow()` | `formatRelativeTo('2026-11-17', '2026-11-18', { locale: 'en-US' })` | `"yesterday"` |
| Moment: `moment(d).format('LLLL')` | `formatDateTime('2026-11-18T14:30', { locale: 'en-US', dateStyle: 'full', timeStyle: 'short' })` | `"Wednesday, November 18, 2026 at 2:30 PM"` |
| Moment: `moment(d).fromNow()` | `formatRelativeTo('2026-10-05', '2026-11-18', { locale: 'en-US' })` | `"last month"` |
| Moment: `moment('18.11.2026', 'DD.MM.YYYY')` | `parseDate('18.11.2026', { locale: 'cs' })` | `"2026-11-18"` |

Differences worth knowing: `toLocaleString` and `new Intl.*Format` take the locale once, where these follow the active locale and re-render on `setLocale`; moment, Day.js and date-fns format a `Date` in the local zone, where a date-only string here is a calendar date that never shifts; `numeral` and `pretty-bytes` print English patterns, where these use the locale's own number and unit patterns; the English long date-time pattern in CLDR reads "November 18, 2026 at 2:30 PM", where Day.js and moment templates print no "at".

## Spaces in output

`Intl` writes non-breaking and thin spaces where a plain space would sit: `formatDateRange` puts U+2009 around the en dash (`Nov 12 – 15, 2026`), `formatTime('14:30')` writes U+202F before `PM`, and Czech or French group digits with U+00A0 or U+202F. The examples on this page show them as plain spaces so they stay readable; the real strings contain the others.

Compare with `===` only against the platform's own output from the same process, never against a typed literal:

```ts
const text = formatDateRange('2026-11-12', '2026-11-15', { locale: 'en-US' })
text === new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).formatRange(new Date('2026-11-12'), new Date('2026-11-15')) // → true
```

To see them in a failing test message, map them to a visible mark: `text.replace(/[\u00a0\u2009\u202f]/g, '·')`. Do not normalise them away in the code that renders text: they keep a number and its unit, or a time and its `PM`, on one line.

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
