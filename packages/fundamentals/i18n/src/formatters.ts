import type {
  DateFormats,
  NamedFormatters,
  NumberFormats,
  RelativeTimeFormats,
} from './types'

const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/** Config the formatter registry needs (subset of I18nOptions). */
export interface FormatterConfig {
  fallbackLocale?: string | undefined
  numberFormats?: NumberFormats | undefined
  dateFormats?: DateFormats | undefined
  relativeTimeFormats?: RelativeTimeFormats | undefined
  formats?: NamedFormatters | undefined
}

/** Coerce a date-ish value to a Date for Intl.DateTimeFormat. */
function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Default DateTimeFormat options for the bare inline specs `date` / `time` /
 * `datetime` (when no named format is configured). Mirrors the sensible
 * mid-weight defaults i18next/vue-i18n ship.
 */
function defaultDateOptions(name: string): Intl.DateTimeFormatOptions {
  if (name === 'time') return { timeStyle: 'medium' }
  if (name === 'datetime') return { dateStyle: 'medium', timeStyle: 'short' }
  return { dateStyle: 'medium' }
}

/**
 * Build a memoized Intl formatter registry. Every formatter is cached by
 * `${locale}|${optionsKey}` so repeated `n()`/`d()`/`rt()` calls (the common
 * case in a rendered list) reuse one `Intl.*Format` instance instead of
 * allocating per call. Pure (no reactivity) — `create-i18n` reads `locale()`
 * around these so the reactivity lives at the instance boundary.
 *
 * `/core`-safe: depends only on `Intl` + the config; no `@pyreon/core` JSX.
 */
export function createFormatters(config: FormatterConfig) {
  const numCache = new Map<string, Intl.NumberFormat>()
  const dtCache = new Map<string, Intl.DateTimeFormat>()
  const rtCache = new Map<string, Intl.RelativeTimeFormat>()

  /** Look up a named format for `locale`, falling back to `fallbackLocale`. */
  function resolveNamed<O>(
    table: Record<string, Record<string, O>> | undefined,
    locale: string,
    name: string,
  ): O | undefined {
    return (
      table?.[locale]?.[name] ??
      (config.fallbackLocale ? table?.[config.fallbackLocale]?.[name] : undefined)
    )
  }

  function numberFormatter(locale: string, options?: Intl.NumberFormatOptions | string) {
    const opts =
      typeof options === 'string' ? (resolveNamed(config.numberFormats, locale, options) ?? {}) : (options ?? {})
    const key = `${locale}|${typeof options === 'string' ? `@${options}` : JSON.stringify(opts)}`
    let f = numCache.get(key)
    if (!f) {
      f = new Intl.NumberFormat(locale, opts)
      numCache.set(key, f)
    }
    return f
  }

  function dateFormatter(locale: string, options?: Intl.DateTimeFormatOptions | string) {
    const opts =
      typeof options === 'string'
        ? (resolveNamed(config.dateFormats, locale, options) ?? defaultDateOptions(options))
        : (options ?? {})
    const key = `${locale}|${typeof options === 'string' ? `@${options}` : JSON.stringify(opts)}`
    let f = dtCache.get(key)
    if (!f) {
      f = new Intl.DateTimeFormat(locale, opts)
      dtCache.set(key, f)
    }
    return f
  }

  function relativeTimeFormatter(locale: string, options?: Intl.RelativeTimeFormatOptions | string) {
    const opts =
      typeof options === 'string'
        ? (resolveNamed(config.relativeTimeFormats, locale, options) ?? {})
        : (options ?? {})
    const key = `${locale}|${typeof options === 'string' ? `@${options}` : JSON.stringify(opts)}`
    let f = rtCache.get(key)
    if (!f) {
      f = new Intl.RelativeTimeFormat(locale, opts)
      rtCache.set(key, f)
    }
    return f
  }

  const n = (locale: string, value: number | bigint, options?: Intl.NumberFormatOptions | string): string => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('i18n.formatNumber')
    return numberFormatter(locale, options).format(value)
  }

  const d = (
    locale: string,
    value: Date | number | string,
    options?: Intl.DateTimeFormatOptions | string,
  ): string => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('i18n.formatDate')
    return dateFormatter(locale, options).format(toDate(value))
  }

  const rt = (
    locale: string,
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions | string,
  ): string => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('i18n.formatRelativeTime')
    return relativeTimeFormatter(locale, options).format(value, unit)
  }

  /**
   * Resolve an inline interpolation format spec (`{{val, <spec>}}`).
   * `spec` is the comma-separated text after the key: `number`, `currency`
   * (a named number format), `date` / `time` / `datetime`, `relativetime, day`,
   * or any custom named formatter from `config.formats`.
   *
   * Resolution order: custom `formats` → known builtins → configured named
   * (number/date/relative-time) tables → `String(value)`.
   */
  function format(value: unknown, spec: string, locale: string): string {
    // `split(',')` always yields ≥1 element, so `parts[0]` is always a string.
    const parts = spec.split(',').map((p) => p.trim())
    const name = parts[0]!
    const unit = (parts[1] ?? 'second') as Intl.RelativeTimeFormatUnit

    // 1. Custom named formatter wins.
    const custom = config.formats?.[name]
    if (custom) return custom(value, locale)

    // 2. Builtin spec names.
    if (name === 'number') return n(locale, value as number)
    if (name === 'date' || name === 'time' || name === 'datetime') {
      // `name` resolves via `defaultDateOptions(name)` inside dateFormatter.
      return d(locale, value as Date | number | string, name)
    }
    if (name === 'relativetime') return rt(locale, Number(value), unit)

    // 3. Configured named formats (number → date → relative-time tables).
    if (resolveNamed(config.numberFormats, locale, name) !== undefined) {
      return n(locale, value as number, name)
    }
    if (resolveNamed(config.dateFormats, locale, name) !== undefined) {
      return d(locale, value as Date | number | string, name)
    }
    if (resolveNamed(config.relativeTimeFormats, locale, name) !== undefined) {
      return rt(locale, Number(value), unit, name)
    }

    // 4. No recognized spec — plain coercion.
    return value == null ? '' : String(value)
  }

  return { n, d, rt, format }
}

export type Formatters = ReturnType<typeof createFormatters>
