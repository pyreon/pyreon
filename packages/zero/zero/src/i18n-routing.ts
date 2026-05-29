import { createContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { Plugin } from 'vite'
import type { FileRoute } from './types'

// ─── Localized routing ─────────────────────────────────────────────────────
//
// Adds locale-prefixed routes to Zero's file-system router (PR H of the SSG
// roadmap). Two complementary halves:
//
// 1. **Build-time route duplication** — `expandRoutesForLocales(routes, config)`
//    fans every `FileRoute` into per-locale variants according to the
//    configured `strategy`. Called from `vite-plugin.ts`'s virtual-routes
//    load AND `ssg-plugin.ts`'s pre-render path expansion. Wired via the
//    `i18n?: I18nRoutingConfig` field on `ZeroConfig`.
//
// 2. **Request-time locale detection** — the `i18nRouting()` Vite plugin
//    below attaches a middleware that reads `Accept-Language` / cookies,
//    sets the `localeSignal` for `useLocale()`, and redirects root
//    requests to the detected locale. Independent from (1) — `i18nRouting()`
//    only handles middleware; route duplication happens via
//    `expandRoutesForLocales` regardless of whether this plugin is mounted.
//
// Examples (with `locales: ["en","de","cs"]`, `defaultLocale: "en"`):
// - `prefix-except-default` (default): `/about` (en, unprefixed) +
//   `/de/about`, `/cs/about`. Best for SEO-on-default-locale apps.
// - `prefix`: `/en/about`, `/de/about`, `/cs/about`. Every URL
//   self-identifies its locale.
//
// Usage:
//   // zero.config.ts
//   import { defineConfig, i18nRouting } from "@pyreon/zero"
//   export default defineConfig({
//     i18n: { locales: ["en","de","cs"], defaultLocale: "en" },
//     plugins: [i18nRouting({ locales: ["en","de","cs"], defaultLocale: "en" })],
//   })

export interface I18nRoutingConfig {
  /** Supported locales. e.g. ["en", "de", "cs"] */
  locales: string[]
  /** Default locale — served without prefix (/ instead of /en/). */
  defaultLocale: string
  /** Redirect root to detected locale. Default: true */
  detectLocale?: boolean
  /** Cookie name to persist locale preference. Default: "locale" */
  cookieName?: string
  /** URL strategy. Default: "prefix-except-default" */
  strategy?: 'prefix' | 'prefix-except-default'
}

export interface LocaleContext {
  /** Current locale code. e.g. "en", "de" */
  locale: string
  /** All supported locales. */
  locales: string[]
  /** Default locale. */
  defaultLocale: string
  /** Build a localized path. e.g. localePath("/about", "de") → "/de/about" */
  localePath: (path: string, locale?: string) => string
  /** Get hreflang alternates for the current path. */
  alternates: () => Array<{ locale: string; url: string }>
}

/**
 * Detect preferred locale from Accept-Language header.
 */
export function detectLocaleFromHeader(
  acceptLanguage: string | null | undefined,
  locales: string[],
  defaultLocale: string,
): string {
  if (!acceptLanguage) return defaultLocale

  // Parse Accept-Language: en-US,en;q=0.9,de;q=0.8
  const preferred = acceptLanguage
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=')
      return {
        lang: lang?.split('-')[0]?.toLowerCase() ?? '',
        quality: q ? Number.parseFloat(q) : 1,
      }
    })
    .sort((a, b) => b.quality - a.quality)

  for (const { lang } of preferred) {
    if (locales.includes(lang)) return lang
  }

  return defaultLocale
}

/**
 * Extract locale from a URL path.
 * Returns { locale, pathWithoutLocale }.
 */
export function extractLocaleFromPath(
  path: string,
  locales: string[],
  defaultLocale: string,
): { locale: string; pathWithoutLocale: string } {
  const segments = path.split('/').filter(Boolean)
  const firstSegment = segments[0]?.toLowerCase()

  if (firstSegment && locales.includes(firstSegment)) {
    return {
      locale: firstSegment,
      pathWithoutLocale: '/' + segments.slice(1).join('/') || '/',
    }
  }

  return { locale: defaultLocale, pathWithoutLocale: path }
}

/**
 * Build a localized path.
 */
