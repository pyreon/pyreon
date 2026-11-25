// ─── seo-internals.ts ──────────────────────────────────────────────────────
//
// Internal: sitemap internals behind `seoPlugin` / `generateSitemap`: `<loc>`
// formatting, exclude matching, and the hreflang locale clustering. Split out
// of the public entry `seo.ts`, which imports from here, so these helpers are
// not public API; their unit tests reach them through
// `@pyreon/zero/internal-server`.

import type { I18nRoutingConfig } from './i18n-routing'
import type { SitemapEntry, TrailingSlash } from './seo'

/**
 * Build a `<loc>` URL from an origin + path, applying the trailing-slash
 * policy. `'preserve'` reproduces the prior `${origin}${path === '/' ? ''
 * : path}` form exactly (root → bare origin; others verbatim).
 *
 * @internal — exported for unit testing.
 */
export function formatLoc(origin: string, path: string, mode: TrailingSlash): string {
  if (path === '/') {
    // Root: 'always' adds the slash; 'never'/'preserve' keep the bare
    // origin (`https://x.com` ≡ `https://x.com/` to every crawler).
    return mode === 'always' ? `${origin}/` : origin
  }
  let p = path
  if (mode === 'always' && !p.endsWith('/')) {
    p = `${p}/`
  } else if (mode === 'never') {
    // Strip trailing slashes WITHOUT a regex. The obvious `p.replace(/\/+$/, '')`
    // trips CodeQL `js/polynomial-redos`: an unanchored `…+$` regex is O(N²) on
    // an all-slashes string (the engine retries the match at every start
    // position). A char-scan is linear with no backtracking. `end > 1` keeps at
    // least the leading character so a degenerate all-slashes input can't become
    // empty (real paths here always start with `/` and aren't `'/'` — handled above).
    let end = p.length
    while (end > 1 && p.charCodeAt(end - 1) === 47 /* "/" */) end--
    p = p.slice(0, end)
  }
  // 'preserve' → p unchanged.
  return `${origin}${p}`
}

/**
 * Whether `path` is excluded by an `exclude` list. See {@link SitemapConfig.exclude}.
 *
 * @internal — exported for unit testing.
 */
export function isExcluded(path: string, exclude: readonly (string | RegExp)[]): boolean {
  const p = stripTrailingSlash(path)
  return exclude.some((e) => {
    if (e instanceof RegExp) {
      // A `g`/`y` regex keeps `lastIndex` between calls; reset it so the
      // match does not depend on the previous path.
      e.lastIndex = 0
      return e.test(p)
    }
    const n = stripTrailingSlash(e)
    if (n === '/') return true

    return p === n || p.startsWith(`${n}/`)
  })
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * Cluster URL entries by their un-prefixed (default-locale) form.
 *
 * Each output cluster has:
 *   - `canonical`: the SitemapEntry that should be used as the `<url>`
 *     payload (default-locale variant; falls back to the first variant
 *     if no default-locale entry exists in the cluster).
 *   - `variantsByLocale`: Map of locale → SitemapEntry for the cluster.
 *
 * Without i18n, every entry becomes its own single-variant cluster.
 *
 * @internal — exported for unit testing.
 */
export function clusterPathsByLocale(
  entries: SitemapEntry[],
  i18n: I18nRoutingConfig | undefined,
): Cluster[] {
  if (i18n == null || i18n.locales.length === 0) {
    return entries.map((entry) => ({
      canonical: entry,
      variantsByLocale: new Map([[null, entry]]),
    }))
  }

  const strategy = i18n.strategy ?? 'prefix-except-default'
  const { defaultLocale, locales } = i18n
  // Build a map: unPrefixedPath → (locale | null → entry).
  const byUnPrefixed = new Map<string, Map<string | null, SitemapEntry>>()
  for (const entry of entries) {
    const { unPrefixed, locale } = stripLocalePrefix(entry.path, locales, defaultLocale, strategy)
    let cluster = byUnPrefixed.get(unPrefixed)
    if (!cluster) {
      cluster = new Map()
      byUnPrefixed.set(unPrefixed, cluster)
    }
    cluster.set(locale, entry)
  }
  // Build Cluster[] in insertion order (preserves the caller's path
  // order so sitemap diffs stay stable across runs).
  const out: Cluster[] = []
  for (const variantsByLocale of byUnPrefixed.values()) {
    // Pick the default-locale variant as canonical when present;
    // otherwise the first variant inserted.
    const canonical
      = variantsByLocale.get(defaultLocale)
        ?? variantsByLocale.get(null)
        ?? [...variantsByLocale.values()][0]!
    out.push({ canonical, variantsByLocale })
  }

  return out
}

/**
 * A URL cluster — the canonical entry + per-locale variants.
 *
 * @internal
 */
export interface Cluster {
  canonical: SitemapEntry
  variantsByLocale: Map<string | null, SitemapEntry>
}

/**
 * Strip the locale prefix from a path under the i18n strategy.
 *
 * Returns `{ unPrefixed, locale }`:
 *   - `/about` under `prefix-except-default` (default=en) → `{ unPrefixed: '/about', locale: 'en' }`
 *   - `/de/about` under either strategy → `{ unPrefixed: '/about', locale: 'de' }`
 *   - `/de` (locale root) → `{ unPrefixed: '/', locale: 'de' }`
 *   - `/about` under `prefix` → no locale match, returns `{ unPrefixed: '/about', locale: null }`
 *     (the URL doesn't fit any locale subtree — sitemap treats it as standalone).
 *
 * @internal — exported for unit testing.
 */
export function stripLocalePrefix(
  path: string,
  locales: readonly string[],
  defaultLocale: string,
  strategy: 'prefix' | 'prefix-except-default',
): { unPrefixed: string; locale: string | null } {
  for (const locale of locales) {
    if (path === `/${locale}`) return { unPrefixed: '/', locale }
    if (path.startsWith(`/${locale}/`)) {
      return { unPrefixed: path.slice(`/${locale}`.length), locale }
    }
  }
  // No explicit locale prefix. Under prefix-except-default, the
  // un-prefixed path belongs to the default locale by convention.
  if (strategy === 'prefix-except-default') {
    return { unPrefixed: path, locale: defaultLocale }
  }
  // Under `prefix`, an un-prefixed URL doesn't fit any locale subtree
  // (every locale should carry an explicit prefix). Treat as standalone.
  return { unPrefixed: path, locale: null }
}

/**
 * Resolve the i18n config to feed `generateSitemap` for hreflang
 * emission. Priority order:
 *   1. Explicit user config — `hreflang: I18nRoutingConfig` (object)
 *   2. Auto-detect from SSG manifest — `hreflang: true` + `manifestI18n`
 *      present (only happens in SSG mode where the manifest exists)
 *   3. Nothing — emit plain sitemap without xhtml:link siblings
 *
 * @internal — exported for unit testing.
 */
export function resolveHreflangI18n(
  hreflang: boolean | I18nRoutingConfig | undefined,
  manifestI18n: I18nRoutingConfig | undefined,
): I18nRoutingConfig | undefined {
  if (hreflang == null || hreflang === false) return undefined
  if (hreflang === true) return manifestI18n
  return hreflang
}
