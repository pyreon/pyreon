import type { PluralRules } from './types'

const __DEV__: boolean = process.env.NODE_ENV !== 'production'
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

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
  // either hits a user-supplied rule fn or allocates an `Intl.PluralRules`.
  if (__DEV__) _countSink.__pyreon_count__?.('i18n.pluralResolve')

  // Custom rules take priority
  if (customRules?.[locale]) {
    return customRules[locale](count)
  }

  // Use Intl.PluralRules if available
  if (typeof Intl !== 'undefined' && Intl.PluralRules) {
    try {
      const pr = new Intl.PluralRules(locale)
      return pr.select(count)
    } catch {
      // Invalid locale — fall through
    }
  }

  // Basic fallback
  return count === 1 ? 'one' : 'other'
}
