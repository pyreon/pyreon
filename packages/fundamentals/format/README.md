# @pyreon/format

> **Status: Experimental.** The API may change in a minor release before it is promoted to Stable.

Locale-aware formatting and parsing for Pyreon: numbers, currency, bytes, durations, lists, dates, relative time. Plain functions over `Intl` that follow the active locale and time zone, work on the server per request, never throw on bad data, and cache every `Intl.*Format` in bounded tables.

```bash
bun add @pyreon/format @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import { formatCurrency, formatBytes, formatDate, formatRelativeTo, setLocale } from '@pyreon/format'

formatCurrency(9.99, 'EUR')            // "€9.99" under en-US
formatBytes(1536)                      // "1.5 kB"
formatDate('2026-11-18', 'long')       // "November 18, 2026"

// Reactive: the active locale is a signal. Change it and every binding updates.
function Price(props: { amount: number }) {
  return <p>{formatCurrency(props.amount, 'EUR')}</p>
}
setLocale('de')                        // the <p> now reads "1.234,50 €"
```

The same function works in JSX and effects (it reads the active locale and time zone, so the binding updates), in plain code (it returns a string), and on the server (the locale is request-scoped).

## Entries

| Entry | Depends on | What |
| --- | --- | --- |
| `@pyreon/format/core` | nothing | Every formatter and parser as a pure function. Locale and time zone come from the options; default is the runtime's. |
| `@pyreon/format` | `@pyreon/core`, `@pyreon/reactivity` | The same names, defaulting to the active locale and zone. Plus the locale API. |
| `@pyreon/format/components` | `@pyreon/core` | `<Num>` and `<DateTime>`. |

## Formatters

| Function | Example (en-US) |
| --- | --- |
| `formatNumber(value, options?)` | `1,234.5` |
| `formatCurrency(value, 'EUR', options?)` | `€9.99` |
| `formatPercent(0.42)` | `42%` |
| `formatCompact(1_240_000)` | `1.2M` |
| `formatUnit(72, 'kilometer-per-hour')` | `72 km/h` |
| `formatBytes(1536)` / `{ binary: true }` | `1.5 kB` / `1.5 KiB` |
| `formatDuration({ hours: 2, minutes: 5 })` | `2 hr, 5 min` |
| `formatDuration(3_905_000, { style: 'digital' })` | `1:05:05` |
| `formatList(['a', 'b', 'c'])` | `a, b, and c` |
| `formatDate` / `formatTime` / `formatDateTime` | `Nov 18, 2026` |
| `formatRelative(-3, 'day')` | `3 days ago` |
| `formatRelativeTo(target, base)` | `in 5 minutes`, `yesterday` |
| `formatDateRange(start, end)` | `Nov 12 – 15, 2026` |
| `formatNumberRange(3, 5)` | `3–5` |

Options are the platform's `Intl` option names plus `locale`, `timeZone` (dates) and `fallback`. A string in place of options is a preset or style shorthand (`'long'`, `'compact'`, `'or'`). Nullish input returns `fallback` (default `''`); invalid input returns it too, with a dev-only warning; a bad option or unknown unit throws a `[Pyreon]` error that says how to fix it.

## Dates: calendar values never shift

`'2026-11-18'` and `'2026-11-18T14:30'` (no offset) are calendar values: they format as that day or clock time in every time zone. A string with `Z` or an offset, a number and a `Date` are instants shown in the active zone.

```ts
formatDate('2026-11-18', { timeZone: 'Pacific/Kiritimati' })      // always the 18th
formatDateTime('2026-11-18T23:30:00Z', { timeZone: 'Asia/Tokyo' }) // an instant: Nov 19, morning
```

## Locale and time zone

```ts
locale()                   // active locale (reactive read)
setLocale('cs')            // app default (client); a warned no-op on the server
provideLocale('de')        // scope a subtree, in a component's setup; or () => i18n.locale()
timeZone() / setTimeZone('Asia/Tokyo') / provideTimeZone('Europe/Prague')
```

Resolution order: explicit `options.locale`, then `provideLocale`, then `setLocale`, then `navigator.language` (client) or the runtime default (server). A formatter called from an event handler outside any component scope sees the app default, not a provided locale.

## Parsing

```ts
parseNumber('1 234,5', { locale: 'cs' })        // 1234.5
parseDate('18. 11. 2026', { locale: 'cs' })     // "2026-11-18"
parseDate('31. 2. 2026', { locale: 'cs' })      // null
```

## Composing formatters