export function buildLocalePath(
  path: string,
  locale: string,
  defaultLocale: string,
  strategy: 'prefix' | 'prefix-except-default',
): string {
  const clean = path === '/' ? '' : path
  if (strategy === 'prefix-except-default' && locale === defaultLocale) {
    return path
  }
  return `/${locale}${clean}`
}

/**
 * Fan a `FileRoute[]` into per-locale duplicates so the file-system router
 * knows about every localized URL pattern at build time. PR H — was the
 * missing half of the i18n story before this PR (the `i18nRouting()` Vite
 * plugin only handled request-time locale detection; routes themselves
 * were never duplicated, so static-host SSG outputs and SSR matching had
 * no `/de/about` / `/cs/about` records to render against).
 *
 * Strategy semantics:
 *
 * - **`prefix-except-default`** (default): the default locale's routes
 *   keep their original `urlPath` unchanged (`/about` stays `/about`); all
 *   non-default locales get a prefix (`/de/about`, `/cs/about`). Best for
 *   SEO-on-default-locale apps — search engines see canonical URLs at
 *   `/about` while non-default speakers get explicit prefixes.
 *
 * - **`prefix`**: every locale gets its own prefix, including the default
 *   (`/en/about`, `/de/about`, `/cs/about`). Root `/` becomes `/en` /
 *   `/de` / `/cs`. Better when no locale is "primary" — every URL
 *   self-identifies its locale.
 *
 * Layouts, error boundaries, loading components, and 404 pages duplicate
 * along with their pages — same source file (same `filePath`), new
 * locale-prefixed `urlPath` / `dirPath` / `depth`. The route tree built
 * from the expanded array therefore has one fully-formed subtree per
 * locale, so layout matching, dynamic params (`[id]` → `:id`), and
 * catch-all routes (`[...slug]` → `:slug*`) all compose naturally with
 * the locale prefix — no special cases.
 *
 * `getStaticPaths` composition (for SSG): each duplicate route inherits
 * the same `exports.getStaticPaths`. The SSG plugin's `expandUrlPattern`
 * step then expands `/blog/[slug]` × `[en, de]` × `getStaticPaths()
 * → ['a', 'b']` into `/blog/a`, `/blog/b`, `/de/blog/a`, `/de/blog/b`
 * (or all six prefixed forms under `'prefix'` strategy). Cardinality
 * compounds, which is by design — `ssg.concurrency` (PR D) limits
 * in-flight renders independent of route count.
 *
 * No-op when `config.locales` is empty or contains only the default
 * locale (prefix-except-default strategy with no other locales) — returns
 * the input array unchanged. Always return a fresh array on duplication
 * so callers don't accidentally mutate cached input.
 *
 * Reference: the helper is called from `vite-plugin.ts`'s virtual route
 * module load AND `ssg-plugin.ts`'s pre-render path expansion. Tested in
 * isolation — duplication is a pure transform on FileRoute[] with no
 * filesystem or network side effects.
 */
