import type { Plugin } from 'vite'
import {
  createLocaleContext,
  detectLocaleFromHeader,
  extractLocaleFromPath,
  type I18nRoutingConfig,
  type LocaleStore,
} from './i18n-routing'

// ─── i18nRouting — SERVER-ONLY Vite plugin ──────────────────────────────────
//
// Split out of `i18n-routing.ts` (PR fixing the bokisch.com build warning):
// this module holds the ONLY reference to the server-only ALS module
// (`await import('./i18n-routing-als')`, which statically imports
// `node:async_hooks`). `i18n-routing.ts` stays client-safe (exported from
// `@pyreon/zero`'s main entry via `useLocale` / `setLocale`); this plugin is
// exported ONLY from `@pyreon/zero/server`. Keeping the dynamic als import out
// of any client-reachable module means Vite never creates the
// `i18n-routing-als` chunk in a consumer's CLIENT build, so the
// "node:async_hooks externalized for browser compatibility" warning is gone.
// (A dynamic import in a client-reachable module still produces the chunk +
// warning even though it only runs server-side — see anti-patterns.md.)

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

    async configureServer(server) {
      // PR-S7 hardening (post PR #1125 first cut): lazy-import the
      // server-only ALS module. Top-level `import 'node:async_hooks'`
      // would pull it into the CLIENT bundle (this file is exported
      // from `@pyreon/zero`'s main entry via `useLocale` / `setLocale`).
      // configureServer runs only on the Vite dev server (Node), so
      // dynamic import here is safe and Vite never bundles the chain
      // for the browser.
      const { _runInLocaleStore } = await import('./i18n-routing-als')

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '/'

        // Skip static assets
        if (url.startsWith('/@') || url.startsWith('/__') || url.includes('.')) {
          return next()
        }

        const { locale } = extractLocaleFromPath(
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

        // PR-S7: wrap the remainder of the request in a per-request locale
        // ALS context so `useLocale()` reads the right value from any
        // downstream async frame (Vite middleware chain, ssrLoadModule,
        // Pyreon handler, render). The store is a tiny get/set object — no
        // signal allocation per request, no subscriber bookkeeping (server
        // renders snapshot once).
        //
        // **No `localeSignal.set(locale)` here** (was the original bug
        // PR-S7's first cut left in as "best effort" for callers that
        // didn't flow through the ALS context). Module-signal writes
        // RACE across concurrent SSR requests — request A writes 'en',
        // request B writes 'de' before A's deferred reader fires, A's
        // deferred reader sees 'de'. The ALS store is the authoritative
        // SSR source; the module signal is CSR-only (set by client-side
        // `setLocale()`, read as the fallback when no ALS context is
        // active — which on the client is single-threaded so no race).
        // Removing the write trades "deferred SSR readers see whichever
        // request wrote the signal last" for "deferred SSR readers see
        // the signal's CSR-set value (or initial default)". The latter
        // is predictable and race-free; the former was a silent
        // cross-request contamination.
        let storeValue = locale
        const perRequestStore: LocaleStore = {
          get: () => storeValue,
          set: (v) => {
            storeValue = v
          },
        }
        _runInLocaleStore(perRequestStore, () => {
          next()
        })
      })
    },
  }
}

/**
 * @internal — exposed for unit testing the PR-S3 truncation fix.
 * Not part of the public API surface; callers should not rely on this export.
 */
export function _parseCookiesForTesting(header: string | undefined): Record<string, string> {
  return parseCookies(header)
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  const result: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const trimmed = pair.trim()
    // PR-S3: split on FIRST `=` only. The old `split('=')` then destructure
    // `[key, value]` truncated any cookie value containing `=` — every base64
    // session ID (e.g. `session=abc=` padding), every JWT (`xxx.yyy.zzz=`
    // is rare but `eyJ...=` padding common). Today only the locale cookie
    // is read, but the helper is a latent footgun for any future auth /
    // session cookie consumer. Mirrors `parseQuery` in
    // packages/core/router/src/match.ts:51-59.
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue // missing or empty key (`=value` or just `name`)
    const key = trimmed.slice(0, idx)
    const value = trimmed.slice(idx + 1)
    if (value) result[key] = decodeURIComponent(value)
  }
  return result
}
