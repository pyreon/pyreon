import type { PluralRules } from './types'

const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Memoized `Intl.PluralRules` per locale. `Intl.PluralRules` construction is
 * expensive (~1–10µs) — allocating one per `t()` plural call dominated plural
 * resolution (~11µs/call vs ~200ns for the cached path). Mirrors the
 * (locale, options)-memoized number/date/relative-time formatter registry; the
 * plural path was the one Intl consumer that wasn't cached. Default cardinal
 * rules only — the codebase never requests ordinal, so locale alone is a
 * complete key.
 *
 * LRU-bounded. The key is whatever locale string reaches `t()` — commonly
 * derived from a URL segment, a cookie or `Accept-Language`, i.e. attacker-
 * influenced on a server — so "locales are a small finite set" does not hold
 * and an unbounded Map was a module-level leak (class C) shared by every
 * request. Real apps touch a handful of locales; 64 is far above that.
 */
const PLURAL_RULES_CACHE_CAP = 64
const _pluralRulesCache = new Map<string, Intl.PluralRules>()

/** @internal test-only probe of the plural-rules cache size. */
export function _pluralRulesCacheSize(): number {
  return _pluralRulesCache.size
}

/**
 * Resolve the plural category for a given count and locale.
 *
 * Uses custom rules if provided, otherwise falls back to `Intl.PluralRules`.
 * Returns CLDR plural categories: "zero", "one", "two", "few", "many", "other".
 */
export function resolvePluralCategory(
  locale: string,
  count: number,
  customRules?: PluralRules,
): string {
  // One per `t()` call with a `count` value. Pure overhead: every call
  // either hits a user-supplied rule fn or resolves a memoized `Intl.PluralRules`.
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('i18n.pluralResolve')


  // Custom rules take priority. OWN keys only — `customRules['constructor']`
  // is Object, and calling it returned an object instead of a category.
  if (customRules && Object.hasOwn(customRules, locale)) {
    const rule = customRules[locale]
    if (typeof rule === 'function') return rule(count)
  }

  // Use Intl.PluralRules if available — memoized per locale (construction is
  // the dominant cost; `.select()` is cheap).
  if (typeof Intl !== 'undefined' && Intl.PluralRules) {
    try {
      let pr = _pluralRulesCache.get(locale)
      if (pr === undefined) {
        pr = new Intl.PluralRules(locale)
        if (_pluralRulesCache.size >= PLURAL_RULES_CACHE_CAP) {
          // Evict the least-recently-used entry (Map iterates in insertion
          // order; a hit below re-inserts, so the first key is the LRU).
          _pluralRulesCache.delete(_pluralRulesCache.keys().next().value as string)
        }
        _pluralRulesCache.set(locale, pr)
      } else if (_pluralRulesCache.size > 1) {
        // Refresh recency.
        _pluralRulesCache.delete(locale)
        _pluralRulesCache.set(locale, pr)
      }
      return pr.select(count)
    } catch {
      // Invalid locale — fall through
    }
  }

  // Basic fallback
  return count === 1 ? 'one' : 'other'
}
