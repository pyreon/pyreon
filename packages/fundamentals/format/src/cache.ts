/**
 * The formatter cache: one bounded table per formatter kind, keyed
 * locale → variant → slot, with three lookup tiers inside a slot:
 *
 *  1. no options            → `slot.def`, the locale's default formatter
 *  2. a string preset       → `slot.named`, a per-slot `Map<string, F>`
 *  3. an options object     → `slot.weak` (identity: hoisted / `const` option
 *                             objects), then `slot.keyed` (a structural key
 *                             built without `JSON.stringify`, for inline
 *                             literals), then construct.
 *
 * `Intl.*Format` construction costs microseconds; a cached `format()` call is
 * the only real work on the hot path. A lookup allocates nothing for tiers 1
 * and 2 and for an identity hit; an inline literal allocates its key string.
 *
 * Every table is bounded (leak class C): locales FIFO, variants FIFO, presets
 * FIFO, structural keys FIFO. The WeakMap holds option objects weakly, so it
 * cannot outlive the caller's objects.
 *
 * `variant` is the second axis a formatter depends on besides the locale: the
 * time zone for dates, the currency for currency, the unit for units, `''`
 * elsewhere.
 */

/** Bound on cached locales per table. A locale can be request data, so it is bounded. */
export const LOCALE_CAP = 64
/** Bound on variants (zones / currencies / units) per locale. */
export const VARIANT_CAP = 64
/** Bound on preset names and on structural option keys per slot. */
export const OPTIONS_CAP = 64

export interface Slot<F> {
  def: F | undefined
  named: Map<string, F> | undefined
  weak: WeakMap<object, F> | undefined
  keyed: Map<string, F> | undefined
}

/** Builds one formatter. A static function (not a per-call closure). */
export type Builder<F> = (locale: string, variant: string, options: object | string | undefined) => F

export interface Table<F> {
  readonly byLocale: Map<string, Map<string, Slot<F>>>
  readonly build: Builder<F>
}

export function createTable<F>(build: Builder<F>): Table<F> {
  return { byLocale: new Map(), build }
}

function evictOldest<K>(map: Map<K, unknown>): void {
  map.delete(map.keys().next().value as K)
}

function slotFor<F>(table: Table<F>, locale: string, variant: string): Slot<F> {
  let variants = table.byLocale.get(locale)
  if (variants === undefined) {
    if (table.byLocale.size >= LOCALE_CAP) evictOldest(table.byLocale)
    variants = new Map()
    table.byLocale.set(locale, variants)
  }
  let slot = variants.get(variant)
  if (slot === undefined) {
    if (variants.size >= VARIANT_CAP) evictOldest(variants)
    slot = { def: undefined, named: undefined, weak: undefined, keyed: undefined }
    variants.set(variant, slot)
  }

  return slot
}

const SEP_KEY = '\u0001'
const SEP_ENTRY = '\u0002'

/**
 * The structural key of an options object: own enumerable keys in insertion
 * order, `undefined` values skipped, the extras that never reach `Intl`
 * (`locale`, `fallback`) skipped. `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` get
 * different keys, which costs at most one extra cached formatter.
 */
export function structuralKey(options: object): string {
  let key = ''
  for (const k in options) {
    if (k === 'locale' || k === 'fallback') continue
    const v: unknown = (options as Record<string, unknown>)[k]
    if (v === undefined) continue
    key += k + SEP_KEY + String(v) + SEP_ENTRY
  }

  return key
}

/** Resolve the cached formatter for `(locale, variant, options)`, constructing it on a miss. */
export function resolve<F>(
  table: Table<F>,
  locale: string,
  variant: string,
  options: object | string | undefined,
): F {
  const slot = slotFor(table, locale, variant)
  if (options === undefined) {
    return slot.def ?? (slot.def = table.build(locale, variant, undefined))
  }
  if (typeof options === 'string') {
    const named = slot.named ?? (slot.named = new Map())
    const hit = named.get(options)
    if (hit !== undefined) return hit
    const made = table.build(locale, variant, options)
    if (named.size >= OPTIONS_CAP) evictOldest(named)
    named.set(options, made)

    return made
  }
  const weak = slot.weak ?? (slot.weak = new WeakMap())
  const byIdentity = weak.get(options)
  if (byIdentity !== undefined) return byIdentity
  const key = structuralKey(options)
  if (key === '') {
    const def = slot.def ?? (slot.def = table.build(locale, variant, undefined))
    weak.set(options, def)
    return def
  }
  const keyed = slot.keyed ?? (slot.keyed = new Map())
  let made = keyed.get(key)
  if (made === undefined) {
    made = table.build(locale, variant, options)
    if (keyed.size >= OPTIONS_CAP) evictOldest(keyed)
    keyed.set(key, made)
  }
  weak.set(options, made)

  return made
}

/** Counts of what a table holds (tests and diagnostics). */
export function tableStats(table: Table<unknown>): {
  locales: number
  variants: number
  named: number
  keyed: number
} {
  let variants = 0
  let named = 0
  let keyed = 0
  for (const v of table.byLocale.values()) {
    variants += v.size
    for (const s of v.values()) {
      named += s.named?.size ?? 0
      keyed += s.keyed?.size ?? 0
    }
  }

  return { locales: table.byLocale.size, variants, named, keyed }
}

/** Empty a table. */
export function clearTable(table: Table<unknown>): void {
  table.byLocale.clear()
}

/**
 * Construct an `Intl` object. A locale `Intl` rejects (`'en_US'`, `'x'`)
 * falls back to the runtime default with a dev warning, because the locale may
 * be request data; any other `RangeError` is a bad option and is thrown by the
 * caller's `onBadOptions`.
 */
export function construct<T>(
  make: (locale: string | undefined, options: object) => T,
  locale: string,
  options: object,
  onBadOptions: (error: unknown) => Error,
  onBadLocale: (locale: string) => void,
): T {
  try {
    return make(locale === '' ? undefined : locale, options)
  } catch (error) {
    if (locale !== '') {
      let fallback: T
      try {
        fallback = make(undefined, options)
      } catch {
        throw onBadOptions(error)
      }
      onBadLocale(locale)

      return fallback
    }
    throw onBadOptions(error)
  }
}
