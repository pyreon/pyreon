import { computed, signal } from '@pyreon/reactivity'
import { interpolate } from './interpolation'
import { resolvePluralCategory } from './pluralization'
import type { I18nInstance, I18nOptions, InterpolationValues, TranslationDictionary } from './types'

const __DEV__: boolean = process.env.NODE_ENV !== 'production'
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Resolve a dot-separated key path in a nested dictionary.
 * E.g. "user.greeting" → dictionary.user.greeting
 */
function resolveKey(dict: TranslationDictionary, keyPath: string): string | undefined {
  const parts = keyPath.split('.')
  let current: TranslationDictionary | string = dict

  for (const part of parts) {
    if (current == null || typeof current === 'string') return undefined
    current = current[part] as TranslationDictionary | string
  }

  return typeof current === 'string' ? current : undefined
}

/** Segments that would walk into / write onto a shared prototype. */
function isUnsafeI18nKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype'
}

/**
 * Convert flat dotted keys into nested objects.
 * `{ 'section.title': 'Report' }` → `{ section: { title: 'Report' } }`
 * Keys that don't contain dots are passed through as-is.
 * Already-nested objects are preserved — only string values with dotted keys are expanded.
 */
function nestFlatKeys(messages: TranslationDictionary): TranslationDictionary {
  const result: TranslationDictionary = {}
  let hasFlatKeys = false

  for (const key of Object.keys(messages)) {
    const value = messages[key]
    if (key.includes('.') && typeof value === 'string') {
      const parts = key.split('.')
      // Prototype-pollution guard. `addMessages` runs nestFlatKeys BEFORE
      // deepMerge, so deepMerge's own __proto__/constructor/prototype
      // filter never sees the DOTTED form. A key like `__proto__.isAdmin`
      // would walk `current = current['__proto__']` (= Object.prototype,
      // since `'__proto__' in current` is always true) and then write
      // onto the shared prototype. App message JSON is routinely fetched
      // from a CDN / community-translation platform — untrusted. Skip the
      // whole key if ANY segment is dangerous.
      if (parts.some(isUnsafeI18nKey)) continue
      hasFlatKeys = true
      let current: TranslationDictionary = result
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i] as string
        if (!(part in current) || typeof current[part] !== 'object') {
          current[part] = {}
        }
        current = current[part] as TranslationDictionary
      }
      current[parts[parts.length - 1] as string] = value
    } else if (value !== undefined && !isUnsafeI18nKey(key)) {
      result[key] = value
    }
  }

  return hasFlatKeys ? result : messages
}

/**
 * Deep-merge source into target (mutates target).
 */
function deepMerge(target: TranslationDictionary, source: TranslationDictionary): void {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    const sourceVal = source[key]
    const targetVal = target[key]
    if (
      typeof sourceVal === 'object' &&
      sourceVal !== null &&
      typeof targetVal === 'object' &&
      targetVal !== null
    ) {
      deepMerge(targetVal as TranslationDictionary, sourceVal as TranslationDictionary)
    } else {
      target[key] = sourceVal!
    }
  }
}

/**
 * Create a reactive i18n instance.
 *
 * @example
 * const i18n = createI18n({
 *   locale: 'en',
 *   fallbackLocale: 'en',
 *   messages: {
 *     en: { greeting: 'Hello {{name}}!' },
 *     de: { greeting: 'Hallo {{name}}!' },
 *   },
 * })
 *
 * // Reactive translation — re-evaluates on locale change
 * i18n.t('greeting', { name: 'Alice' }) // "Hello Alice!"
 * i18n.locale.set('de')
 * i18n.t('greeting', { name: 'Alice' }) // "Hallo Alice!"
 *
 * @example
 * // Async namespace loading
 * const i18n = createI18n({
 *   locale: 'en',
 *   loader: async (locale, namespace) => {
 *     const mod = await import(`./locales/${locale}/${namespace}.json`)
 *     return mod.default
 *   },
 * })
 * await i18n.loadNamespace('auth')
 * i18n.t('auth:errors.invalid') // looks up "errors.invalid" in "auth" namespace
 */