A formatter is a value: a plain `(value) => string` that follows the active locale and time zone like the free functions, so it drops into any formatting callback (`Array#map`, a chart axis, a table column, an `@pyreon/rx` pipe) with no adapter. One factory per kind, each exported on its own (no namespace object, so each tree-shakes): `numberFormatter`, `currencyFormatter`, `percentFormatter`, `compactFormatter`, `unitFormatter`, `bytesFormatter`, `durationFormatter`, `listFormatter`, `dateFormatter`, `timeFormatter`, `dateTimeFormatter`, `relativeFormatter`.

```ts
import { currencyFormatter, bytesFormatter, percentFormatter, listFormatter } from '@pyreon/format'

const price = currencyFormatter('EUR', { locale: 'en-US' })
price(9.99)                                         // "€9.99"
price.range(10, 20)                                 // "€10.00 – €20.00"
price.parts(9.99).map((p) => p.type)                // ["currency", "integer", "decimal", "fraction"]

const rounded = price.with({ maximumFractionDigits: 0 })   // derive; price is untouched
rounded(9.99)                                       // "€10"

const fromCents = price.from((cents: number) => cents / 100)   // adapt the input
fromCents(999)                                      // "€9.99"
;[999, 1250].map(fromCents)                         // ["€9.99", "€12.50"], works as a callback

const size = bytesFormatter({ locale: 'en-US' })
const pct = percentFormatter({ locale: 'en-US' })
const usage = (used: number, total: number) => `${size(used)} of ${size(total)} (${pct(used / total)})`
usage(1536, 4096)                                   // "1.5 kB of 4.1 kB (38%)"

listFormatter({ locale: 'en-US' })([1250, 2500].map(fromCents))   // "€12.50 and €25.00"
```

Every formatter has `with(overrides)`, `from(map)`, `fallback(text)` and `options`; `parts(value)` where `Intl` has parts (numbers, dates, lists, bytes) and `range(a, b)` where it has `formatRange` (numbers and dates). `range` and `parts` are absent from the type where they do not exist. Derived formatters share the underlying cache entries, so creating them in a loop adds nothing. A formatter looks its `Intl` object up once per locale: a call is a locale read, a string compare and one `format()`.

`defineFormats` names a set; each key is a real formatter, and a spec may extend another by name (a typo is a type error, a cycle a `[Pyreon]` error):

```ts
import { defineFormats } from '@pyreon/format'

const f = defineFormats({
  price: { kind: 'currency', currency: 'EUR' },
  priceShort: { extends: 'price', notation: 'compact' },
  size: { kind: 'bytes' },
})
f.price(9.99)
f.priceShort(1_234_567)                // "€1.2M" under en-US
f.price.with({ currency: 'USD' })(9.99)
```

There is deliberately no "per month" currency helper: the platform has no locale data for a currency "per" pattern (only unit formatting has one), and a hand-made pattern is wrong in many languages. Format the value and put it in a translated message (`"{price} per month"`).

`createFormatter({ locale, timeZone })` is a bound, non-reactive set of the one-off functions for servers, scripts and tests.

## Components

```tsx
import { Num, DateTime } from '@pyreon/format/components'

<Num value={total()} kind="currency" currency="EUR" />
<Num value={total()} format={price} />                      // a built formatter
<Num value={9.99} format={price} parts={{ currency: (text) => <sup>{text}</sup> }} />
<DateTime value="2026-11-18" kind="date" format="long" />   // <time datetime="2026-11-18">November 18, 2026</time>
<DateTime value="2026-11-18" format={dateFormatter('long')} parts={{ month: (t) => <b>{t}</b> }} />
```

`parts` keys are the `Intl` part types; unwrapped parts are joined into one text node so server and client markup agree.

## Performance

`Intl.*Format` construction costs microseconds; `format()` on a cached instance is the only real work on the hot path. Tiers: no options (the locale's default formatter), a preset string, an options object (by identity for hoisted objects, then by a structural key for inline literals). Every table is bounded. Hoist option objects and do not mutate them after the first call. Benchmarks (`bench/format-rivals.ts`, `bench/format-reactive.ts`, `bench/format-size.ts`) are runnable; no measured numbers are published yet.

## SSR

`provideLocale` and `provideTimeZone` use the request-scoped context stack on the server, never module state. Intl output is CLDR data and differs between engines and ICU versions, so pass the same locale and time zone on both sides.

## Multiplatform

Tier `web-only` today. A core set of `Intl` calls already lowers natively without this package; mapping these functions onto it is planned.
