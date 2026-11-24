/**
 * The active locale and time zone of the reactive entry. They live in `@pyreon/ambient`, which owns every ambient value
 * (locale, time zone, clock), so an app with `@pyreon/format` and `@pyreon/time` has one locale, one zone and one clock.
 * This module only re-exports them (and the `resetLocaleState` test hook) so the rest of the package imports one place.
 *
 * Resolution order for the locale: explicit `options.locale`, the nearest `provideLocale`, the app default from `setLocale`,
 * then `navigator.language` on the client / the runtime default on the server. The time zone follows the same order with
 * `setTimeZone` / `provideTimeZone`, ending at the runtime zone. A bad locale that reaches a formatter at read time (a
 * provided accessor) is validated there: it warns once and falls back to the runtime default (`construct` in `cache.ts`).
 */
export { activeZone, locale, provideLocale, provideTimeZone, setLocale, setTimeZone, timeZone } from '@pyreon/ambient'
export { resetLocaleState } from '@pyreon/ambient/testing'
