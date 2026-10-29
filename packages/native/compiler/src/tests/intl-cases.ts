/**
 * The differential table for `Intl` on native (#3980): (formatter, locale,
 * options, value) cases whose WEB output — Node's `Intl`, i.e. V8, the same
 * engine as Chrome — is the oracle the native runtimes are checked against.
 *
 * Two tiers, and the split is the honest part:
 *
 * - `STABLE` cases must match EXACTLY on every platform. They were chosen by
 *   measurement, not by hope: each one agrees between V8 (Node 26, ICU 78 /
 *   CLDR 48), Apple Foundation (macOS 26, where `intl-differential.test.ts`
 *   runs them) and Android's ICU (the API 33 emulator, `IntlDifferentialTest`).
 *   A STABLE case that stops matching is a regression in the lowering — or a
 *   platform data change, which deserves a look either way.
 * - `SWEEP` cases are the broad matrix (many locales × every style). They are
 *   formatted and REPORTED, with a loose tripwire, not asserted case by case:
 *   each platform ships its own CLDR release, so the web does not agree with
 *   itself here either (Safari's JavaScriptCore and V8 differ on ~22% of a
 *   date-style sweep). Measured against V8: iOS (macOS Foundation) 46/240 dates
 *   and 1/72 numbers differ; Android API 33 35/240 and 6/72. Against Safari the
 *   iOS runtime differs on 0/350.
 *
 * Measured divergences worth knowing, all CLDR data, none algorithmic:
 * Apple joins a MEDIUM date and a time with "at" in English and "à" in French
 * where V8 uses ", "; `en-AU` short dates carry a four-digit year on Apple;
 * `en-IN` writes "am" in V8 and "AM" on Apple; `de-AT` groups with a period on
 * Apple and a space in V8; `ja-JP` yen is the fullwidth "￥" in V8 and "¥" on
 * Apple. Android API 33 drops the "at"-style connectors V8 has for long and full
 * dates in several locales (it, pt-BR, sv-SE, cs-CZ, ru-RU, es), and groups
 * four-digit currency amounts where V8 does not (es-ES, it-IT, pl-PL).
 */

export type IntlCaseKind = 'datetime' | 'number'

export interface IntlCase {
  readonly id: string
  readonly kind: IntlCaseKind
  /** `undefined` = the device locale; the table always pins one so it is deterministic. */
  readonly locale: string
  readonly options: Readonly<Record<string, string | number | boolean>>
  readonly value: number
  /** Which entry point builds the formatter (ECMA-402 defaults differ per method). */
  readonly entry?: 'DateTimeFormat' | 'toLocaleDateString' | 'toLocaleTimeString' | 'toLocaleString'
}

/** 2026-10-22T08:00:00Z — 10:00 in Berlin (CEST), a Thursday. */
const T = 1792656000000
/** 1970-01-01T00:00:00Z — 01:00 in Berlin (CET): a single-digit hour, winter time. */
const EPOCH = 0
const BERLIN = { timeZone: 'Europe/Berlin' }

const dt = (
  id: string,
  locale: string,
  options: Record<string, string | number | boolean>,
  value = T,
  entry: IntlCase['entry'] = 'DateTimeFormat',
): IntlCase => ({ id, kind: 'datetime', locale, options: { ...BERLIN, ...options }, value, entry })
const nf = (id: string, locale: string, options: Record<string, string | number | boolean>, value: number): IntlCase => ({
  id,
  kind: 'number',
  locale,
  options,
  value,
})

