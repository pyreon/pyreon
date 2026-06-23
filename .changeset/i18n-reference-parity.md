---
'@pyreon/i18n': minor
---

feat(i18n)!: Intl number/date/relative-time formatters + inline format specifiers + context/`_zero`/`defaultValue`/`$t()` nesting + `<Trans>` context

Closes the biggest reference-parity gaps vs i18next / vue-i18n / formatjs. Empirically motivated: ~10 example files were hand-rolling `Intl.NumberFormat` / `Intl.DateTimeFormat` to work around the missing formatting API.

**New — Intl formatters on the instance (available from both `@pyreon/i18n` and `/core`):**

- `n(value, options?)` — `Intl.NumberFormat` (currency/percent/units, or a named `numberFormats` entry).
- `d(value, options?)` — `Intl.DateTimeFormat` (accepts `Date` / epoch-ms / string, or a named `dateFormats` entry).
- `rt(value, unit, options?)` — `Intl.RelativeTimeFormat`.

All three read `locale()` so they re-run reactively on locale change, and memoize the underlying `Intl.*Format` per `(locale, options)`. Configure reusable per-locale named formats via `numberFormats` / `dateFormats` / `relativeTimeFormats` (vue-i18n style, with fallback-locale resolution) and custom inline formatters via `formats`.

**New — `t()` message resolution:**

- **Inline format specifiers**: `"{{amount, currency}}"`, `"{{when, date}}"`, `"{{n, relativetime, day}}"`, plus custom named formats — wired to the formatters.
- **`context`** (gender/variant): `t(key, { context: 'male' })` with i18next resolution order (`key_male_one` → `key_male` → `key_one` → `key`).
- **`_zero`** plural special-case: `count === 0` tries `key_zero` before the CLDR category.
- **`defaultValue`**: returned (and interpolated) when the key is missing, before the key-as-fallback.
- **`$t(key)` nesting**: inline references to other keys (inherits parent values; merges inline JSON options; depth-capped at 4 to break cycles).

**`<Trans>`**: now reads `t` from the nearest `<I18nProvider>` via `useI18n()` — the `t` prop is optional (pass it only to override the context instance or render provider-less).

**BREAKING** — `<I18nProvider>`'s prop is renamed `instance` → `value`, matching `<PermissionsProvider value={…}>` and what the manifest already documented. Update `<I18nProvider instance={i18n}>` → `<I18nProvider value={i18n}>`.

`interpolate()` gained an optional 3rd `{ format }` param (additive); `InterpolationValues` now also accepts `Date`/`boolean`/`bigint` values (additive).
