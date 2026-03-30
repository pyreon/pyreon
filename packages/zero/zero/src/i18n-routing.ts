import { createContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { Plugin } from 'vite'

// ─── Localized routing ─────────────────────────────────────────────────────
//
// Adds locale-prefixed routes to Zero's file-system router:
// - /about → /en/about, /de/about, /cs/about
// - / → /en, /de, /cs (or default locale without prefix)
// - Automatic locale detection from Accept-Language header
// - Redirect to preferred locale
// - hreflang link generation
//
// Usage:
//   import { i18nRouting } from "@pyreon/zero"
//   export default { plugins: [zero(), i18nRouting({ locales: ["en", "de"], defaultLocale: "en" })] }

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
      return buildLocalePath(
        targetPath,
        targetLocale ?? locale,
        config.defaultLocale,
        strategy,
      )
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

    // Route duplication is NOT handled here. The fs-router's `scanRouteFiles`
    // consumes the i18n config to duplicate routes per locale at build time.
    // This plugin only provides: (1) the server middleware for locale detection
    // and (2) the runtime hooks (useLocale, setLocale) for client-side use.
    configResolved() {},

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '/'

        // Skip static assets
        if (url.startsWith('/@') || url.startsWith('/__') || url.includes('.')) {
          return next()
        }

        const { locale, pathWithoutLocale } = extractLocaleFromPath(
          url,
          config.locales,
          config.defaultLocale,
        )

        // Redirect root to detected locale
        if (detectEnabled && url === '/') {
          const cookies = parseCookies(req.headers.cookie)
          const preferredFromCookie = cookies[cookieName]
          const preferredFromHeader = detectLocaleFromHeader(
            req.headers['accept-language'],
            config.locales,
            config.defaultLocale,
          )
          const preferred = preferredFromCookie && config.locales.includes(preferredFromCookie)
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
export function setLocale(
  locale: string,
  config: I18nRoutingConfig,
): void {
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
