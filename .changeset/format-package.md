---
"@pyreon/format": minor
---

New package `@pyreon/format` (Experimental): locale-aware formatting and parsing as plain functions over `Intl`.

- **Formatters:** `formatNumber`, `formatCurrency`, `formatPercent`, `formatCompact`, `formatUnit`, `formatBytes` (decimal `1.5 kB` or binary `1.5 KiB`, never `1000 kB`), `formatDuration` (`Intl.DurationFormat` with an equivalent fallback; `long`, `short`, `narrow`, `digital`), `formatList`, `formatDate`, `formatTime`, `formatDateTime`, `formatRelative`, `formatRelativeTo`, `formatDateRange`, `formatNumberRange`, `formatNumberToParts`, `formatDateToParts`.
- **Parsers:** `parseNumber` (the locale's digits, separators and typed variants; `null` for anything else) and `parseDate` (numeric dates in the locale's order, impossible dates rejected, a stated two-digit-year rule).
- **Reactive without ceremony:** `@pyreon/format` reads the active locale and time zone (`locale`, `setLocale`, `provideLocale`, `timeZone`, `setTimeZone`, `provideTimeZone`), so a formatter in an effect, computed or JSX binding updates when they change. `provideLocale` is request-scoped on the server.
- **Calendar dates never shift:** a date-only string (`2026-11-18`) or a date-time without offset formats as that day or wall-clock time in every time zone.
- **Never throws on data:** nullish input returns the `fallback`; invalid input returns it with a dev-only `[Pyreon]` warning. A bad option or unknown unit throws a `[Pyreon]` error that says how to fix it.
- **Cached:** every `Intl.*Format` is cached in three bounded tiers (no options, preset string, options object by identity then structural key).
- **Entries:** `@pyreon/format/core` (pure, no `@pyreon/*` import), `@pyreon/format` (reactive, plus `defineFormats`) and `@pyreon/format/components` (`<Num>`, `<DateTime>`).
- **Composable formatters:** one exported factory per kind (`numberFormatter`, `currencyFormatter`, `percentFormatter`, `compactFormatter`, `unitFormatter`, `bytesFormatter`, `durationFormatter`, `listFormatter`, `dateFormatter`, `timeFormatter`, `dateTimeFormatter`, `relativeFormatter`). A `Formatter` is a plain `(value) => string` (so it works as a callback) with `with(overrides)`, `from(map)`, `fallback(text)`, `options`, and `parts` / `range` where `Intl` has them. `<Num>` and `<DateTime>` accept `format={formatter}` and a typed `parts` map to wrap a part.
- `defineFormats` names a format set; each key is a real `Formatter`, and a spec may `extends` another by name. `createFormatter` gives a bound non-reactive set of one-off functions for servers, scripts and tests.
