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

## Named formats and bound formatters

```ts
import { defineFormats, createFormatter } from '@pyreon/format'

const f = defineFormats({
  price: { kind: 'currency', currency: 'EUR' },
  size: { kind: 'bytes' },
})
f.price(9.99)                    // keys, value types and overrides are inferred
f.price(9.99, { currency: 'USD' })

const server = createFormatter({ locale: 'cs', timeZone: 'Europe/Prague' }) // non-reactive
server.number(1234.5)
```

## Components

```tsx
import { Num, DateTime } from '@pyreon/format/components'

<Num value={total()} kind="currency" currency="EUR" />
<DateTime value="2026-11-18" kind="date" format="long" />   // <time datetime="2026-11-18">November 18, 2026</time>
```

## Performance

`Intl.*Format` construction costs microseconds; `format()` on a cached instance is the only real work on the hot path. Tiers: no options (the locale's default formatter), a preset string, an options object (by identity for hoisted objects, then by a structural key for inline literals). Every table is bounded. Hoist option objects and do not mutate them after the first call. Measurements and the bench: see `bench/format-bench.ts`.

## SSR

`provideLocale` and `provideTimeZone` use the request-scoped context stack on the server, never module state. Intl output is CLDR data and differs between engines and ICU versions, so pass the same locale and time zone on both sides.

## Multiplatform

Tier `web-only` today. A core set of `Intl` calls already lowers natively without this package; mapping these functions onto it is planned.
