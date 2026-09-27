import { computed, signal } from '@pyreon/reactivity'
import { createFormatters } from './formatters'
import { interpolate } from './interpolation'
import { resolvePluralCategory } from './pluralization'
import type { TypedTranslationKey } from './type-helpers'
import type { I18nInstance, I18nOptions, InterpolationValues, TranslationDictionary } from './types'

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
    // OWN keys only: `a.constructor.name` otherwise walked into
    // Object.prototype and resolved to the string 'Object'.
    if (!Object.hasOwn(current, part)) return undefined
    current = current[part] as TranslationDictionary | string
  }

  return typeof current === 'string' ? current : undefined
}

/** Segments that would walk into / write onto a shared prototype. */
function isUnsafeI18nKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype'
}

/**
 * Build the ordered list of key candidates to try, most-specific first,
 * combining `context` (gender/variant) and pluralization (i18next semantics).
 *
 * - count === 0 tries an explicit `_zero` form before the CLDR category, so
 *   English can say "No items" even though CLDR has no `zero` category for `en`.
 * - context combines with plural: `key_male_one`, `key_male`, `key_one`, `key`.
 *
 * Returns `[keyPath]` unchanged when neither context nor count is present.
 */
function buildKeyCandidates(
  keyPath: string,
  locale: string,
  context: string | undefined,
  hasCount: boolean,
  count: number | undefined,
  pluralRules: I18nOptions['pluralRules'],
): string[] {
  if (!context && !hasCount) return [keyPath]

  const suffixes: string[] = []
  if (hasCount) {
    if (count === 0) suffixes.push('zero')
    const category = resolvePluralCategory(locale, count as number, pluralRules)
    if (category !== 'zero') suffixes.push(category)
  }

  const cands: string[] = []
  if (context) {
    for (const s of suffixes) cands.push(`${keyPath}_${context}_${s}`)
    cands.push(`${keyPath}_${context}`)
  }
  for (const s of suffixes) cands.push(`${keyPath}_${s}`)
  cands.push(keyPath)

  // At this point context||count held, so there are always ≥2 candidates;
  // dedupe (a CLDR category that equals an explicit suffix, etc.).
  return [...new Set(cands)]
}

// `$t(key)` / `$t(key, {"count": 2})` — inline reference to another key.
// Linear, ReDoS-safe: capture the inner text with a single non-paren class,
// then split key from optional JSON options in code (no lazy/`\s*` backtracking
// on untrusted translation strings).
const NESTING_RE = /\$t\(([^()]*)\)/g
const MAX_NESTING_DEPTH = 4

/** Per-instance bound on the (locale, namespace, key) resolution cache. */
const RESOLUTION_CACHE_CAP = 2000

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

