import type { Computed, Signal } from '@pyreon/reactivity'

/** A nested dictionary of translation strings. */
export type TranslationDictionary = {
  [key: string]: string | TranslationDictionary
}

/** Map of locale → dictionary (or namespace → dictionary). */
export type TranslationMessages = Record<string, TranslationDictionary>

/**
 * Async function that loads translations for a locale and namespace.
 * Return the dictionary for that namespace, or undefined if not found.
 */
export type NamespaceLoader = (
  locale: string,
  namespace: string,
) => Promise<TranslationDictionary | undefined>

/**
 * A single interpolation value. Strings/numbers render directly; `Date` is
 * formatted when an inline `{{when, date}}` spec is present; objects/arrays are
 * JSON-stringified by the interpolator.
 */
export type InterpolationValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | null
  | undefined
  | readonly InterpolationValue[]
  | { readonly [key: string]: InterpolationValue }

/**
 * Interpolation values for translation strings. May also carry the reserved
 * option keys read by `t()`:
 * - `count` — drives pluralization (`key_one` / `key_other` / `key_zero`).
 * - `context` — gender/variant selector (`key_male`, combined with plural).
 * - `defaultValue` — returned (interpolated) when the key is missing.
 */
export type InterpolationValues = Record<string, InterpolationValue>

/** Per-locale named `Intl.NumberFormat` options: `{ en: { currency: {...} } }`. */
export type NumberFormats = Record<string, Record<string, Intl.NumberFormatOptions>>

/** Per-locale named `Intl.DateTimeFormat` options: `{ en: { short: {...} } }`. */
export type DateFormats = Record<string, Record<string, Intl.DateTimeFormatOptions>>

/** Per-locale named `Intl.RelativeTimeFormat` options. */
export type RelativeTimeFormats = Record<string, Record<string, Intl.RelativeTimeFormatOptions>>

/** Custom named formatters usable inline (`{{val, myFormat}}`) and standalone. */
export type NamedFormatters = Record<string, (value: unknown, locale: string) => string>

/** Pluralization rules map — locale → function that picks the plural form. */
export type PluralRules = Record<string, (count: number) => string>

/** Options for creating an i18n instance. */
export interface I18nOptions {
  /** The initial locale (e.g. "en"). */
  locale: string
  /** Fallback locale used when a key is missing in the active locale. */
  fallbackLocale?: string
  /** Static messages keyed by locale. */
  messages?: Record<string, TranslationDictionary>
  /**
   * Async loader for namespace-based translation loading.
   * Called with (locale, namespace) when `loadNamespace()` is invoked.
   */
  loader?: NamespaceLoader
  /**
   * Default namespace used when `t()` is called without a namespace prefix.
   * Defaults to "common".
   */
  defaultNamespace?: string
  /**
   * Custom plural rules per locale.
   * If not provided, uses `Intl.PluralRules` where available.
   */
  pluralRules?: PluralRules
  /**
   * Missing key handler — called when a translation key is not found.
   * Useful for logging, reporting, or returning a custom fallback.
   * Note: a `defaultValue` passed to `t()` takes priority over this.
   */
  onMissingKey?: (locale: string, key: string, namespace?: string) => string | undefined
  /**
   * Per-locale named `Intl.NumberFormat` options. Use the name in `n()` or
   * inline: `numberFormats: { en: { currency: { style: 'currency', currency: 'USD' } } }`
   * → `i18n.n(9.99, 'currency')` / `"{{price, currency}}"`.
   */
  numberFormats?: NumberFormats
  /** Per-locale named `Intl.DateTimeFormat` options — see {@link numberFormats}. */
  dateFormats?: DateFormats
  /** Per-locale named `Intl.RelativeTimeFormat` options — see {@link numberFormats}. */
  relativeTimeFormats?: RelativeTimeFormats
  /**
   * Custom named formatters. Usable inline (`"{{val, myFormat}}"`) — receive the
   * raw value + current locale and return a string. Take priority over builtins.
   */
  formats?: NamedFormatters
}