export function expandRoutesForLocales(
  routes: FileRoute[],
  config: I18nRoutingConfig,
): FileRoute[] {
  const strategy = config.strategy ?? 'prefix-except-default'
  const { locales, defaultLocale } = config

  // Cheap no-op guards. Empty `locales` would otherwise produce an empty
  // route array, killing the app silently.
  if (locales.length === 0) return routes

  // PR L2 — Validate every locale string before they reach the filesystem.
  // The locales drive both URL pattern emission (`/${locale}/...`) AND
  // filesystem writes (`mkdir(dist/${locale})` in ssg-plugin.ts's per-
  // locale 404 emit). User-supplied input with `/`, `..`, `\`, NUL, or
  // leading dots could write outside dist OR produce broken URLs.
  // Validate at the single entry point so every downstream consumer
  // (vite-plugin's virtual-routes load AND ssg-plugin's path expansion)
  // benefits from one check.
  //
  // Reject:
  //   - empty string (kills the app silently with no usable URLs)
  //   - leading/trailing whitespace (URL-malformed)
  //   - `/` or `\` (path traversal AND structurally invalid as a URL
  //     segment — `/de/sub/about` would split into nested directories)
  //   - `..` or `.` whole-string (path traversal)
  //   - NUL char (system-call boundary breaks)
  //   - leading `.` (hidden directory; macOS/Linux dotfile pattern that
  //     would create `dist/.locale/` invisible to most ls outputs)
  //
  // Runs AFTER the empty-locales no-op guard so apps temporarily
  // toggling to `i18n: { locales: [], ... }` (mid-migration shape)
  // don't trip on an unused defaultLocale.
  for (const locale of locales) validateLocale(locale)
  validateLocale(defaultLocale)
  if (
    strategy === 'prefix-except-default' &&
    locales.length === 1 &&
    locales[0] === defaultLocale
  ) {
    return routes
  }

  const expanded: FileRoute[] = []
  for (const route of routes) {
    for (const locale of locales) {
      // For prefix-except-default, the default locale uses the ORIGINAL
      // urlPath / dirPath / depth — no prefix applied.
      if (strategy === 'prefix-except-default' && locale === defaultLocale) {
        expanded.push(route)
        continue
      }

      // PR H follow-up: skip duplication of ROOT-level layouts under
      // `prefix-except-default`. The unprefixed default-locale root
      // `_layout.tsx` (urlPath `/`) is the parent of the matched chain
      // for EVERY path, including locale-prefixed ones — the route
      // tree's hierarchical matching wraps `/de/about` under `/_layout`
      // automatically. Producing a duplicate `/de/_layout` would cause
      // the matcher to nest BOTH layouts (`/_layout` → `/de/_layout` →
      // page), mounting the layout component twice and rendering two
      // navbars / two PyreonUI providers.
      //
      // Non-root layouts (e.g. `/dashboard/_layout` at urlPath
      // `/dashboard`) MUST still be duplicated — `/de/dashboard/users`
      // is NOT a child of the unprefixed `/dashboard/_layout` (the
      // path patterns don't match), so the de-prefixed dashboard needs
      // its own `_layout`.
      //
      // Under `prefix` strategy this skip does NOT apply: there is no
      // unprefixed default to inherit from, so every locale needs its
      // own root layout (`/en/_layout`, `/de/_layout`, …).
      if (strategy === 'prefix-except-default' && route.isLayout && route.urlPath === '/') {
        continue
      }

      const newUrlPath = prefixUrlPath(route.urlPath, locale)
      // dirPath needs the locale segment too so the route-tree builder
      // groups localized siblings correctly. Original empty `dirPath`
      // (root-level routes) becomes the bare locale.
      const newDirPath = route.dirPath === '' ? locale : `${locale}/${route.dirPath}`
      // Recompute depth from the new urlPath. Layouts at the root (depth
      // 0) become depth 1 under their locale prefix; nested routes shift
      // up by 1.
      const newDepth = newUrlPath === '/' ? 0 : newUrlPath.split('/').filter(Boolean).length

      expanded.push({
        ...route,
        urlPath: newUrlPath,
        dirPath: newDirPath,
        depth: newDepth,
      })
    }
  }
  return expanded
}

/**
 * Prepend `/locale` to a URL pattern. Handles three shapes:
 *   `/`         → `/de`
 *   `/about`    → `/de/about`
 *   `/users/:id` / `/blog/:slug*` → `/de/users/:id` / `/de/blog/:slug*`
 *
 * Internal helper to `expandRoutesForLocales`; not exported because the
 * public surface for path-building is `buildLocalePath` (which strips
 * existing locale prefixes — different semantics).
 */
