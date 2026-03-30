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

/** Interpolation values for translation strings. */
export type InterpolationValues = Record<string, string | number>

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
   */
  onMissingKey?: (locale: string, key: string, namespace?: string) => string | undefined
}

/** The public i18n instance returned by `createI18n()`. */
export interface I18nInstance {
  /**
   * Translate a key with optional interpolation.
   * Reads the current locale reactively — re-evaluates in effects/computeds.
   *
   * Key format: "key" (uses default namespace) or "namespace:key".
   * Nested keys use dots: "user.greeting" or "auth:errors.invalid".
   *
   * Interpolation: "Hello {{name}}" + { name: "Alice" } → "Hello Alice"
   * Pluralization: key with "_one", "_other" etc. suffixes + { count: N }
   */
  t: (key: string, values?: InterpolationValues) => string

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