/**
 * The public i18n instance returned by `createI18n()`.
 *
 * `TKey` is the accepted translation-key type — `string` by default (fully
 * back-compatible). The opt-in typed pattern narrows it to the message-key
 * union derived from your messages object (see `MessageKeys` /
 * `createI18n<typeof en>(...)`), so a mistyped key is a compile error.
 * `t` is declared METHOD-style (bivariant) so a typed instance stays
 * assignable where the untyped `I18nInstance` is expected (`I18nProvider`).
 */
export interface I18nInstance<TKey extends string = string> {
  /**
   * Translate a key with optional interpolation.
   * Reads the current locale reactively — re-evaluates in effects/computeds.
   *
   * Key format: "key" (uses default namespace) or "namespace:key".
   * Nested keys use dots: "user.greeting" or "auth:errors.invalid".
   *
   * Interpolation: "Hello {{name}}" + { name: "Alice" } → "Hello Alice"
   * Inline formats: "Total {{amount, currency}}" / "{{when, date}}" / "{{n, relativetime, day}}"
   * Pluralization: key with "_one", "_other", "_zero" suffixes + { count: N }
   * Context/gender: { context: 'male' } → tries "key_male" (combined with plural)
   * Default value: { defaultValue: 'Fallback' } returned (interpolated) if missing
   * Nesting: "Hello $t(common:appName)" resolves the referenced key inline
   */
  t(key: TKey, values?: InterpolationValues): string

  /**
   * Format a number for the current locale via `Intl.NumberFormat`.
   * Reactive — re-runs on locale change. `options` is an
   * `Intl.NumberFormatOptions` object OR the name of a configured
   * `numberFormats` entry. Formatters are memoized per (locale, options).
   *
   * @example i18n.n(1234.5)            // "1,234.5"
   * @example i18n.n(9.99, 'currency')  // "$9.99"  (named format)
   * @example i18n.n(0.42, { style: 'percent' }) // "42%"
   */
  n: (value: number | bigint, options?: Intl.NumberFormatOptions | string) => string

  /**
   * Format a date for the current locale via `Intl.DateTimeFormat`.
   * Accepts a `Date`, epoch ms number, or parseable string. Reactive +
   * memoized. `options` is an `Intl.DateTimeFormatOptions` object or a
   * configured `dateFormats` name.
   *
   * @example i18n.d(Date.now(), { dateStyle: 'medium' })
   * @example i18n.d(post.publishedAt, 'short') // named format
   */
  d: (value: Date | number | string, options?: Intl.DateTimeFormatOptions | string) => string

  /**
   * Format a relative time for the current locale via `Intl.RelativeTimeFormat`.
   * Reactive + memoized.
   *
   * @example i18n.rt(-3, 'day')  // "3 days ago"
   * @example i18n.rt(2, 'hour', { numeric: 'auto' }) // "in 2 hours"
   */
  rt: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions | string,
  ) => string

  /** Current locale (reactive signal). */
  locale: Signal<string>

  /**
   * Load a namespace's translations for the given locale (or current locale).
   * Returns a promise that resolves when loading is complete.
   */
  loadNamespace: (namespace: string, locale?: string) => Promise<void>

  /**
   * Whether any namespace is currently being loaded.
   */
  isLoading: Computed<boolean>

  /**
   * Set of namespaces that have been loaded for the current locale.
   */
  loadedNamespaces: Computed<Set<string>>

  /**
   * Check if a translation key exists in the current locale.
   */
  exists: (key: string) => boolean

  /**
   * Add translations for a locale (merged with existing).
   * Useful for adding translations at runtime without async loading.
   */
  addMessages: (locale: string, messages: TranslationDictionary, namespace?: string) => void

  /**
   * Get all available locales (those with any registered messages).
   */
  availableLocales: Computed<string[]>
}
