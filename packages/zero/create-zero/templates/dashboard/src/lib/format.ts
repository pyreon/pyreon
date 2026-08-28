/**
 * Deterministic formatting for values that render on BOTH sides.
 *
 * `toLocaleString()` with no locale asks the runtime which locale it is. The
 * server answers with the machine's (usually `en-US` on a container) and the
 * browser answers with the visitor's — so `1234.5` is `1,234.5` in the SSR
 * HTML and `1.234,5` for a German visitor, the two renders disagree, and
 * hydration mismatches on text that looks completely ordinary.
 *
 * It is a bug you cannot see in development, because your machine and your dev
 * server share a locale.
 *
 * Pinning the locale makes both sides produce the same string. When you add
 * real i18n, resolve the locale once (from the request on the server, from the
 * same value on the client) and pass it here — the important part is that both
 * passes read the SAME locale, not which one it is.
 */

/** The locale both render passes agree on. */
export const LOCALE = 'en-US'

/** `1234.5` → `1,234.50` — money, identical on the server and in the browser. */
export function formatMoney(value: number): string {
  return value.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** `1234` → `1,234` — counts and totals with no decimal part. */
export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE)
}

/**
 * A date, in a fixed timezone as well as a fixed locale.
 *
 * The locale alone is not enough: a UTC server and a visitor in Berlin
 * disagree about which DAY a late-evening timestamp falls on, so the date can
 * differ by one even when the format matches.
 */
export function formatDate(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toLocaleDateString(LOCALE, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
}
