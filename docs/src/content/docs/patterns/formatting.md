---
title: "Formatting numbers, dates and money"
summary: "Use @pyreon/format: plain functions that follow the active locale and time zone. Never toLocaleString or new Intl.*Format inside a component, and never build money by concatenation."
seeAlso: [reactive-context, ssr-safe-hooks]
---

## The pattern

Format with `@pyreon/format`. Every function reads the active locale (and time zone), so a binding updates when `setLocale` or a provided locale changes, and on the server the locale is request-scoped.

```tsx
import { formatCurrency, formatBytes, formatDate, formatRelativeTo, setLocale } from '@pyreon/format'

function Order(props: { total: number; size: number; placed: string; now: number }) {
  return (
    <ul>
      <li>{formatCurrency(props.total, 'EUR')}</li>
      <li>{formatBytes(props.size)}</li>
      <li>{formatDate(props.placed, 'long')}</li>
      <li>{formatRelativeTo(props.placed, props.now)}</li>
    </ul>
  )
}

setLocale('de') // every binding above re-renders in German
```

Reuse a configuration with a formatter (a plain `(value) => string`, so it is also an `Array#map` callback):

```ts
import { currencyFormatter } from '@pyreon/format'

const price = currencyFormatter('EUR')
const fromCents = price.from((cents: number) => cents / 100)
orders.map(fromCents)
```

Parse what the user types with `parseNumber`, `parseCurrency` and `parseDate`, in the locale they typed it in.

## Anti-pattern

- **`value.toLocaleString('en-US', ...)` or `new Intl.NumberFormat(...)` in a component body or JSX.** A component runs once, so the locale is captured once and a later `setLocale` never reaches the text. A formatter built in the body is constructed on every render (tens of microseconds each), which is the dominant cost of a list row. `@pyreon/format` caches the `Intl` object per locale and options, and the call reads the locale reactively.
- **`toLocaleString()` with no locale on the server and the client.** The server formats with its locale and the browser with the user's: the HTML and the first client render differ and hydration mismatches. Provide the same locale on both sides (`provideLocale`).
- **Money built by concatenation** (`'€' + price.toFixed(2)`, `` `${n} USD` ``). The symbol position, spacing, decimal and group separators and the minor-unit digits are per locale and per currency (`JPY` has none). Use `formatCurrency` or a `currencyFormatter`.
- **`new Date('2026-11-18')` for a calendar date.** That is midnight UTC, so it shows the 17th west of Greenwich. Pass the string to `formatDate`: a date-only string is a calendar date and shows the same day in every zone.
- **A `setInterval` (or `useTimeAgo`) per row to keep "3 minutes ago" fresh.** Each instance owns a timer that fires on its own phase, and 200 rows are 200 timers. `useRelativeTime(target)` (or `<RelativeTime value={…} />`) shares two timers across every label on the page, updates at the moment the text changes, switches to an absolute date with `threshold: { after: { days: 7 } }`, and prints the request's clock on the server without starting a timer.
- **A "per month" currency pattern assembled by hand** (`price + '/mo'`). There is no locale data for that pattern outside unit formatting. Format the value and put it in a translated message (`"{price} per month"`).

## Related

- Reference API: `formatNumber`, `formatCurrency`, `formatDate`, `defineFormats` - see `get_api({ package: "format", symbol: "..." })`
- Anti-pattern: "Locale-dependent formatting in a component body" in the library API-shape category
- The [Format guide](/docs/format) covers every function, parsing, recipes and a "coming from" table.