function isPlainDict(v: unknown): v is TranslationDictionary {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Deep-merge source into target (mutates target). Nested dictionaries are
 * COPIED, never shared by reference, so the store owns every level: a caller
 * mutating its object after `addMessages`/a loader resolved cannot change
 * stored translations, and the unsafe-key filter applies at every depth (a
 * shared nested object used to carry its own `__proto__` key straight in).
 */
function deepMerge(target: TranslationDictionary, source: TranslationDictionary): void {
  for (const key of Object.keys(source)) {
    if (isUnsafeI18nKey(key)) continue
    const sourceVal = source[key]
    if (sourceVal === undefined) continue
    if (isPlainDict(sourceVal)) {
      const targetVal = Object.hasOwn(target, key) ? target[key] : undefined
      const into: TranslationDictionary = isPlainDict(targetVal) ? targetVal : {}
      deepMerge(into, sourceVal)
      target[key] = into
    } else {
      target[key] = sourceVal
    }
  }
}

/**
 * Normalize an INCOMING dictionary (static `messages`, `addMessages`, a
 * loader's result) into a store-owned copy: flat dotted keys expanded, unsafe
 * keys dropped, every level cloned. One funnel, so the three entry points can
 * never disagree about what a dictionary may contain.
 */
function normalizeDict(dict: TranslationDictionary): TranslationDictionary {
  const out: TranslationDictionary = {}
  deepMerge(out, nestFlatKeys(dict))
  return out
}

/**
 * The BCP 47 step-down chain for a tag, most specific first:
 * `zh-Hant-TW` → `zh-Hant-TW`, `zh-Hant`, `zh`. `_` is accepted as a separator
 * too (`en_US`), since it is common in message-file names.
 */
function stepDown(tag: string): string[] {
  const out = [tag]
  let cur = tag
  for (let i = cur.search(/[-_][^-_]*$/); i > 0; i = cur.search(/[-_][^-_]*$/)) {
    cur = cur.slice(0, i)
    out.push(cur)
  }
  return out
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
export function createI18n(options: I18nOptions): I18nInstance
/**
 * OPT-IN typed instance: pass your messages object's type explicitly and the
 * returned instance's `t` accepts only the derived {@link MessageKeys} union
 * (plus any `namespace:key` string — namespaces load at runtime). Purely
 * additive — untyped `createI18n(options)` is unchanged.
 *
 * @example
 * const en = { nav: { home: 'Home' }, items_one: '…', items_other: '…' } as const
 * const i18n = createI18n<typeof en>({ locale: 'en', messages: { en } })
 * i18n.t('nav.home')            // ✓
 * i18n.t('items', { count: 2 }) // ✓ (plural suffix collapsed)
 * // i18n.t('nav.hoem')         // ✗ compile error
 */
export function createI18n<TMessages extends TranslationDictionary>(
  options: I18nOptions,
): I18nInstance<TypedTranslationKey<TMessages>>
export function createI18n(options: I18nOptions): I18nInstance {
  const {
    fallbackLocale,
    loader,
    defaultNamespace = 'common',
    pluralRules,
    onMissingKey,
    numberFormats,
    dateFormats,
    relativeTimeFormats,
    formats,
  } = options

  // Memoized Intl formatter registry (number/date/relative-time + inline specs).
  const formatters = createFormatters({
    fallbackLocale,
    numberFormats,
    dateFormats,
    relativeTimeFormats,
    formats,
  })

  // ── Reactive state ──────────────────────────────────────────────────

  const locale = signal(options.locale)

  // Hoisted once, not rebuilt per `t()`. `interpolate`'s `format` callback is
  // invoked ONLY synchronously inside a `t()` resolution, where the active
  // locale is `locale.peek()` (== the `locale()` read at `resolveTranslation`
  // entry). Allocating `{ format }` + its closure per call was pure garbage on
  // the dominant path — `interpolate` early-returns for a plain string without
  // `{{…}}` and never calls `format` at all.
  const interpolateOptions = {
    format: (value: unknown, spec: string): string =>
      formatters.format(value, spec, locale.peek()),
  }

  // Internal store: locale → namespace → dictionary
  // We use a version counter to trigger reactive updates when messages change,
  // since the store is mutated in place (Object.is would skip same-reference sets).
  const store = new Map<string, Map<string, TranslationDictionary>>()
  const storeVersion = signal(0)
  // Resolution cache: (locale ∥ namespace ∥ keyPath) → resolved string (or
  // `null` for "resolved to not-found"; absent = not yet resolved). `t()` calls
  // `lookupKey` per key AND per plural/context candidate (most of which don't
  // exist), and each miss splits the keyPath + walks the dict — so a page that
  // re-renders the same translated strings paid the full split+walk every time.
  // The result is a pure function of (locale, namespace, keyPath) until the
  // messages for a namespace change, so it is cleared at the two mutation points
  // (`loadNamespace`, `addMessages`). Bounded (leak-class C).
  const resolutionCache = new Map<string, string | null>()

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

  // Step-down chains, memoized per active locale (bounded — the locale can be
  // request-derived on a server). `fallbackLocale` is fixed per instance.
  const chainCache = new Map<string, string[]>()
  function localeChain(loc: string): string[] {
    let chain = chainCache.get(loc)
    if (chain === undefined) {
      const seen = new Set(stepDown(loc))
      if (fallbackLocale) for (const f of stepDown(fallbackLocale)) seen.add(f)
      chain = [...seen]
      if (chainCache.size >= 64) chainCache.clear()
      chainCache.set(loc, chain)
    }
    return chain
  }

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
      nsMap.set(defaultNamespace, normalizeDict(dict))
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
    const cacheKey = `${loc}\0${namespace}\0${keyPath}`
    const cached = resolutionCache.get(cacheKey)
    // `undefined` = not cached; a cached miss is stored as `null`. Single Map
    // lookup — `null !== undefined` distinguishes a cached not-found.
    if (cached !== undefined) {
      // LRU: refresh recency (Map iterates in insertion order).
      resolutionCache.delete(cacheKey)
      resolutionCache.set(cacheKey, cached)
      return cached ?? undefined
    }
    // Miss — resolve for real. The counter now fires per RESOLUTION (it
    // plateaus as the cache warms while `i18n.t` keeps growing), which is the
    // divergence the old comment above anticipated.
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('i18n.lookupKey')
    const nsMap = store.get(loc)
    const dict = nsMap?.get(namespace)
    const result = dict ? resolveKey(dict, keyPath) : undefined
    // LRU-bounded (leak-class C). The old `size < 2000` guard stopped caching
    // FOREVER once 2000 distinct keys had been seen — every later key paid the
    // full split + walk on every call for the life of the instance.
    if (resolutionCache.size >= RESOLUTION_CACHE_CAP) {
      resolutionCache.delete(resolutionCache.keys().next().value as string)
    }
    resolutionCache.set(cacheKey, result ?? null)
    return result
  }

  /**
   * Apply nesting (`$t(key)`) then interpolation (with inline format specs) to
   * a resolved template. Depth-capped to break `a → $t(b) → $t(a)` cycles.
   */
  function finalize(
    template: string,
    values: InterpolationValues | undefined,
    depth: number,
  ): string {
    if (depth < MAX_NESTING_DEPTH && template.includes('$t(')) {
      // Interpolate the TEMPLATE's own text segments and splice each nested
      // result in verbatim. Resolving `$t()` first and interpolating the whole
      // string afterwards re-interpolated the nested OUTPUT — a value that
      // merely looked like `{{secret}}` was substituted a second time.
      let out = ''
      let last = 0
      for (const m of template.matchAll(NESTING_RE)) {
        out += interpolate(template.slice(last, m.index), values, interpolateOptions)
        out += resolveNested(m[1] as string, values, depth)
        last = (m.index as number) + m[0].length
      }
      return out + interpolate(template.slice(last), values, interpolateOptions)
    }
    return interpolate(template, values, interpolateOptions)
  }

  function resolveNested(
    inner: string,
    values: InterpolationValues | undefined,
    depth: number,
  ): string {
    // inner = "key" or "key, {json}" — split on the first comma.
    const commaIdx = inner.indexOf(',')
    const innerKey = (commaIdx === -1 ? inner : inner.slice(0, commaIdx)).trim()
    const jsonOpts = commaIdx === -1 ? undefined : inner.slice(commaIdx + 1).trim()
    let innerValues = values
    if (jsonOpts) {
      try {
        innerValues = { ...values, ...(JSON.parse(jsonOpts) as InterpolationValues) }
      } catch {
        // Malformed inline options — fall back to the parent's values.
      }
    }
    return resolveTranslation(innerKey, innerValues, depth + 1)
  }

  function resolveTranslation(
    key: string,
    values?: InterpolationValues,
    depth = 0,
  ): string {
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

    // Reserved option keys (i18next-style): context (gender/variant) + count.
    const context =
      values && typeof values.context === 'string' && values.context ? values.context : undefined
    const hasCount = !!values && 'count' in values
    const count = hasCount ? Number(values!.count) : undefined

    // Try candidates most-specific first (context × plural × _zero). Resolve
    // ALL candidates in the ACTIVE locale before consulting the fallback — so
    // an active-locale form (even a less-specific one, e.g. `items_other`) beats
    // a fallback-ONLY more-specific form (e.g. `items_zero` present only in the
    // fallback). Per-candidate current-then-fallback (the old order) let a
    // fallback-locale plural form win over an active-locale one — a German user
    // could see the English `items_zero` when German had `items_other`. This is
    // i18next's resolution order (active locale exhausted first).
    //
    // Locales are tried along the BCP 47 step-down chain: `en-US` → `en` →
    // fallbackLocale (itself stepped down). A regional locale with only base-
    // language messages used to skip straight to the fallback.
    const candidates = buildKeyCandidates(keyPath, currentLocale, context, hasCount, count, pluralRules)
    const chain = localeChain(currentLocale)
    for (let li = 0; li < chain.length; li++) {
      const loc = chain[li] as string
      for (const candidate of candidates) {
        // Fires when the active locale missed ALL candidates and we're consulting
        // a less specific / fallback locale. Should be ~0 in well-translated
        // apps; growing = missing translations.
        if (li > 0 && process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('i18n.lookupKey.fallback')
        const result = lookupKey(loc, namespace, candidate)
        if (result !== undefined) return finalize(result, values, depth)
      }
    }

    // Explicit default value (interpolated) before the key-as-fallback.
    const defaultValue = values?.defaultValue
    if (typeof defaultValue === 'string') {
      return finalize(defaultValue, values, depth)
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
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('i18n.t')
    return resolveTranslation(key, values)
  }

  // Intl formatters — read locale() so they re-run reactively on locale change;
  // the underlying Intl.*Format instances are memoized per (locale, options).
  const n = (value: number | bigint, opts?: Intl.NumberFormatOptions | string): string =>
    formatters.n(locale(), value, opts)

  const d = (value: Date | number | string, opts?: Intl.DateTimeFormatOptions | string): string =>
    formatters.d(locale(), value, opts)

  const rt = (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    opts?: Intl.RelativeTimeFormatOptions | string,
  ): string => formatters.rt(locale(), value, unit, opts)

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
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('i18n.namespaceLoad')

    pendingLoads.update((c) => c + 1)

    const promise = loader(targetLocale, namespace)
      .then((dict) => {
        if (dict) {
          // Same normalization as `messages` / `addMessages`: flat dotted keys
          // expanded, unsafe keys dropped, a store-owned copy. Loader output
          // (often fetched from a CDN) skipped all three.
          nsMap.set(namespace, normalizeDict(dict))
          resolutionCache.clear() // messages changed → resolutions may differ
          storeVersion.update((c) => c + 1)
          loadedNsVersion.update((c) => c + 1)
        }
      })
      .finally(() => {
        pendingPromises.delete(cacheKey)
        pendingLoads.update((c) => c - 1)
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

    return localeChain(currentLocale).some(
      (loc) => lookupKey(loc, namespace, keyPath) !== undefined,
    )
  }

  const addMessages = (loc: string, messages: TranslationDictionary, namespace?: string): void => {
    const ns = namespace ?? defaultNamespace
    const nsMap = getNamespaceMap(loc)
    const existing = nsMap.get(ns)

    if (existing) {
      deepMerge(existing, nestFlatKeys(messages))
    } else {
      // Store-owned copy — external mutation cannot corrupt the store.
      nsMap.set(ns, normalizeDict(messages))
    }

    resolutionCache.clear() // messages changed → resolutions may differ
    storeVersion.update((c) => c + 1)
    loadedNsVersion.update((c) => c + 1)
  }

  return {
    t,
    n,
    d,
    rt,
    locale,
    loadNamespace,
    isLoading,
    loadedNamespaces,
    exists,
    addMessages,
    availableLocales,
  }
}
