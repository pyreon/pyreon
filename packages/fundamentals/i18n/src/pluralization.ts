import type { PluralRules } from './types'

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
