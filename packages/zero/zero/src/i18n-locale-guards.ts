// ─── i18n-locale-guards.ts ─────────────────────────────────────────────────
//
// Internal: configured-locale lookup and the locale-string validation
// `expandRoutesForLocales` runs. Split out of the public entry
// `i18n-routing.ts`, which imports from here, so these helpers are not public
// API; their unit tests reach them through `@pyreon/zero/internal`.

/**
 * Case-insensitive locale lookup returning the CONFIGURED spelling, so a
 * region locale (`en-US`) round-trips through a lowercased URL segment.
 * @internal
 */
export function matchLocale(candidate: string | undefined, locales: string[]): string | undefined {
  if (!candidate) return undefined
  const lower = candidate.toLowerCase()
  return locales.find((l) => l.toLowerCase() === lower)
}

/**
 * Validate a locale string (PR L2).
 *
 * The locale drives both URL pattern emission AND filesystem writes
 * (see `expandRoutesForLocales` for full rationale). Reject input that
 * would either:
 *   - break path-traversal boundaries (`..`, `/`, `\`)
 *   - produce invalid URL segments (whitespace, NUL)
 *   - create hidden-file artifacts (`.` leading)
 *   - silently kill the app (empty string)
 *
 * Throws with an actionable `[Pyreon]` error message. Called per-locale
 * by `expandRoutesForLocales` after the empty-locales no-op guard.
 *
 * @internal — exported for unit testing.
 */
export function validateLocale(locale: string): void {
  if (typeof locale !== 'string' || locale === '') {
    throw new Error(
      `[Pyreon] Invalid i18n locale: ${JSON.stringify(locale)}. Locales must be non-empty strings (e.g. "en", "de", "en-US").`,
    )
  }
  if (locale.trim() !== locale) {
    throw new Error(
      `[Pyreon] Invalid i18n locale: ${JSON.stringify(locale)}. Leading or trailing whitespace not allowed.`,
    )
  }
  if (locale.includes('/') || locale.includes('\\')) {
    throw new Error(
      `[Pyreon] Invalid i18n locale: ${JSON.stringify(locale)}. Path separators ("/", "\\\\") not allowed — they would break URL emission and could write outside the dist directory.`,
    )
  }
  if (locale === '..' || locale === '.') {
    throw new Error(
      `[Pyreon] Invalid i18n locale: ${JSON.stringify(locale)}. Path-traversal segments not allowed.`,
    )
  }
  if (locale.startsWith('.')) {
    throw new Error(
      `[Pyreon] Invalid i18n locale: ${JSON.stringify(locale)}. Leading dot not allowed — it would create a hidden-file directory (\`dist/.${locale.slice(1)}/\`) invisible to most file listings.`,
    )
  }
  if (locale.includes('\0')) {
    throw new Error(
      `[Pyreon] Invalid i18n locale: ${JSON.stringify(locale)}. NUL characters not allowed.`,
    )
  }
}
