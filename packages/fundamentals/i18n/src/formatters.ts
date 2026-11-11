import type {
  DateFormats,
  ListFormats,
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
  listFormats?: ListFormats | undefined
  formats?: NamedFormatters | undefined
}

/** Coerce a date-ish value to a Date for Intl.DateTimeFormat. */
function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Inline `{{val, list}}` items. An array is the list (nullish entries are
 * dropped, the rest coerced with `String` — `Intl.ListFormat` throws on a
 * non-string item). Any other value is a one-item list: a bare string must NOT
 * reach `Intl.ListFormat.format`, which would iterate it character by character.
 */
function toListItems(value: unknown): string[] {
  if (!Array.isArray(value)) return value == null ? [] : [String(value)]
  const items: string[] = []
  for (const item of value) if (item != null) items.push(String(item))
  return items
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
 * Bound on the locales and on the option sets cached per locale. The locale is
 * whatever reaches `t()`/`n()`/`d()` — on a server often request-derived — and
 * option objects can be built per call, so neither is a small finite set
 * (leak-class C). Real apps use a handful of each; on overflow the oldest
 * locale (FIFO) or the whole option table for that locale is dropped.
 */
const FORMATTER_LOCALE_CAP = 64
const FORMATTER_OPTIONS_CAP = 64

/**
 * Formatters of one kind for one locale. `def` is the no-options formatter,
 * `named` is keyed by a named-format / inline-spec name, `byJson` by the
 * `JSON.stringify` of an options object. Separate tables, so no key-prefix
 * string is built per call and a name can never collide with a JSON key.
 */
interface LocaleFormatters<F> {
  def: F | undefined
  named: Map<string, F>
  byJson: Map<string, F>
}

function formatterTable<F>() {
  const byLocale = new Map<string, LocaleFormatters<F>>()
  return (locale: string): LocaleFormatters<F> => {
    let t = byLocale.get(locale)
    if (t === undefined) {
      if (byLocale.size >= FORMATTER_LOCALE_CAP) {
        byLocale.delete(byLocale.keys().next().value as string)
      }
      t = { def: undefined, named: new Map(), byJson: new Map() }
      byLocale.set(locale, t)
    }
    return t
  }
}

function boundedSet<F>(map: Map<string, F>, key: string, f: F): F {
  if (map.size >= FORMATTER_OPTIONS_CAP) map.clear()
  map.set(key, f)
  return f
}

/**
 * Build a memoized Intl formatter registry. Every formatter is cached per
 * (locale, options) so repeated `n()`/`d()`/`rt()` calls (the common case in a
 * rendered list) reuse one `Intl.*Format` instance instead of allocating per
 * call. A named format or no options is a plain table lookup; only an options
 * OBJECT pays a `JSON.stringify` for its key. Pure (no reactivity) —
 * `create-i18n` reads `locale()` around these so the reactivity lives at the
 * instance boundary.
 *
 * `/core`-safe: depends only on `Intl` + the config; no `@pyreon/core` JSX.
 */
export function createFormatters(config: FormatterConfig) {
  const numTable = formatterTable<Intl.NumberFormat>()
  const dtTable = formatterTable<Intl.DateTimeFormat>()
  const rtTable = formatterTable<Intl.RelativeTimeFormat>()
  const listTable = formatterTable<Intl.ListFormat>()

  /** Look up a named format for `locale`, falling back to `fallbackLocale`. */
  function resolveNamed<O>(
    table: Record<string, Record<string, O>> | undefined,
    locale: string,
    name: string,
  ): O | undefined {
    // OWN keys only: an inline spec is translation-author text, and a name
    // like `constructor` / `toString` read an inherited member (`Object`) as
    // if it were a configured format — then handed it to `Intl.*Format`.
    return ownAt(ownAt(table, locale), name) ?? ownAt(ownAt(table, config.fallbackLocale), name)
  }

  function ownAt<V>(obj: Record<string, V> | undefined, key: string | undefined): V | undefined {
    return obj !== undefined && key !== undefined && Object.hasOwn(obj, key) ? obj[key] : undefined
  }

  /**
   * The shared (locale, options) memo for one formatter kind. A string option
   * is a format NAME, resolved to its options only on a cache miss (the
   * resolution is a pure function of the fixed config and the locale).
   */
  function cached<F, O extends object>(
    table: (locale: string) => LocaleFormatters<F>,
    locale: string,
    options: O | string | undefined,
    namedOptions: (name: string) => O,
    make: (locale: string, opts: O) => F,
  ): F {
    const t = table(locale)
    if (options === undefined) return (t.def ??= make(locale, {} as O))
    if (typeof options === 'string') {
      const f = t.named.get(options)
      return f !== undefined ? f : boundedSet(t.named, options, make(locale, namedOptions(options)))
    }
    const key = JSON.stringify(options)
    const f = t.byJson.get(key)
    return f !== undefined ? f : boundedSet(t.byJson, key, make(locale, options))
  }

  const numberFormatter = (locale: string, options?: Intl.NumberFormatOptions | string) =>
    cached(
      numTable,
      locale,
      options,
      (name) => resolveNamed(config.numberFormats, locale, name) ?? {},
      (loc, opts) => new Intl.NumberFormat(loc, opts),
    )

  const dateFormatter = (locale: string, options?: Intl.DateTimeFormatOptions | string) =>
    cached(
      dtTable,
      locale,
      options,
      (name) => resolveNamed(config.dateFormats, locale, name) ?? defaultDateOptions(name),
      (loc, opts) => new Intl.DateTimeFormat(loc, opts),
    )

  const relativeTimeFormatter = (locale: string, options?: Intl.RelativeTimeFormatOptions | string) =>
    cached(
      rtTable,
      locale,
      options,
      (name) => resolveNamed(config.relativeTimeFormats, locale, name) ?? {},
      (loc, opts) => new Intl.RelativeTimeFormat(loc, opts),
    )

  const listFormatter = (locale: string, options?: Intl.ListFormatOptions | string) =>
    cached(
      listTable,
      locale,
      options,
      (name) => resolveNamed(config.listFormats, locale, name) ?? {},
      (loc, opts) => new Intl.ListFormat(loc, opts),
    )

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

  const l = (
    locale: string,
    values: Iterable<string>,
    options?: Intl.ListFormatOptions | string,
  ): string => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('i18n.formatList')
    // A bare string is iterable — `Intl.ListFormat` would join its characters.
    return listFormatter(locale, options).format(typeof values === 'string' ? [values] : values)
  }

  /**
   * Resolve an inline interpolation format spec (`{{val, <spec>}}`).
   * `spec` is the comma-separated text after the key: `number`, `currency`
   * (a named number format), `date` / `time` / `datetime`, `relativetime, day`,
   * `list` / `list, disjunction` / `list, unit, narrow`, or any custom named
   * formatter from `config.formats`.
   *
   * Resolution order: custom `formats` → known builtins → configured named
   * (number/date/relative-time/list) tables → `String(value)`.
   */
  function format(value: unknown, spec: string, locale: string): string {
    return formatParsed(value, parseSpec(spec), locale)
  }

  /** {@link format} with the spec already split by {@link parseSpec}. */
  function formatParsed(value: unknown, spec: ParsedSpec, locale: string): string {
    const { name, unit } = spec
    // 1. Custom named formatter wins.
    const custom = ownAt(config.formats, name)
    if (typeof custom === 'function') return custom(value, locale)

    // 2. Builtin spec names.
    if (name === 'number') return n(locale, value as number)
    if (name === 'date' || name === 'time' || name === 'datetime') {
      // `name` resolves via `defaultDateOptions(name)` inside dateFormatter.
      return d(locale, value as Date | number | string, name)
    }
    if (name === 'relativetime') return rt(locale, Number(value), unit)
    if (name === 'list') return l(locale, toListItems(value), spec.list)

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
    if (resolveNamed(config.listFormats, locale, name) !== undefined) {
      return l(locale, toListItems(value), name)
    }

    // 4. No recognized spec — plain coercion.
    return value == null ? '' : String(value)
  }

  return { n, d, rt, l, format, formatParsed }
}

export type Formatters = ReturnType<typeof createFormatters>

/** An inline format spec split once (see {@link parseSpec}). */
export interface ParsedSpec {
  name: string
  /** `relativetime, <unit>` — default `second`. */
  unit: Intl.RelativeTimeFormatUnit
  /** `list, <type>, <style>` — both optional `Intl.ListFormatOptions` values. */
  list: Intl.ListFormatOptions
}

/**
 * Split an inline format spec (`relativetime, day`, `list, disjunction`) into
 * its name and arguments. Done once per compiled placeholder.
 */
export function parseSpec(spec: string): ParsedSpec {
  // `split(',')` always yields ≥1 element, so `parts[0]` is always a string.
  const parts = spec.split(',').map((p) => p.trim())
  const list: Intl.ListFormatOptions = {}
  if (parts[1]) list.type = parts[1] as Intl.ListFormatType
  if (parts[2]) list.style = parts[2] as Intl.ListFormatStyle
  return { name: parts[0]!, unit: (parts[1] ?? 'second') as Intl.RelativeTimeFormatUnit, list }
}