export function createI18n(options: I18nOptions): I18nInstance {
  const { fallbackLocale, loader, defaultNamespace = 'common', pluralRules, onMissingKey } = options

  // ── Reactive state ──────────────────────────────────────────────────

  const locale = signal(options.locale)

  // Internal store: locale → namespace → dictionary
  // We use a version counter to trigger reactive updates when messages change,
  // since the store is mutated in place (Object.is would skip same-reference sets).
  const store = new Map<string, Map<string, TranslationDictionary>>()
  const storeVersion = signal(0)

  // Loading state
  const pendingLoads = signal(0)
  const loadedNsVersion = signal(0)

  // In-flight load promises — deduplicates concurrent loads for the same locale:namespace
  const pendingPromises = new Map<string, Promise<void>>()

  const isLoading = computed(() => pendingLoads() > 0)
  const loadedNamespaces = computed(() => {
    loadedNsVersion()
    const currentLocale = locale()
    const nsMap = store.get(currentLocale)
    return new Set(nsMap ? nsMap.keys() : [])
  })
  const availableLocales = computed(() => {
    storeVersion() // subscribe to store changes
    return [...store.keys()]
  })

  // ── Initialize static messages ──────────────────────────────────────

  if (options.messages) {
    for (const [loc, dict] of Object.entries(options.messages)) {
      const nsMap = new Map<string, TranslationDictionary>()
      // Apply the same flat-key expansion that `addMessages` uses, so
      // the initial `messages` option supports flat `'nav.top': 'top'`
      // keys consistently with later `addMessages` calls. Without this,
      // `createI18n({ messages: { en: { 'nav.top': 'top' } } })` would
      // store the dot-keyed string verbatim and `i18n.t('nav.top')`
      // would split on `.`, navigate `dict['nav']` (undefined), and
      // fall back to returning the key as-is. The bug was invisible
      // because `addMessages` does this conversion (line 315) — so any
      // user passing flat keys via the runtime API worked, but anyone
      // using the canonical `createI18n` initialization saw "key
      // returned as fallback" mystery behavior with no warning.
      nsMap.set(defaultNamespace, nestFlatKeys(dict))
      store.set(loc, nsMap)
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────

  function getNamespaceMap(loc: string): Map<string, TranslationDictionary> {
    let nsMap = store.get(loc)
    if (!nsMap) {
      nsMap = new Map()
      store.set(loc, nsMap)
    }
    return nsMap
  }

  function lookupKey(loc: string, namespace: string, keyPath: string): string | undefined {
    // Per actual lookup invocation. In the current uncached impl this is
    // ~1:1 with `i18n.t` (plus an extra hit when the plural-suffix branch
    // probes both `key_one` and the resolved key). A future cache will
    // diverge: `i18n.lookupKey` will plateau while `i18n.t` keeps growing.
    if (__DEV__) _countSink.__pyreon_count__?.('i18n.lookupKey')
    const nsMap = store.get(loc)
    if (!nsMap) return undefined
    const dict = nsMap.get(namespace)
    if (!dict) return undefined
    return resolveKey(dict, keyPath)
  }

  function resolveTranslation(key: string, values?: InterpolationValues): string {
    // Subscribe to reactive dependencies
    const currentLocale = locale()
    storeVersion()

    // Parse key: "namespace:key.path" or just "key.path"
    let namespace = defaultNamespace
    let keyPath = key

    const colonIndex = key.indexOf(':')
    if (colonIndex > 0) {
      namespace = key.slice(0, colonIndex)
      keyPath = key.slice(colonIndex + 1)
    }

    // Handle pluralization: if values contain `count`, try plural suffixes
    if (values && 'count' in values) {
      const count = Number(values.count)
      const category = resolvePluralCategory(currentLocale, count, pluralRules)

      // Try exact form first (e.g. "items_one"), then fall back to base key
      const pluralKey = `${keyPath}_${category}`
      let pluralResult = lookupKey(currentLocale, namespace, pluralKey)
      if (pluralResult === undefined && fallbackLocale) {
        // Fires when the user-locale missed AND we're consulting fallbackLocale.
        // Should be ~0 in well-translated apps; growing = missing translations.
        if (__DEV__) _countSink.__pyreon_count__?.('i18n.lookupKey.fallback')
        pluralResult = lookupKey(fallbackLocale, namespace, pluralKey)
      }

      if (pluralResult) {
        return interpolate(pluralResult, values)
      }
    }

    // Standard lookup: current locale → fallback locale
    let result = lookupKey(currentLocale, namespace, keyPath)
    if (result === undefined && fallbackLocale) {
      if (__DEV__) _countSink.__pyreon_count__?.('i18n.lookupKey.fallback')
      result = lookupKey(fallbackLocale, namespace, keyPath)
    }

    if (result !== undefined) {
      return interpolate(result, values)
    }

    // Missing key handler
    if (onMissingKey) {
      const custom = onMissingKey(currentLocale, key, namespace)
      if (custom !== undefined) return custom!
    }

    // Return the key itself as a visual fallback
    return key
  }

  // ── Public API ──────────────────────────────────────────────────────

  const t = (key: string, values?: InterpolationValues): string => {
    // THE primary i18n hot counter — every `t()` invocation. Scales with
    // the density of localized text on the page. Pair with
    // `i18n.lookupKey` and `i18n.interpolate` for the per-call cost
    // breakdown.
    if (__DEV__) _countSink.__pyreon_count__?.('i18n.t')
    return resolveTranslation(key, values)
  }

  const loadNamespace = async (namespace: string, loc?: string): Promise<void> => {
    if (!loader) return

    const targetLocale = loc ?? locale.peek()
    const cacheKey = `${targetLocale}:${namespace}`
    const nsMap = getNamespaceMap(targetLocale)

    // Skip if already loaded
    if (nsMap.has(namespace)) return

    // Deduplicate concurrent loads for the same locale:namespace
    const existing = pendingPromises.get(cacheKey)
    if (existing) return existing

    // Post-dedup: this counts ACTUAL fetches triggered. Re-loading an already
    // -loaded namespace short-circuits at `nsMap.has(namespace)` above, and
    // a concurrent load short-circuits via `pendingPromises`. Growing across
    // route navigations to the SAME namespace = leak (something is clearing
    // the loaded set between navigations).
    if (__DEV__) _countSink.__pyreon_count__?.('i18n.namespaceLoad')

    pendingLoads.update((n) => n + 1)

    const promise = loader(targetLocale, namespace)
      .then((dict) => {
        if (dict) {
          nsMap.set(namespace, dict)
          storeVersion.update((n) => n + 1)
          loadedNsVersion.update((n) => n + 1)
        }
      })
      .finally(() => {
        pendingPromises.delete(cacheKey)
        pendingLoads.update((n) => n - 1)
      })

    pendingPromises.set(cacheKey, promise)
    return promise
  }

  const exists = (key: string): boolean => {
    const currentLocale = locale.peek()

    let namespace = defaultNamespace
    let keyPath = key
    const colonIndex = key.indexOf(':')
    if (colonIndex > 0) {
      namespace = key.slice(0, colonIndex)
      keyPath = key.slice(colonIndex + 1)
    }

    return (
      lookupKey(currentLocale, namespace, keyPath) !== undefined ||
      (fallbackLocale ? lookupKey(fallbackLocale, namespace, keyPath) !== undefined : false)
    )
  }

  const addMessages = (loc: string, messages: TranslationDictionary, namespace?: string): void => {
    const ns = namespace ?? defaultNamespace
    const nsMap = getNamespaceMap(loc)
    const nested = nestFlatKeys(messages)
    const existing = nsMap.get(ns)

    if (existing) {
      deepMerge(existing, nested)
    } else {
      // Deep-clone to prevent external mutation from corrupting the store
      const cloned: TranslationDictionary = {}
      deepMerge(cloned, nested)
      nsMap.set(ns, cloned)
    }

    storeVersion.update((n) => n + 1)
    loadedNsVersion.update((n) => n + 1)
  }

  return {
    t,
    locale,
    loadNamespace,
    isLoading,
    loadedNamespaces,
    exists,
    addMessages,
    availableLocales,
  }
}