export const STABLE: readonly IntlCase[] = [
  // The issue's own repro (#3980), and its neighbours.
  dt('de-medium-short', 'de-DE', { dateStyle: 'medium', timeStyle: 'short' }),
  dt('de-long', 'de-DE', { dateStyle: 'long' }),
  dt('de-full-date', 'de-DE', { dateStyle: 'full' }),
  dt('de-short-time-epoch', 'de-DE', { timeStyle: 'short' }, EPOCH),
  dt('en-us-short', 'en-US', { dateStyle: 'short' }),
  dt('en-us-medium', 'en-US', { dateStyle: 'medium' }),
  dt('en-us-long-short', 'en-US', { dateStyle: 'long', timeStyle: 'short' }),
  dt('en-us-time-short', 'en-US', { timeStyle: 'short' }),
  dt('en-gb-full', 'en-GB', { dateStyle: 'full' }),
  dt('es-medium-short', 'es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
  dt('ja-medium', 'ja-JP', { dateStyle: 'medium' }),
  // Component options → the V8 skeleton.
  dt('en-us-ymd', 'en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }),
  dt('en-us-mmm-d-y', 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
  dt('en-us-weekday', 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  dt('de-month-year', 'de-DE', { month: 'long', year: 'numeric' }),
  dt('de-hour-numeric', 'de-DE', { hour: 'numeric', minute: '2-digit' }, EPOCH),
  dt('en-us-hour12-false', 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  dt('en-us-default', 'en-US', {}),
  // UTC — "display a server timestamp in a given zone" with the zone pinned.
  dt('utc-iso-ish', 'en-GB', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }),
  // The toLocale*String defaults.
  dt('tolocaledate-default', 'en-US', {}, T, 'toLocaleDateString'),
  dt('tolocaletime-default', 'de-DE', {}, T, 'toLocaleTimeString'),
  // Numbers.
  nf('en-decimal', 'en-US', {}, 1234567.891),
  nf('de-decimal', 'de-DE', {}, 1234567.891),
  nf('fr-decimal', 'fr-FR', {}, 1234567.891),
  nf('en-usd', 'en-US', { style: 'currency', currency: 'USD' }, 1234.5),
  nf('de-eur', 'de-DE', { style: 'currency', currency: 'EUR' }, 1234.5),
  nf('en-jpy', 'en-US', { style: 'currency', currency: 'JPY' }, 1234.5),
  nf('en-usd-code', 'en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'code' }, 1234.5),
  nf('en-percent', 'en-US', { style: 'percent' }, 0.256),
  nf('de-percent', 'de-DE', { style: 'percent' }, 0.256),
  nf('en-fixed-2', 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }, 3.14159),
  nf('en-min-only', 'en-US', { minimumFractionDigits: 4 }, 1.5),
  nf('en-max-zero', 'en-US', { maximumFractionDigits: 0 }, 2.5),
  nf('en-half-expand-neg', 'en-US', { maximumFractionDigits: 0 }, -2.5),
  nf('en-no-grouping', 'en-US', { useGrouping: false }, 1234567),
  nf('en-min-int', 'en-US', { minimumIntegerDigits: 3 }, 7),
  nf('en-zero', 'en-US', {}, 0),
  nf('en-negative', 'en-US', {}, -42.75),
]

const SWEEP_LOCALES = [
  'en-US', 'en-GB', 'en-AU', 'en-IN', 'de-DE', 'de-AT', 'fr-FR', 'fr-CA', 'es-ES', 'es-MX', 'it-IT', 'pt-BR',
  'nl-NL', 'sv-SE', 'pl-PL', 'cs-CZ', 'ru-RU', 'tr-TR', 'ja-JP', 'ko-KR', 'zh-CN', 'ar-EG', 'he-IL', 'hi-IN',
]
const STYLES = ['full', 'long', 'medium', 'short'] as const

export const SWEEP: readonly IntlCase[] = [
  ...SWEEP_LOCALES.flatMap((l) =>
    STYLES.flatMap((d) => [
      dt(`sweep-${l}-date-${d}`, l, { dateStyle: d }),
      dt(`sweep-${l}-${d}-short`, l, { dateStyle: d, timeStyle: 'short' }),
    ]),
  ),
  ...SWEEP_LOCALES.flatMap((l) => [
    dt(`sweep-${l}-yMMMd`, l, { year: 'numeric', month: 'short', day: 'numeric' }),
    dt(`sweep-${l}-jmm`, l, { hour: 'numeric', minute: '2-digit' }),
    nf(`sweep-${l}-decimal`, l, {}, 1234567.891),
    nf(`sweep-${l}-usd`, l, { style: 'currency', currency: 'USD' }, 1234.5),
    nf(`sweep-${l}-percent`, l, { style: 'percent' }, 0.256),
  ]),
]

/** What the WEB prints for a case — the oracle. */
export function webFormat(c: IntlCase): string {
  const date = new Date(c.value)
  if (c.kind === 'number') return new Intl.NumberFormat(c.locale, c.options).format(c.value)
  switch (c.entry ?? 'DateTimeFormat') {
    case 'toLocaleDateString':
      return date.toLocaleDateString(c.locale, c.options)
    case 'toLocaleTimeString':
      return date.toLocaleTimeString(c.locale, c.options)
    case 'toLocaleString':
      return date.toLocaleString(c.locale, c.options)
    default:
      return new Intl.DateTimeFormat(c.locale, c.options).format(c.value)
  }
}