function prefixUrlPath(urlPath: string, locale: string): string {
  if (urlPath === '/') return `/${locale}`
  return `/${locale}${urlPath}`
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

/**
 * Create a LocaleContext for use in components and loaders.
 */
export function createLocaleContext(
  locale: string,
  path: string,
  config: I18nRoutingConfig,
): LocaleContext {
  const strategy = config.strategy ?? 'prefix-except-default'

  return {
    locale,
    locales: config.locales,
    defaultLocale: config.defaultLocale,

    localePath(targetPath: string, targetLocale?: string) {
      return buildLocalePath(targetPath, targetLocale ?? locale, config.defaultLocale, strategy)
    },

    alternates() {
      const { pathWithoutLocale } = extractLocaleFromPath(
        path,
        config.locales,
        config.defaultLocale,
      )
      return config.locales.map((loc) => ({
        locale: loc,
        url: buildLocalePath(pathWithoutLocale, loc, config.defaultLocale, strategy),
      }))
    },
  }
}

/**
 * I18n routing middleware for Zero's server.
 *
 * - Detects locale from URL prefix or Accept-Language header
 * - Redirects root to preferred locale (when detectLocale is true)
 * - Sets locale context for loaders and components
 *
 * @example
 * ```ts
 * // zero.config.ts
 * import { i18nRouting } from "@pyreon/zero"
 *
 * export default defineConfig({
 *   plugins: [
 *     i18nRouting({
 *       locales: ["en", "de", "cs"],
 *       defaultLocale: "en",
 *     }),
 *   ],
 * })
 * ```
 */
export function i18nRouting(config: I18nRoutingConfig): Plugin {
  const strategy = config.strategy ?? 'prefix-except-default'
  const detectEnabled = config.detectLocale !== false
  const cookieName = config.cookieName ?? 'locale'

  return {
    name: 'pyreon-zero-i18n-routing',

    // Route duplication is NOT handled here. It happens in
    // `vite-plugin.ts` and `ssg-plugin.ts` via `expandRoutesForLocales`,
    // gated by the `i18n` field on `ZeroConfig`. This plugin only
    // provides: (1) the dev server middleware for locale detection
    // (Accept-Language, cookies, root redirect) and (2) the runtime
    // hooks (useLocale, setLocale) for client-side use.
    configResolved() {},

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '/'

        // Skip static assets
        if (url.startsWith('/@') || url.startsWith('/__') || url.includes('.')) {
          return next()
        }

        const { locale } = extractLocaleFromPath(url, config.locales, config.defaultLocale)

        // Redirect root to detected locale
        if (detectEnabled && url === '/') {
          const cookies = parseCookies(req.headers.cookie)
          const preferredFromCookie = cookies[cookieName]
          const preferredFromHeader = detectLocaleFromHeader(
            req.headers['accept-language'],
            config.locales,
            config.defaultLocale,
          )
          const preferred =
            preferredFromCookie && config.locales.includes(preferredFromCookie)
              ? preferredFromCookie
              : preferredFromHeader

          if (strategy === 'prefix' || preferred !== config.defaultLocale) {
            res.writeHead(302, { Location: `/${preferred}/` })
            res.end()
            return
          }
        }

        // Attach locale context to request for loaders
        ;(req as any).__locale = locale
        ;(req as any).__localeContext = createLocaleContext(locale, url, config)

        // Update the module-level signal so useLocale() returns the correct value
        localeSignal.set(locale)

        next()
      })
    },
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  const result: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const [key, value] = pair.trim().split('=')
    if (key && value) result[key] = decodeURIComponent(value)
  }
  return result
}

// ─── Reactive locale hook ───────────────────────────────────────────────────

/** @internal Context for the current locale. */
export const LocaleCtx = createContext<string>('en')

/** Current locale signal — set by the server middleware or client-side detection. */
export const localeSignal = signal('en')

/**
 * Read the current locale reactively.
 *
 * Returns the locale signal value directly — reactive in both SSR and CSR.
 * The server middleware sets `localeSignal` per-request, and client-side
 * `setLocale()` updates it as well.
 *
 * @example
 * ```tsx
 * const locale = useLocale() // "en", "de", etc.
 * ```
 */
export function useLocale(): string {
  return localeSignal()
}

/**
 * Set the locale client-side and update the URL.
 *
 * @example
 * ```tsx
 * <button onClick={() => setLocale('de')}>Deutsch</button>
 * ```
 */
export function setLocale(locale: string, config: I18nRoutingConfig): void {
  localeSignal.set(locale)

  // Persist to cookie
  if (typeof document !== 'undefined') {
    document.cookie = `${config.cookieName ?? 'locale'}=${locale}; path=/; max-age=31536000`
  }

  // Navigate to localized URL — use pushState to avoid full page reload
  if (typeof window !== 'undefined') {
    const strategy = config.strategy ?? 'prefix-except-default'
    const { pathWithoutLocale } = extractLocaleFromPath(
      window.location.pathname,
      config.locales,
      config.defaultLocale,
    )
    const newPath = buildLocalePath(pathWithoutLocale, locale, config.defaultLocale, strategy)
    window.history.pushState(null, '', newPath)
    // Dispatch popstate so @pyreon/router picks up the URL change
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}
