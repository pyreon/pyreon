import type { PluralRules } from './types'

const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Memoized `Intl.PluralRules` per locale. `Intl.PluralRules` construction is
 * expensive (~1–10µs) — allocating one per `t()` plural call dominated plural
 * resolution (~11µs/call vs ~200ns for the cached path). Mirrors the
 * (locale, options)-memoized number/date/relative-time formatter registry; the
 * plural path was the one Intl consumer that wasn't cached. Locales are a small
 * finite set, so the unbounded Map is bounded in practice (same as the
 * formatter caches). Default cardinal rules only — the codebase never requests
 * ordinal, so locale alone is a complete key.
 */
const _pluralRulesCache = new Map<string, Intl.PluralRules>()

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


  // Custom rules take priority
  if (customRules?.[locale]) {
    return customRules[locale](count)
  }

  // Use Intl.PluralRules if available — memoized per locale (construction is
  // the dominant cost; `.select()` is cheap).
  if (typeof Intl !== 'undefined' && Intl.PluralRules) {
    try {
      let pr = _pluralRulesCache.get(locale)
      if (pr === undefined) {
        pr = new Intl.PluralRules(locale)
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
