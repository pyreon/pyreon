/**
 * SSG (Static Site Generation) build hook for `@pyreon/zero`.
 *
 * Activates when `mode: "ssg"` is set in zero's config. After Vite's client
 * build finishes, this plugin:
 *
 *   1. Triggers a programmatic SSR build via Vite's `build()` API, producing
 *      a server bundle in `dist/.zero-ssg-server/` from a synthetic entry
 *      that imports `virtual:zero/routes` and `createServer`.
 *   2. Loads the built handler with dynamic `import()`.
 *   3. Resolves the path list from `config.ssg.paths` (string[], async fn,
 *      or auto-detected from the static-only routes in the route tree).
 *   4. Calls `prerender()` from `@pyreon/server` to render each path.
 *   5. Cleans up the temporary SSR build directory.
 *
 * Before this PR, `mode: "ssg"` and `ssg.paths` were typed in
 * `types.ts` but had no runtime implementation — the plugin file had zero
 * Rollup build hooks. Apps configured for SSG silently shipped a bare SPA
 * shell with no per-route HTML files, which broke direct-URL deploys to
 * static hosts (no `dist/<path>/index.html`, every URL falls back to the
 * SPA index).
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withSilent } from '@pyreon/reactivity'
import type { BuildOptions, Plugin } from 'vite'
import { resolveAdapter } from './adapters'
import { resolveConfig } from './config'
import { parseFileRoutes, scanRouteFiles, scanRouteFilesWithExports } from './fs-router'
import { expandRoutesForLocales, type I18nRoutingConfig } from './i18n-routing'
import {
  _peekMkdirCacheSize,
  _registerSsgEntryRenderer,
  _resetMkdirCache,
  buildSsrBundle,
  injectIntoTemplate,
  materializeEntry,
  mkdirOnce,
  writeFileAtomic,
} from './ssr-build-shared'
import {
  type ViteManifest,
  computeEntryHrefs,
  computeRoutePreloadHrefs,
  parseExistingModulePreloads,
  renderModulePreloadLinks,
} from './ssg-modulepreload'
import { ensureNoindexMeta } from './not-found'
import type { ZeroConfig } from './types'

// M2.3 — Server-side perf-harness counter sink (same shape as
// runtime-server). `__DEV__` is gated at the call site so prod builds with
// `NODE_ENV=production` skip the optional-chain entirely. Counter strings
// remain in the bundle (few bytes) but the runtime cost is zero.
//
// Consumers run the build under a process that has installed a sink via
// `@pyreon/perf-harness`'s `install()` / `enable()` API. Without a sink
// installed, the optional chaining short-circuits and emission is free.
// Useful for: CI plugins tracking SSG perf over time, dev profiling, or
// the future `vite build --profile` flag.
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// Marker env var used to skip the SSG hook on the recursive SSR sub-build —
// the SSR pass loads the same vite config + same plugin chain, so without
// this guard the SSG hook would re-trigger an infinite build loop.
const SSG_BUILD_FLAG = 'PYREON_ZERO_SSG_INNER_BUILD'

// Synthetic SSR entry source. Imports the user's route tree via the virtual
// module that zero's main plugin already registers, then exports a default
// `(path: string) => Promise<string>` renderer that returns the full HTML
// for a single path.
//
// The entry is materialized to disk (not registered as a virtual module)
// because Rolldown's `rollupOptions.input` phase doesn't reliably resolve
// `\0`-prefixed virtual ids when used as build entries — a virtual id
// returned from `resolveId` works fine for downstream imports but fails
// the entry-resolution stage with `Cannot resolve entry module`.
//
// We do NOT use zero's `createServer` because it wraps the user's App with
// a router whose URL is baked in at App-creation time. SSG needs a fresh
// router per path, so we mirror the dev SSR pipeline (`renderSsr` in
// vite-plugin.ts): per request → new createApp({ url: path }) → preload
// loaders → renderWithHead → serialize loader data → done.
// SSG entry template — see notes above for the design rationale.
//
// **Styler CSS flush.** `@pyreon/styler` accumulates server-rendered CSS
// rules into its singleton `sheet.ssrBuffer` as components render, then
// emits them via `sheet.getStyleTag()`. Before this was wired into the SSG
// path, prerendered HTML carried styler-generated class names (`pyr-1abc23`)
// on every element but had ZERO `<style>` tags in the head — meaning every
// SSG page rendered un-styled until the client JS ran and re-emitted the
// CSS. The fix lazy-imports `@pyreon/styler` so projects that don't use it
// pay nothing, calls `sheet.reset()` per request to start clean (singleton
// state would leak across paths in the same SSG sub-build), and injects
// the resulting `<style>` tag into the head ahead of @pyreon/head's tags.
//
// `@pyreon/server`'s `createHandler` exposes the same hook via a
// `collectStyles` option (handler.ts:84-91); the SSG path used to bypass
// that entirely because it builds its own renderer rather than going
// through createHandler.
// PR K (i18n follow-up): the SSG entry needs the configured locales list
// baked in at build time so the per-locale 404 walker can detect which
// RouteRecord serves which locale. Locale info isn't on the runtime
// route records (they're path patterns, not metadata), so the walker
// has to compare paths against the known locale list. Wrapping the
// source template in a function lets the outer plugin pass
// `config.i18n?.locales ?? []` per build.
const renderSsgEntrySource = (locales: readonly string[] = []): string => {
  const i18nLocalesLiteral = JSON.stringify(locales)
  return `
import { routes } from "virtual:zero/routes"
import { h } from "@pyreon/core"
import { renderWithHead } from "@pyreon/head/ssr"
import { getRedirectInfo, RouterProvider, serializeLoaderData, stringifyLoaderData } from "@pyreon/router"
import { runWithRequestContext } from "@pyreon/runtime-server"
import { createApp } from "@pyreon/zero/server"

// Lazy-imported styler integration. Projects that don't depend on
// @pyreon/styler skip this entirely (the import fails silently, the
// helper stays a no-op). Hot path: an awaited dynamic import resolved
// once at entry-module evaluation, then sync calls per request.
//
// **No reset between paths.** @pyreon/styler's styled() inserts CSS
// rules into sheet.ssrBuffer at MODULE-EVAL TIME (top-level of styled.ts:95),
// not per-render. After that initial insert, each render of a styled
// component just attaches the cached class name to props — no new buffer
// push. Calling sheet.reset() between SSG paths would WIPE all rules and
// leave subsequent pages style-less. For SSG this is acceptable: the
// generated CSS is identical across all pages (same module-eval cache),
// and shipping the full rule set in every page's <style> tag matches
// how static SSG sites handle CSS — every page is self-contained,
// cacheable by the browser, no per-route CSS code splitting needed.
let __pyreonGetStylerTag = () => ""
try {
  const stylerMod = await import("@pyreon/styler")
  if (stylerMod && stylerMod.sheet && typeof stylerMod.sheet.getStyleTag === "function") {
    __pyreonGetStylerTag = () => stylerMod.sheet.getStyleTag()
  }
} catch {
  // No @pyreon/styler in the project — leave the no-op stub in place.
}

// PR E — \`__ZERO_BASE__\` is the Vite-defined build-time constant
// carrying the value of \`zero({ base })\`. Read it once at module
// eval and forward to createRouter via createApp so SSG-rendered
// pages have correctly-prefixed RouterLink hrefs that match the
// asset URLs Vite already prefixed in the built HTML template.
const __ssgBase = typeof __ZERO_BASE__ !== "undefined" && __ZERO_BASE__ !== "/"
  ? __ZERO_BASE__
  : undefined

export default async function renderPath(path, options) {
  const { App, router } = createApp({
    routes,
    routerMode: "history",
    url: path,
    ...(__ssgBase ? { base: __ssgBase } : {}),
  })

  // PR B — redirect handling. \`router.preload\` runs every loader in the
  // matched chain and surfaces \`redirect()\` throws as the rejection
  // reason. We catch BEFORE the render: rendering past a redirect would
  // produce HTML for the wrong page AND leak the auth-gated layout
  // structure for unauthenticated users. The runtime SSR handler
  // (createHandler in @pyreon/server) already does this same catch and
  // returns a 302/307 Location response; SSG mirrors that — return
  // \`{ kind: 'redirect', from, to, status }\` instead of HTML, and the
  // outer plugin emits a redirect manifest entry instead of an
  // \`index.html\`. Any non-redirect error rethrows and lands in the
  // existing \`errors[]\` collection.
  //
  // PR C — \`isNotFound\` skips parent-layout loaders during the 404 build.
  // Layout loaders that hit auth resources (cookies, session tokens,
  // private APIs) shouldn't fire when generating a static 404 page —
  // the build has no real request context. Lazy components still
  // resolve so the synthetic chain renders cleanly; only the
  // \`r.loader()\` invocations are skipped. \`__renderNotFound\` below
  // forwards \`{ isNotFound: true }\` for this path.
  try {
    await router.preload(path, undefined, {
      skipLoaders: options?.isNotFound === true,
    })
  } catch (err) {
    const info = getRedirectInfo(err)
    if (info) {
      return { kind: "redirect", from: path, to: info.url, status: info.status }
    }
    throw err
  }

  return runWithRequestContext(async () => {
    // PR-S1: App is router-AGNOSTIC; supply the per-request RouterProvider
    // at this call site (mirrors production createHandler + dev renderSsr).
    // See app.ts:createApp comment for the full rationale.
    const app = h(RouterProvider, { router }, h(App, null))
    const { html: appHtml, head } = await renderWithHead(app)

    // Inject styler's <style data-pyreon-styler="..."> tag into the head
    // BEFORE @pyreon/head's tags so the CSS cascade orders correctly with
    // any meta/link tags the user added. Empty buffer emits a benign
    // empty <style></style> — detected via the literal closing pair to
    // avoid polluting the head when no styler is in use.
    const styleTag = __pyreonGetStylerTag()
    const isEmpty = !styleTag || styleTag.indexOf("></style>") !== -1
    const finalHead = isEmpty ? head : styleTag + "\\n" + head

    const loaderData = serializeLoaderData(router)
    const hasData = loaderData && Object.keys(loaderData).length > 0
    // M2.2 — safe serializer drops function/symbol values, throws a clear
    // Pyreon-prefixed error on circular refs, escapes </script> uniformly.
    const loaderScript = hasData
      ? \`<script>window.__PYREON_LOADER_DATA__=\${stringifyLoaderData(loaderData)}</script>\`
      : ""

    // Per-route modulepreload (SSG): expose the matched chain's source module
    // paths. \`_hmrId\` (the route file each \`lazy(() => import(...))\` points at)
    // lives on the lazy COMPONENT wrapper — \`record.component._hmrId\` — not the
    // record (the record keeps the lazy wrapper; the resolved fn goes to a
    // separate cache). The outer plugin maps these to the client manifest's
    // chunk graph and injects <link rel=modulepreload> for the STATIC closure
    // only. Non-lazy records (synthetic 404 leaf, eager components) have none.
    const routeModules = router
      .currentRoute()
      .matched.map((r) => r.component && r.component._hmrId)
      .filter((id) => typeof id === "string")
    return { kind: "html", appHtml, head: finalHead, loaderScript, routeModules }
  })
}

// ─── getStaticPaths enumeration (PR A) ──────────────────────────────────────
//
// Walks the generated routes tree and collects every dynamic route's
// \`getStaticPaths\` function alongside its URL pattern. The SSG plugin
// calls this once before rendering and uses the returned map to expand
// dynamic routes (\`/posts/:id\` × \`[{id:'a'},{id:'b'}]\` → \`/posts/a\`,
// \`/posts/b\`). Routes without \`getStaticPaths\` are absent from the map.
//
// Why we collect ALL routes here instead of resolving on-demand: the
// SSG plugin's \`resolvePaths\` runs in the OUTER Vite plugin context (no
// access to the bundled routes module). The SSR sub-build is the only
// place where the user's compiled route exports are reachable, so we
// expose a sync collector that lets the plugin call user functions
// indirectly via the entry's exports.
function collectStaticPathsRegistry(rs, out) {
  for (const r of rs) {
    if (typeof r.getStaticPaths === "function" && typeof r.path === "string") {
      out.set(r.path, r.getStaticPaths)
    }
    if (Array.isArray(r.children)) collectStaticPathsRegistry(r.children, out)
  }
  return out
}

/** Map of \`urlPath → getStaticPaths function\` for every dynamic route. */
export const __getStaticPathsRegistry = collectStaticPathsRegistry(routes, new Map())

// ─── 404 emission (PR C) ────────────────────────────────────────────────────
//
// Locales the build was configured for (PR H: \`zero({ i18n: { locales } })\`).
// Injected as a JSON-literal by the outer plugin so the walker can detect
// which RouteRecord serves which locale by matching its \`path\` against
// the \`/\${locale}\` / \`/\${locale}/*\` prefix. Empty array = no i18n,
// single-default-locale shape, walker collects exactly one entry keyed
// by \`null\` and the closeBundle writes a single \`dist/404.html\`.
const __i18nLocales = ${i18nLocalesLiteral}

// Walk the route tree and return ALL \`notFoundComponent\` references,
// keyed by which locale subtree they were found in (or \`null\` for the
// default / no-i18n case). fs-router attaches \`_404.tsx\` to its parent
// layout's RouteRecord (or to each page record when no wrapping layout
// exists — which is the per-locale subtree shape under PR H's root-
// layout-skip). The walker collects the FIRST match per locale via
// depth-first traversal: the per-locale subtree's \`notFoundComponent\`
// wins over the root's for that locale.
//
// Locale detection: a RouteRecord serves locale \`X\` if its \`path\`
// matches \`/X\` or starts with \`/X/\`. The default-locale entry
// (under \`prefix-except-default\` strategy) is keyed by \`null\` since
// its path doesn't carry a locale prefix.
function findNotFoundComponentsByLocale(rs, currentLocale) {
  const result = new Map()
  function walk(records, ambient) {
    for (const r of records) {
      const path = typeof r.path === "string" ? r.path : ""
      let locale = ambient
      for (const l of __i18nLocales) {
        if (path === \`/\${l}\` || path.startsWith(\`/\${l}/\`)) {
          locale = l
          break
        }
      }
      if (typeof r.notFoundComponent === "function") {
        if (!result.has(locale)) result.set(locale, r.notFoundComponent)
      }
      if (Array.isArray(r.children)) walk(r.children, locale)
    }
  }
  walk(rs, currentLocale)
  return result
}
export const __notFoundComponentsByLocale = findNotFoundComponentsByLocale(routes, null)

// Back-compat: legacy single-export, picks up whatever the walker
// classified as \`null\`-locale (default-locale or non-i18n root 404).
// External callers (none currently in main, but downstream consumers
// that imported this export pre-PR) keep working.
export const __notFoundComponent = __notFoundComponentsByLocale.get(null) ?? null

// Render the not-found component THROUGH the router (PR L5). We navigate
// to a synthetic non-matching probe URL per locale — \`resolveRoute\`
// (post-L5) walks the route tree finding the deepest parent
// \`notFoundComponent\` and builds a matched chain
// \`[...ancestorLayouts, syntheticLeaf]\`. The leaf carries the
// not-found component; rendering through the normal pipeline produces
// HTML WITH layout chrome — same headers, footers, navigation as
// regular pages. The locale prefix in the probe URL ensures the right
// per-locale layout subtree matches (under PR H's prefix strategy).
//
// Pre-L5 behavior (\`h(component, null)\` standalone) is preserved as a
// fallback when the route tree has \`notFoundComponent\` at the root
// but no \`isNotFound\` chain forms (older route shapes). The outer
// plugin checks \`__notFoundComponentsByLocale\` first to gate emission
// — if no notFoundComponent exists anywhere, \`__renderNotFound\` is
// never called.
export async function __renderNotFound(locale) {
  // Probe URL chosen to be highly improbable as a real route. The
  // suffix is deliberately literal (no \`Math.random\`) so build
  // outputs are deterministic across runs.
  const probePath = locale == null
    ? "/__pyreon_not_found_probe__"
    : \`/\${locale}/__pyreon_not_found_probe__\`

  // Try the router-driven path first. If the route tree has a parent
  // \`notFoundComponent\` reachable from the probe URL, resolveRoute's
  // fallback builds the chain through the layout and the normal render
  // pipeline produces 404 HTML wrapped in layout chrome.
  //
  // PR C — pass \`isNotFound: true\` so renderPath skips parent-layout
  // loaders. Layout loaders that hit auth resources / external APIs
  // shouldn't fire when generating a static 404 page (the build has
  // no real request context). Lazy components still resolve; only
  // \`r.loader()\` invocations are skipped.
  const result = await renderPath(probePath, { isNotFound: true })
  if (result && result.kind === "html") {
    return {
      appHtml: result.appHtml,
      head: result.head,
      loaderScript: result.loaderScript,
    }
  }

  // Fallback for tree shapes where the resolver returns empty matched
  // (no notFoundComponent walkable from this probe path). Render the
  // component standalone — same shape pre-L5.
  const component = locale == null
    ? (__notFoundComponentsByLocale.get(null) ?? __notFoundComponent)
    : __notFoundComponentsByLocale.get(locale)
  if (typeof component !== "function") return null

  return runWithRequestContext(async () => {
    const vnode = h(component, null)
    const { html: appHtml, head } = await renderWithHead(vnode)

    const styleTag = __pyreonGetStylerTag()
    const isEmpty = !styleTag || styleTag.indexOf("></style>") !== -1
    const finalHead = isEmpty ? head : styleTag + "\\n" + head

    return { appHtml, head: finalHead, loaderScript: "" }
  })
}
`.trimStart()
}

// Register the SSG-specific renderer with the shared dispatcher.
// See `ssr-build-shared.ts:_registerSsgEntryRenderer` for the
// dependency-inversion rationale (keeps the SSG locale walker
// co-located with its closeBundle wiring while letting the shared
// dispatcher pick the right renderer for `kind: 'ssg'`).
_registerSsgEntryRenderer(renderSsgEntrySource)

// Marker env var used to skip the SSG hook on the recursive SSR
// sub-build — the SSR pass loads the same vite config + same plugin
// chain. Per-mode flag namespaces (SSG vs SSR) eliminate the
// cross-mode flag-leak failure class.
const SSR_ENTRY_FILENAME = '__pyreon-zero-ssg-entry.js'

/** Per-route enumerator. URL pattern (`/posts/:id`) → params list. */
export type GetStaticPathsRegistry = Map<
  string,
  () => Promise<Array<{ params: Record<string, string> }>> | Array<{ params: Record<string, string> }>
>

/**
 * Substitute concrete values for `:param` / `:param*` segments in a URL
 * pattern. Mirrors the inverse of `filePathToUrlPath`.
 *
 *   /posts/:id            × { id: 'a' }            → /posts/a
 *   /posts/:id/:slug      × { id: 'a', slug: 'b' } → /posts/a/b
 *   /blog/:rest*          × { rest: 'a/b' }         → /blog/a/b   (catch-all preserves slashes)
 *
 * Missing params or empty values throw — the SSG plugin treats this as a
 * `getStaticPaths` error and records it in the per-path errors array.
 */
export function expandUrlPattern(pattern: string, params: Record<string, string>): string {
  return pattern
    .split('/')
    .map((seg) => {
      if (!seg.startsWith(':')) return seg
      const isCatchAll = seg.endsWith('*')
      const name = isCatchAll ? seg.slice(1, -1) : seg.slice(1)
      const value = params[name]
      if (value === undefined || value === '') {
        throw new Error(
          `[zero:ssg] getStaticPaths for "${pattern}" returned params without "${name}"`,
        )
      }
      // Path-escape guard. The value is substituted verbatim into the
      // URL that becomes a `dist/<path>/index.html` write target. A
      // single (non-catch-all) `:slug` is ONE segment — a value
      // containing `/` or being `.`/`..` (e.g. an unsanitized CMS slug
      // `../../secret`) would escape the intended structure and write
      // outside it. Catch-all `:slug*` legitimately spans segments
      // (`a/b/c`), so it's exempt from the `/` check but still rejects
      // `.`/`..` traversal segments.
      const segs = isCatchAll ? value.split('/') : [value]
      if (
        (!isCatchAll && value.includes('/')) ||
        segs.some((s) => s === '.' || s === '..')
      ) {
        throw new Error(
          `[zero:ssg] getStaticPaths for "${pattern}" produced an unsafe "${name}" value ` +
            `(${JSON.stringify(value)}): a ${isCatchAll ? 'catch-all' : 'dynamic'} segment ` +
            `must not contain path-traversal ("." / "..")${isCatchAll ? '' : ' or "/"'}.`,
        )
      }
      return value
    })
    .join('/')
}

/**
 * Auto-detect static paths from the route tree AND expand dynamic routes
 * via each route's `getStaticPaths` export (when present). A "static" path
 * is one with NO dynamic segments (`[id]`, `[...rest]`); a "dynamic" path
 * with `getStaticPaths` is expanded via the registry; remaining dynamic
 * routes are silently skipped (the user must hand-list them in
 * `ssg.paths`).
 */
async function autoDetectStaticPaths(
  routesDir: string,
  registry?: GetStaticPathsRegistry,
  errors: { path: string; error: unknown }[] = [],
  i18n?: I18nRoutingConfig,
): Promise<string[]> {
  // Routes dir missing → fall back to "/" anyway. A project that doesn't
  // expose routes via fs-routing (custom routes module, single-page app
  // shell, etc.) still needs at least an index.html so static hosts have
  // a default response. The user can always set explicit `ssg.paths` to
  // override this floor.
  if (!existsSync(routesDir)) return ['/']
  const files = await scanRouteFiles(routesDir)
  // PR H — fan routes into per-locale variants when `i18n` is configured.
  // Each duplicated FileRoute carries the same `getStaticPaths` enumerator
  // (via `exports`) so dynamic + i18n cardinality compounds naturally:
  // `/blog/[slug]` × `[en, de]` × 3 slugs → 6 paths under
  // `prefix-except-default`.
  const baseRoutes = parseFileRoutes(files)
  const fileRoutes = i18n ? expandRoutesForLocales(baseRoutes, i18n) : baseRoutes

  const out: string[] = []
  for (const r of fileRoutes) {
    if (r.isLayout || r.isError || r.isLoading || r.isNotFound) continue
    const path = r.urlPath
    if (!path) continue

    // Static path — emit as-is.
    if (!/[:*]/.test(path)) {
      out.push(path)
      continue
    }

    // Dynamic path — expand via getStaticPaths if available.
    const enumerator = registry?.get(path)
    if (!enumerator) continue // no getStaticPaths → skip silently

    try {
      const result = await enumerator()
      if (!Array.isArray(result)) {
        throw new Error(
          `getStaticPaths for "${path}" must return an array, got ${typeof result}`,
        )
      }
      for (const entry of result) {
        if (!entry || typeof entry !== 'object' || !entry.params) {
          throw new Error(
            `getStaticPaths for "${path}" returned an entry without "params"`,
          )
        }
        out.push(expandUrlPattern(path, entry.params))
      }
    } catch (error) {
      errors.push({ path, error })
    }
  }

  // Dedup (order-preserving). The same concrete path can be produced
  // more than once — a `getStaticPaths` returning a duplicate slug, or
  // i18n route fan-out colliding — which otherwise renders the same
  // `dist/<path>/index.html` twice (wasted work + last-write race) and
  // feeds a duplicate `<url>` into the SSG→sitemap merge.
  const deduped = [...new Set(out)]

  // Always include "/" as a fallback if no static routes were found —
  // a project with only dynamic routes still needs an index.html for the
  // host to know where to send unmatched URLs.
  return deduped.length > 0 ? deduped : ['/']
}

async function resolvePaths(
  config: ZeroConfig,
  routesDir: string,
  registry?: GetStaticPathsRegistry,
  errors: { path: string; error: unknown }[] = [],
): Promise<string[]> {
  const explicit = config.ssg?.paths
  if (typeof explicit === 'function') {
    const result = await explicit()
    return Array.isArray(result) ? result : []
  }
  if (Array.isArray(explicit)) return explicit
  return autoDetectStaticPaths(routesDir, registry, errors, config.i18n)
}

// `writeFileAtomic`, `mkdirOnce`, `_resetMkdirCache` are imported from
// `./ssr-build-shared` (see top-level imports). See that module's JSDoc
// for the atomic-rename / per-build-cache contract — both shared across
// the SSG + SSR/ISR plugins so the cleanup recipe can never diverge.

/**
 * Build the per-locale breakdown summary string for the closeBundle log.
 *
 * M2.5 — Computes per-locale path counts from `writtenPaths` by checking
 * each path's leading segment against the configured locale list. Paths
 * with no locale prefix go to the default locale (under
 * `prefix-except-default`) or are skipped (under `prefix`, where every
 * locale carries an explicit prefix — unprefixed paths are unexpected).
 *
 * Returns `` ` [en: 100, de: 100, cs: 100]` `` (with leading space) for
 * pretty concatenation into the summary line, or empty string when i18n
 * is unconfigured / writtenPaths is empty.
 *
 * @internal Exposed via `_internal.buildLocaleSummary` for unit tests.
 */
function buildLocaleSummary(
  writtenPaths: readonly string[],
  i18n: I18nRoutingConfig,
): string {
  if (writtenPaths.length === 0 || i18n.locales.length === 0) return ''
  const counts = new Map<string, number>()
  for (const locale of i18n.locales) counts.set(locale, 0)
  const defaultLocale = i18n.defaultLocale ?? i18n.locales[0] ?? ''
  const strategy = i18n.strategy ?? 'prefix-except-default'
  for (const p of writtenPaths) {
    // Split on '/' — `/de/about` → ['', 'de', 'about']; `/about` → ['', 'about']
    const firstSeg = p.split('/')[1]
    if (firstSeg && counts.has(firstSeg)) {
      counts.set(firstSeg, (counts.get(firstSeg) ?? 0) + 1)
    } else if (strategy === 'prefix-except-default' && defaultLocale) {
      // Unprefixed path under prefix-except-default belongs to the default locale.
      counts.set(defaultLocale, (counts.get(defaultLocale) ?? 0) + 1)
    }
    // Under `prefix` strategy: unprefixed paths are unexpected (every
    // locale should carry an explicit prefix). Silently skip — the
    // path-collision detector (M1.4) would have caught structurally
    // invalid duplicates anyway.
  }
  const parts: string[] = []
  for (const locale of i18n.locales) parts.push(`${locale}: ${counts.get(locale) ?? 0}`)
  return ` [${parts.join(', ')}]`
}

/**
 * Detect duplicate URLs in the resolved-paths list. Returns the duplicates
 * (sorted, unique). Empty array = no collisions.
 *
 * The render loop's `writtenPaths.push(p)` would silently last-wins on
 * duplicates — two routes producing the same URL would have one's HTML
 * overwrite the other's with no error. Catching the collision before
 * render makes the conflict visible at the source-of-truth (the routes
 * tree), not at the symptom (mysterious HTML drift between rebuilds).
 *
 * @internal Exposed via `_internal.detectPathCollisions` for unit tests.
 */
function detectPathCollisions(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const p of paths) {
    if (seen.has(p)) duplicates.add(p)
    seen.add(p)
  }
  return [...duplicates].sort()
}

/** Format a path-collision error message with actionable guidance. */
/**
 * Wiring helper: run the collision detector + throw with the formatted error
 * when any collisions are found. The closeBundle handler calls this between
 * `resolvePaths` and the render loop. Factored out so unit tests can exercise
 * the full "detect → throw" path without spinning up a Vite SSR sub-build.
 *
 * @internal Exposed via `_internal.assertNoPathCollisions` for unit tests.
 */
function assertNoPathCollisions(paths: readonly string[]): void {
  const collisions = detectPathCollisions(paths)
  if (collisions.length > 0) {
    throw new Error(formatPathCollisionError(collisions))
  }
}

function formatPathCollisionError(duplicates: readonly string[]): string {
  const list = duplicates.map((p) => `  - ${p}`).join('\n')
  return `[Pyreon] SSG path collision — ${duplicates.length} URL(s) resolved by multiple routes:\n${list}\nThis happens when a static route + getStaticPaths return overlap, or two getStaticPaths enumerators produce the same URL. Inspect your routes tree and ensure each URL is produced by exactly one route.`
}

function resolveOutputPath(distDir: string, path: string): string {
  if (path === '/') return join(distDir, 'index.html')
  if (path.endsWith('.html')) return join(distDir, path)
  return join(distDir, path, 'index.html')
}

/**
 * Path-containment check that is SEPARATOR-TERMINATED. A bare
 * `resolve(filePath).startsWith(resolve(distDir))` is a string-prefix
 * test, not a path test: with distDir `/app/dist`, a traversed filePath
 * resolving to the SIBLING `/app/dist-evil/x` passes
 * `'/app/dist-evil/x'.startsWith('/app/dist')` → true and the build
 * writes outside the intended output root. `path` derives from caller
 * route params (CMS slugs via `getStaticPaths`), so this is reachable.
 */
function isInsideDist(distDir: string, filePath: string): boolean {
  const root = resolve(distDir)
  const target = resolve(filePath)
  return target === root || target.startsWith(root + sep)
}

// ─── Redirect emission (PR B) ──────────────────────────────────────────────
//
// The shape returned by the SSG entry's renderPath when a loader throws
// `redirect()`. The `kind` discriminator lets the closeBundle loop branch
// to the right writer (HTML file vs. redirect-manifest entry).
export interface RedirectEntry {
  from: string
  to: string
  status: number
}

/**
 * Render Netlify / Cloudflare Pages `_redirects` file content. One line
 * per redirect, format: `<from> <to> <status>`. Both platforms parse this
 * format identically; Vercel ignores it (use the JSON below). Lines with
 * leading `#` are comments — included so the file is self-documenting in
 * a deploy log.
 */
function renderNetlifyRedirects(entries: RedirectEntry[]): string {
  if (entries.length === 0) return ''
  const lines = ['# Auto-generated by @pyreon/zero SSG. Do not edit.']
  for (const e of entries) {
    lines.push(`${e.from} ${e.to} ${e.status}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * Render Vercel `_redirects.json` content. Vercel reads this from the
 * `vercel.json` `redirects` array shape — but the bare `_redirects.json`
 * file ships alongside as documentation / fallback for adapters that
 * read either format. The 308/301/302/307 status maps to Vercel's
 * `permanent: true|false` boolean (308/301 → permanent; 302/307 →
 * temporary).
 */
function renderVercelRedirectsJson(entries: RedirectEntry[]): string {
  return `${JSON.stringify(
    {
      redirects: entries.map((e) => ({
        source: e.from,
        destination: e.to,
        permanent: e.status === 301 || e.status === 308,
        statusCode: e.status,
      })),
    },
    null,
    2,
  )}\n`
}

/**
 * Render a meta-refresh HTML stub for static hosts that don't read
 * `_redirects` (plain S3, GitHub Pages, simple file servers). The
 * `<meta http-equiv="refresh" content="0; url=…">` triggers a
 * client-side refresh; the canonical link is for SEO so search
 * engines de-dupe the source path against the target. Status code
 * has no HTML equivalent — a meta-refresh is always "client-side."
 */
function renderMetaRefreshHtml(target: string): string {
  // Escape the target for HTML attribute context. Targets are typically
  // absolute paths (`/login`) or absolute URLs — HTML special chars are
  // rare but possible (`?q=a&b=c`). Always escape `&`, `<`, `>`, `"`,
  // `'` to be safe.
  const escaped = target
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${escaped}">
  <link rel="canonical" href="${escaped}">
  <title>Redirecting to ${escaped}</title>
</head>
<body>
  <p>Redirecting to <a href="${escaped}">${escaped}</a>...</p>
</body>
</html>
`
}

/**
 * Serialize the captured render-loop errors as a stable JSON artifact.
 * Each entry has `{ path, message, name, stack }`. Errors that aren't
 * `Error` instances (e.g. a loader that threw a string) are coerced via
 * `String()` for `message`; `name` falls back to `'Error'`; `stack` is
 * `undefined` (omitted from JSON output).
 *
 * Wrapped in `{ errors: [...] }` rather than emitted as a bare array so
 * future fields (timing, build metadata) can be added without breaking
 * existing CI consumers. Pretty-printed with 2-space indent — the file
 * is meant to be read both by tooling AND humans diagnosing a failed
 * build, so byte-density is not the priority.
 */
/**
 * Drain `items` through `concurrency` parallel workers, calling
 * `processItem(item)` on each and `onSettled(item, idx)` once each
 * settles (regardless of resolve/reject). The work-stealing pattern
 * (each worker pulls from a shared `nextIdx++` cursor) keeps load
 * balanced even when individual `processItem` calls vary widely in
 * duration — a fast item doesn't make its worker idle until the slowest
 * peer finishes.
 *
 * Settle ordering: `onSettled` fires in the order items finish, NOT in
 * input order. `idx` is the index into `items` (same identity across
 * `processItem` and `onSettled`), useful for "completed N of M"
 * progress reporting.
 *
 * Concurrency clamping: ≤ 0 inputs ARE clamped to 1 — the worker pool
 * is meaningless without at least one worker, but a value of `0` from
 * a misconfiguration shouldn't silently hang. The actual worker count
 * is `min(concurrency, items.length)` so a 2-item list with concurrency
 * 10 only spawns 2 workers (no idle workers spawned).
 *
 * Errors from `processItem` are NOT caught here — callers must handle
 * exceptions inside `processItem` (the SSG path does so via try/catch
 * in `renderOne`). Errors from `onSettled` likewise propagate; in the
 * SSG path the caller wraps it to record into `errors[]`. We don't
 * silently swallow because that would hide real bugs.
 *
 * Atomic operations under Node's single-threaded JS: `nextIdx++` is
 * atomic — workers never observe a partial increment, so two workers
 * never claim the same index. The pool relies on this invariant; do
 * NOT port to a multi-threaded runtime without revisiting.
 */
async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  processItem: (item: T, idx: number) => Promise<void>,
  onSettled?: (item: T, idx: number) => Promise<void> | void,
): Promise<void> {
  const cap = Math.max(1, concurrency)
  const workerCount = Math.min(cap, items.length)
  if (workerCount === 0) return

  let nextIdx = 0

  const worker = async (): Promise<void> => {
    while (true) {
      const idx = nextIdx++
      if (idx >= items.length) return
      const item = items[idx]!
      await processItem(item, idx)
      if (onSettled) await onSettled(item, idx)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
}

/**
 * PR I — build the revalidate manifest from scanned FileRoutes + the
 * list of paths that successfully rendered.
 *
 * For each FileRoute with a `revalidateLiteral` (captured at scan time
 * via `detectRouteExports`), parse the literal as JSON (numbers and
 * `false` are valid JSON tokens), build a regex from the route's
 * urlPath pattern, and match against `writtenPaths`. Each matching
 * concrete path goes into the manifest under the route's revalidate
 * value.
 *
 * Returns `{}` when no routes have a revalidate literal — the caller
 * checks `Object.keys(...).length > 0` before writing the manifest.
 *
 * Static routes match exactly (urlPath === concretePath). Dynamic
 * routes (`/posts/:id`) compile to `^\/posts\/[^/]+$`. Catch-alls
 * (`/blog/:slug*`) compile to `^\/blog\/.*$`. Layout / error / loading
 * / not-found routes are skipped — they don't appear in writtenPaths
 * anyway, but the explicit guard keeps the helper stand-alone-testable.
 *
 * Exposed via `_internal.buildRevalidateManifest` so it can be unit-
 * tested without a full SSG round-trip.
 */
export function buildRevalidateManifest(
  fileRoutes: ReadonlyArray<{
    urlPath: string
    isLayout: boolean
    isError: boolean
    isLoading: boolean
    isNotFound: boolean
    exports?: { revalidateLiteral?: string }
  }>,
  writtenPaths: readonly string[],
): Record<string, number | false> {
  const manifest: Record<string, number | false> = {}

  // PR-S11: per-path most-specific-route resolution. Pre-fix the loop
  // was routes-outer × paths-inner, with `manifest[concretePath] = value`
  // overwriting on every match. If a concrete path like `/blog/special`
  // matched BOTH a static route (`/blog/special`) AND a catch-all
  // (`/blog/:slug*`), whichever route was iterated LAST won — silently
  // wrong because the static route is structurally more specific and
  // should claim the path.
  //
  // The fix inverts the loop: iterate writtenPaths outer, find ALL
  // matching candidate routes, sort by specificity (more-static-segments
  // wins, then more-total-segments wins), take the top one. Only the
  // most-specific route's revalidateLiteral lands in the manifest.
  // Routes with no revalidate literal still WIN if they're the most
  // specific — that's the correct semantic: a static `/blog/special`
  // with NO revalidate export should keep `/blog/special` OUT of the
  // revalidate manifest entirely (the catch-all's revalidate doesn't
  // claim a path the catch-all doesn't actually own at runtime).

  // Pre-compile each route's matcher + specificity once.
  interface Candidate {
    matcher: (concrete: string) => boolean
    revalidate: number | false | null
    specificity: number
    totalSegments: number
  }
  const candidates: Candidate[] = []
  for (const route of fileRoutes) {
    if (route.isLayout || route.isError || route.isLoading || route.isNotFound) continue
    const literal = route.exports?.revalidateLiteral
    let revalidate: number | false | null = null
    if (literal !== undefined) {
      try {
        const parsed = JSON.parse(literal)
        if (typeof parsed === 'number' || parsed === false) revalidate = parsed as number | false
      } catch {
        // skip — non-literal expressions can't be parsed at build time
      }
    }
    const segs = pathSegmentsOf(route.urlPath)
    const staticSegs = segs.filter((s) => !s.includes(':') && !s.includes('*')).length
    candidates.push({
      matcher: compileUrlPatternMatcher(route.urlPath),
      revalidate,
      specificity: staticSegs,
      totalSegments: segs.length,
    })
  }

  for (const concretePath of writtenPaths) {
    let best: Candidate | null = null
    for (const c of candidates) {
      if (!c.matcher(concretePath)) continue
      if (
        !best ||
        c.specificity > best.specificity ||
        (c.specificity === best.specificity && c.totalSegments > best.totalSegments)
      ) {
        best = c
      }
    }
    // Only emit when the most-specific route HAS a revalidate literal.
    // If the deepest match has none, the catch-all's value doesn't
    // claim a path it doesn't structurally own.
    if (best && best.revalidate !== null) {
      manifest[concretePath] = best.revalidate
    }
  }
  return manifest
}

/** Split a urlPath into segments (filter blanks). */
function pathSegmentsOf(urlPath: string): string[] {
  return urlPath.split('/').filter((s) => s.length > 0)
}

/**
 * Compile a route's urlPath pattern (`/posts/:id`, `/blog/:slug*`,
 * `/about`) into a predicate that returns `true` for any concrete
 * path that matches. Static patterns return a `===` comparator.
 * Dynamic / catch-all patterns return a regex predicate.
 *
 * Internal helper to `buildRevalidateManifest`. Mirrors the routing
 * matcher's behaviour for `:param` (single segment) and `:param*`
 * (catch-all, zero-or-more segments). Doesn't need to handle every
 * router edge case — the writtenPaths it matches against are already
 * concrete (no params, no wildcards).
 */
function compileUrlPatternMatcher(urlPath: string): (concrete: string) => boolean {
  if (!urlPath.includes(':') && !urlPath.includes('*')) {
    return (concrete) => concrete === urlPath
  }
  // Escape regex metachars (except `:` and `*` which we handle
  // explicitly), then substitute `:name*` → `.*` and `:name` → `[^/]+`.
  // Order matters — `:name*` MUST be replaced before `:name`.
  const regex = urlPath
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([A-Za-z_$][\w$]*)\*/g, '.*')
    .replace(/:([A-Za-z_$][\w$]*)/g, '[^/]+')
  const re = new RegExp(`^${regex}$`)
  return (concrete) => re.test(concrete)
}

function renderErrorArtifact(entries: { path: string; error: unknown }[]): string {
  const errors = entries.map(({ path, error }) => ({
    path,
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error',
    stack: error instanceof Error ? error.stack : undefined,
  }))
  return `${JSON.stringify({ errors }, null, 2)}\n`
}

// `injectIntoTemplate` is imported from `./ssr-build-shared` — single
// source of truth for the placeholder-or-fallback HTML injection rules,
// shared with the SSR/ISR plugin so the same head/body/scripts pipeline
// applies uniformly across modes.

/**
 * Plugin that performs SSG when `mode: "ssg"` is configured. Wires into
 * Vite's `closeBundle` hook so it runs once after the main client build
 * completes. The recursive SSR sub-build is gated by an env flag.
 */
export function ssgPlugin(userConfig: ZeroConfig = {}): Plugin {
  const config = resolveConfig(userConfig)
  let root = ''
  let distDir = ''
  // Captured from the OUTER build's resolved config so the inner SSR
  // sub-build (which runs `configFile: false`) emits assets identically —
  // otherwise small images inline as `data:` URIs in SSG HTML while the
  // client build emits hashed files. See `buildInnerBuildOptions`.
  let assetsInlineLimit: BuildOptions['assetsInlineLimit']
  let assetsDir: string | undefined
  // USER plugins captured from the OUTER build's resolved plugin chain.
  // Forwarded into the inner SSR sub-build so non-zero plugins (e.g.
  // @pyreon/zero-content's content() plugin which transforms .md →
  // .tsx) work inside the SSG path-enumeration + per-page render
  // passes. Without this, route files that import from a user plugin's
  // virtual module OR import a file type a user plugin handles crash
  // the inner build with unresolved-import / parse errors. See
  // `buildSsrBundle`'s userPlugins option for the filtering rules.
  let userPlugins: readonly Plugin[] = []
  // Track whether this plugin instance is running inside the inner SSR
  // sub-build (where it must be a no-op) vs. the outer client build.
  const isInnerBuild = process.env[SSG_BUILD_FLAG] === '1'
  // Whether the USER explicitly enabled Vite's build manifest. When they did,
  // closeBundle must NOT delete it post-build (it's theirs); when only the
  // modulepreload feature enabled it, closeBundle cleans it up (internal).
  let userEnabledManifest = false

  return {
    name: 'pyreon-zero-ssg',
    apply: 'build',
    enforce: 'post',

    config(userViteConfig, env) {
      // Enable Vite's build manifest on the OUTER client build so closeBundle
      // can map each route → its chunk graph for per-route modulepreload.
      // Skip the inner SSR sub-build (no-op there) and any SSR build. The
      // manifest is read + deleted post-SSG — it's an internal build artifact,
      // never shipped to the host. Opt out via `zero({ ssg: { modulePreload: false } })`.
      if (isInnerBuild || env.isSsrBuild) return null
      if (config.ssg?.modulePreload === false) return null
      // If the user already enabled the manifest themselves, it's theirs —
      // don't delete it post-build.
      const m = userViteConfig.build?.manifest
      userEnabledManifest = m === true || typeof m === 'string'
      return { build: { manifest: true } }
    },

    configResolved(resolved) {
      root = resolved.root
      distDir = resolve(root, resolved.build.outDir)
      assetsInlineLimit = resolved.build.assetsInlineLimit
      assetsDir = resolved.build.assetsDir
      // Capture the resolved plugin chain — `buildSsrBundle` filters
      // out the zero + pyreon plugins (which the inner build adds back
      // itself) and forwards everything else.
      userPlugins = resolved.plugins as readonly Plugin[]
    },

    async closeBundle() {
      if (config.mode !== 'ssg') return
      if (isInnerBuild) return

      // Per-build mkdir dedup — `dist/` may have been wiped between builds
      // (vite build --watch + manual clean, CI pipelines, etc.), so cache
      // entries from a prior build are unsafe to reuse.
      //
      // PR-S13: also reset in `finally` (see end of this function). The
      // start-of-build reset gives a fresh state for THIS build; the
      // finally reset gives clean state for the NEXT build even if THIS
      // one crashes mid-render. Defense-in-depth — without the finally,
      // a thrown exception mid-render-loop leaves the cache populated;
      // subsequent vite-build-watch cycles that fall through some
      // pre-`closeBundle` short-circuit (e.g. a build error abort) would
      // reuse stale entries. Pattern A from the audit campaign: module-
      // global state with eviction-on-success-only.
      _resetMkdirCache()

      try {
      const ssrOutDir = join(distDir, '.zero-ssg-server')
      const indexHtmlPath = join(distDir, 'index.html')

      if (!existsSync(indexHtmlPath)) {
        // Client build hasn't produced index.html — nothing we can wrap.
        // Most likely: user is running `vite build --ssr` directly, in
        // which case this plugin shouldn't be active anyway.
        // oxlint-disable-next-line no-console
        console.warn(
          `[zero:ssg] Skipping SSG — ${indexHtmlPath} not found. Did the client build complete?`,
        )
        return
      }

      // Materialize the SSR entry to disk inside the routes directory so
      // its imports resolve relative to the user's source tree. Doing this
      // INSIDE node_modules-equivalent paths breaks Vite's plugin-resolution
      // semantics; placing it next to the user's routes lets zero's main
      // plugin pick it up identically to user code. Cleaned up after the
      // build.
      const entryPath = join(root, SSR_ENTRY_FILENAME)
      // PR K: bake the configured locales into the SSG entry source so the
      // per-locale 404 walker can detect which RouteRecord serves which
      // locale at module-eval time inside the SSR sub-build.
      const i18nLocales = config.i18n?.locales ?? []
      await materializeEntry(entryPath, renderSsgEntrySource(i18nLocales))

      // Inner SSR sub-build via the shared helper. Owns the env-flag
      // set/clear recipe — see `ssr-build-shared.ts:buildSsrBundle`.
      // We add the entry-file cleanup in our own finally because the
      // helper deliberately doesn't own that side effect (callers may
      // want to keep the entry around for debugging).
      try {
        await buildSsrBundle({
          root,
          entryPath,
          outDir: ssrOutDir,
          outputFilename: 'entry-server.mjs',
          envFlag: SSG_BUILD_FLAG,
          userConfig,
          assetsInlineLimit,
          assetsDir,
          userPlugins,
        })
      } finally {
        // Remove the synthetic entry file so it never lands in user's
        // working tree.
        try {
          await rm(entryPath, { force: true })
        } catch {
          // best-effort cleanup
        }
      }

      // Load the built renderer. Use a file:// URL to avoid Node import
      // cache collisions across multiple builds within the same process.
      const handlerPath = join(ssrOutDir, 'entry-server.mjs')
      if (!existsSync(handlerPath)) {
        // oxlint-disable-next-line no-console
        console.warn(`[zero:ssg] SSR build did not produce ${handlerPath} — skipping prerender`)
        return
      }
      // The path is computed at runtime from a freshly-built SSR artifact
      // — Vite's `dynamic-import-vars` plugin can't statically analyze the
      // import. Without the `@vite-ignore` hint, Vite emits a console
      // warning on every consumer's dev server boot ("The above dynamic
      // import cannot be analyzed by Vite"), which looks alarming but is
      // expected here. Suppress per Vite's own recommendation.
      //
      // SSG is a legitimate dual-load scenario — the nested SSR build
      // emits its own bundled copy of `@pyreon/*` packages at
      // `dist/client/.zero-ssg-server/entry-server.mjs`, which the outer
      // process imports here alongside its own workspace copy. Same code,
      // two paths → the singleton sentinel from `@pyreon/reactivity`
      // would throw and abort the build. `withSilent` from
      // `@pyreon/reactivity` scopes the opt-out via a refcount on the
      // sentinel state — race-safe under concurrency (the prior
      // env-var dance leaked `silent` permanently when N opt-out scopes
      // overlapped — see `withSilent` JSDoc for the full rationale).
      type HandlerMod = {
        // PR B — return shape is a discriminated union: regular paths
        // produce HTML, redirect-throwing loaders produce a redirect
        // descriptor for the manifest writer.
        default: (
          path: string,
        ) => Promise<
          | {
              kind: 'html'
              appHtml: string
              head: string
              loaderScript: string
              routeModules?: string[]
            }
          | { kind: 'redirect'; from: string; to: string; status: number }
        >
        // PR A — getStaticPaths registry collected from the routes tree.
        __getStaticPathsRegistry?: GetStaticPathsRegistry
        // PR C — 404 emission. The synthetic SSG entry walks the routes
        // tree at module-eval time and exports the first
        // `notFoundComponent` it finds (root-level `_404.tsx` in the
        // common case), plus an async `__renderNotFound()` that pushes
        // it through the same renderWithHead pipeline as regular paths.
        // The outer plugin reads both: presence gates the emission,
        // the renderer produces the same `{ appHtml, head, loaderScript }`
        // shape so `injectIntoTemplate` can reuse the same injection
        // rules. The `?` keeps zero forward-compatible — an entry built
        // before PR C just doesn't expose these and emit404 silently
        // no-ops.
        __notFoundComponent?: unknown
        __notFoundComponentsByLocale?: Map<string | null, unknown>
        __renderNotFound?: (
          locale?: string | null,
        ) => Promise<{ appHtml: string; head: string; loaderScript: string } | null>
      }
      const handlerMod = (await withSilent(
        () => import(/* @vite-ignore */ pathToFileURL(handlerPath).href),
      )) as HandlerMod
      const renderPath = handlerMod.default
      const registry = handlerMod.__getStaticPathsRegistry

      // Read the user's built index.html template. Vite has just produced it
      // with hashed asset URLs (`/assets/index-XYZ.js`), preload links, etc.
      // We inject the rendered head/body/loader-data into placeholder
      // comments — same convention as zero's dev SSR. If the template lacks
      // the placeholders, we fall back to inserting before `</head>` and
      // `</body>` respectively so a bare `index.html` still works.
      const template = await readFile(indexHtmlPath, 'utf-8')

      // Per-route modulepreload: read the client build manifest (enabled via
      // the `config()` hook) so each route's STATIC chunk closure can be
      // pre-declared in its <head>. Graceful at every step — a missing or
      // malformed manifest just disables the feature for this build.
      // `modulepreload` is a non-load-bearing hint, never a correctness dep.
      const modulePreloadEnabled = config.ssg?.modulePreload !== false
      const preloadBase = config.base ?? '/'
      let preloadManifest: ViteManifest | null = null
      let entryPreloadedHrefs: Set<string> = new Set()
      if (modulePreloadEnabled) {
        try {
          const manifestRaw = await readFile(join(distDir, '.vite', 'manifest.json'), 'utf-8')
          preloadManifest = JSON.parse(manifestRaw) as ViteManifest
          // The entry's static graph + Vite's own modulepreloads are already
          // in the template — subtract them so each route emits only its delta.
          entryPreloadedHrefs = new Set([
            ...computeEntryHrefs(preloadManifest, preloadBase),
            ...parseExistingModulePreloads(template),
          ])
        } catch {
          preloadManifest = null
        }
      }

      // Errors from getStaticPaths run AND per-page render are collected
      // into the same array so the post-render summary catches both. The
      // SSG plugin completes either way — a single bad route shouldn't
      // abort the whole site build.
      const errors: { path: string; error: unknown }[] = []

      // Resolve paths and render.
      const routesDir = join(root, 'src', 'routes')
      const paths = await resolvePaths(config, routesDir, registry, errors)

      if (paths.length === 0) {
        // oxlint-disable-next-line no-console
        console.warn('[zero:ssg] No static paths to prerender — set ssg.paths in zero config')
        await rm(ssrOutDir, { recursive: true, force: true })
        return
      }

      // M1.4 — Detect duplicate paths BEFORE the render loop. Two routes
      // producing the same URL (a static `/posts/foo.tsx` + a dynamic
      // `[id].tsx` with `getStaticPaths: [{id:'foo'}]`) would silently
      // last-wins under `writtenPaths.push(p)`. Surface as an actionable
      // error with the duplicate URL listed so users can fix the source
      // route conflict instead of wondering why HTML mysteriously changes
      // between rebuilds. Bisect-verified via `assertNoPathCollisions` unit
      // tests: removing the call → fixture with dupes proceeds to render
      // and silently overwrites; restoring → throws with the formatted
      // error listing every duplicate URL.
      assertNoPathCollisions(paths)

      let pages = 0
      // PR B — collect redirects from loader-throws so the post-render
      // step can write `_redirects` / `_redirects.json` / meta-refresh
      // HTML files. Loader redirects DON'T produce a per-path index.html
      // — the redirect IS the response.
      const redirects: RedirectEntry[] = []
      // PR F — track every path that produced a `dist/<path>/index.html` so
      // the post-loop step can emit `dist/_pyreon-ssg-paths.json` for
      // `seoPlugin({ sitemap: { useSsgPaths: true } })` to read at its
      // own `closeBundle`. We track the resolved URL paths (post-
      // getStaticPaths expansion + per-locale duplication when PR H
      // ships) — exactly what the sitemap.xml needs. Paths that errored
      // OR redirected are intentionally absent: errored pages have no
      // HTML to link to, and redirect sources go to `_redirects`, not
      // sitemap.xml (linking to a redirect source confuses crawlers).
      const writtenPaths: string[] = []
      const start = Date.now()

      // PR D — render a single path. Extracted from the inline loop body
      // so the worker-pool below can call it concurrently. All side
      // effects (redirects.push, errors.push, writtenPaths.push, pages++)
      // are append-only mutations on shared arrays/counter — safe under
      // the concurrent worker pattern because Node is single-threaded
      // (each worker yields at every `await`, never in mid-statement).
      //
      // Returns the path on settle so the worker can fire onProgress with
      // it. Throws are NOT propagated — they're caught here and recorded
      // in `errors[]`, so a single failed path can't take down the worker.
      const renderOne = async (p: string): Promise<void> => {
        // M2.3 — emit `ssg.pathRender` per attempted render. Pair with
        // `ssg.pathWrite` / `ssg.pathRedirect` / `ssg.pathError` to see
        // per-path settle distribution.
        if (__DEV__) _countSink.__pyreon_count__?.('ssg.pathRender')
        // Hold the timer id outside try/Promise.race so the finally
        // block can `clearTimeout` it on the success path. Pre-fix the
        // rejection setTimeout was left pending until 30s every time
        // `renderPath(p)` won the race (i.e. every successful render).
        // Concurrent worker pool × N paths under default `concurrency: 4`
        // → up to N pending timer closures across the whole build,
        // each pinning a rejection callback.
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        try {
          const result = await Promise.race([
            renderPath(p),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(
                () => reject(new Error(`Prerender timeout for "${p}" (30s)`)),
                30_000,
              )
            }),
          ])

          if (result.kind === 'redirect') {
            // M2.3 — track redirect outcomes separately from successful renders.
            if (__DEV__) _countSink.__pyreon_count__?.('ssg.pathRedirect')
            // PR B — loader threw `redirect()`. Record for the manifest;
            // optionally emit a meta-refresh HTML stub at the source path.
            redirects.push({ from: result.from, to: result.to, status: result.status })

            if (config.ssg?.redirectsAsHtml === 'meta-refresh') {
              const filePath = resolveOutputPath(distDir, p)
              if (!isInsideDist(distDir, filePath)) {
                errors.push({ path: p, error: new Error(`Path traversal detected: "${p}"`) })
                return
              }
              await mkdirOnce(dirname(filePath))
              await writeFile(filePath, renderMetaRefreshHtml(result.to), 'utf-8')
            }
            return
          }

          // Inject per-route <link rel=modulepreload> into this page's <head>
          // (the route component chunk + its STATIC closure, minus the entry
          // graph). Islands-safe: only manifest `imports` are followed, never
          // `dynamicImports`. No-op if the manifest is unavailable or the route
          // has no resolvable modules.
          if (preloadManifest && result.routeModules && result.routeModules.length > 0) {
            const hrefs = computeRoutePreloadHrefs({
              manifest: preloadManifest,
              routeModules: result.routeModules,
              root,
              base: preloadBase,
              alreadyPreloaded: entryPreloadedHrefs,
              relativeFn: relative,
            })
            if (hrefs.length > 0) {
              result.head = `${renderModulePreloadLinks(hrefs)}\n${result.head}`
            }
          }

          const html = injectIntoTemplate(template, result)

          const filePath = resolveOutputPath(distDir, p)

          // Path-traversal guard — same as @pyreon's server's prerender.
          if (!isInsideDist(distDir, filePath)) {
            errors.push({ path: p, error: new Error(`Path traversal detected: "${p}"`) })
            return
          }

          await mkdirOnce(dirname(filePath))
          await writeFile(filePath, html, 'utf-8')
          pages++
          writtenPaths.push(p)
          // M2.3 — track successful HTML emits. `ssg.pathRender - ssg.pathWrite
          // - ssg.pathRedirect - ssg.pathError` should sum to roughly zero;
          // non-zero residual = paths swallowed silently somewhere.
          if (__DEV__) _countSink.__pyreon_count__?.('ssg.pathWrite')
        } catch (error) {
          // M2.3 — track render-error outcomes.
          if (__DEV__) _countSink.__pyreon_count__?.('ssg.pathError')
          errors.push({ path: p, error })
          // PR G — onPathError fallback hook. The user-supplied callback
          // can return HTML to write at the path's URL, OR null to skip.
          // The error is ALREADY recorded in `errors[]` before this call
          // so the post-build summary catches it regardless of what the
          // callback does. The callback's own throws are caught + recorded
          // as a separate entry — a buggy callback shouldn't take down
          // the whole build, AND we surface the bug instead of swallowing.
          if (config.ssg?.onPathError) {
            try {
              const fallbackHtml = await config.ssg.onPathError(p, error)
              if (typeof fallbackHtml === 'string') {
                const filePath = resolveOutputPath(distDir, p)
                if (!isInsideDist(distDir, filePath)) {
                  errors.push({ path: p, error: new Error(`Path traversal detected: "${p}"`) })
                  return
                }
                await mkdirOnce(dirname(filePath))
                await writeFile(filePath, fallbackHtml, 'utf-8')
                pages++
              }
            } catch (callbackError) {
              errors.push({ path: `${p} (onPathError)`, error: callbackError })
            }
          }
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId)
        }
      }

      // PR D — worker-pool concurrency. Default 4 workers in flight; the
      // user can opt into more via `ssg.concurrency` (CI multi-core) or
      // back to 1 for fully sequential (the pre-PR-D shape). Per-path
      // logic lives in `renderOne()`; the pool primitive lives in
      // `runWithConcurrency()` (testable in isolation).
      //
      // Progress ordering: `onProgress` fires in path-SETTLE order, NOT
      // input order. Across workers, callbacks may run in parallel —
      // the runtime doesn't serialize them. If you need strict serial
      // output (e.g. a progress bar painting one line at a time), wrap
      // the callback to push to a single-consumer queue.
      const concurrency = Math.max(1, config.ssg?.concurrency ?? 4)
      let completed = 0

      await runWithConcurrency(paths, concurrency, renderOne, async (p) => {
        completed++
        if (config.ssg?.onProgress) {
          try {
            await config.ssg.onProgress({
              completed,
              total: paths.length,
              currentPath: p,
              elapsed: Date.now() - start,
            })
          } catch (callbackError) {
            errors.push({ path: `${p} (onProgress)`, error: callbackError })
          }
        }
      })

      // Clean up the Vite build manifest — it's an internal artifact this
      // plugin enabled (via `config()`) only to drive per-route modulepreload;
      // it should not ship to the host. Skip when the USER enabled it.
      if (modulePreloadEnabled && !userEnabledManifest) {
        await rm(join(distDir, '.vite', 'manifest.json'), { force: true }).catch(() => {})
      }

      // PR F — Sitemap path manifest.
      //
      // Write the resolved URL paths to `dist/_pyreon-ssg-paths.json` so
      // `seoPlugin({ sitemap: { useSsgPaths: true } })` can read them at
      // its own `closeBundle` and emit a sitemap that includes dynamic-
      // route enumerations (PR A's `getStaticPaths`) AND per-locale
      // variants (PR H, when shipped). Without this manifest, `seoPlugin`
      // walks the file-system route tree directly and silently skips
      // dynamic routes (`[id]`) because their concrete values aren't
      // knowable at file-scan time.
      //
      // The 404 path is omitted intentionally — error pages don't belong
      // in sitemap.xml. Redirected sources are ALSO omitted (they're
      // already absent from `writtenPaths` because the loop hits the
      // redirect branch + `continue` before the push).
      //
      // Always emit when SSG ran. Filename starts with `_` so static
      // hosts that publish the dist root don't ALSO publish this internal
      // manifest as a public asset — convention matches `_redirects` /
      // `_redirects.json`. The seoPlugin reads + cleans it up after use.
      if (writtenPaths.length > 0) {
        // PR K (i18n follow-up): also embed the i18n config in the manifest
        // when present so `seoPlugin({ sitemap: { useSsgPaths: true } })`
        // can emit hreflang cross-references without duplicating the i18n
        // declaration. Zero-config win — users opt into i18n routing via
        // `zero({ i18n: { ... } })` once and both the route duplication
        // (PR H) AND the sitemap hreflang automatically pick it up.
        // M2.1 — atomic write so the seoPlugin (or any consumer) never reads
        // a half-written manifest if the build is interrupted mid-flush.
        await writeFileAtomic(
          join(distDir, '_pyreon-ssg-paths.json'),
          `${JSON.stringify(
            {
              paths: writtenPaths,
              ...(config.i18n ? { i18n: config.i18n } : {}),
            },
            null,
            2,
          )}\n`,
        )
      }

      // PR I — Build-time ISR revalidate manifest.
      //
      // Walk the route files for `export const revalidate = <n|false>`
      // declarations (captured as a literal at scan time), match each
      // declaration's url-pattern against the rendered written paths,
      // and emit `dist/_pyreon-revalidate.json` mapping concrete path
      // → revalidate value. Adapters (vercel/cloudflare/netlify) read
      // this manifest at deploy time to wire platform-specific ISR
      // (Vercel `output/config.json`, Cloudflare cache rules, Netlify
      // redirect headers).
      //
      // Path matching: static routes (`/about`) match writtenPaths[i]
      // exactly. Dynamic routes (`/posts/:id`) and catch-all
      // (`/blog/:slug*`) compile to a regex and match every concrete
      // child. Same revalidate value applies to all enumerated children
      // — `posts/[id].tsx` with `export const revalidate = 60` gives
      // `/posts/1`, `/posts/2`, `/posts/3` ALL `60` in the manifest.
      //
      // Filename starts with `_` so the static-host publish step
      // doesn't expose it as a public asset (matches `_redirects` /
      // `_redirects.json` / `_pyreon-ssg-paths.json` convention).
      // ONLY emit when at least one route has a revalidate literal —
      // empty manifests aren't useful, and absence is a meaningful
      // signal to adapters ("no per-route ISR config, fall through to
      // platform defaults").
      // M2.5 — track the count for the build summary breakdown.
      let revalidateCount = 0
      if (existsSync(routesDir)) {
        try {
          const fileRoutesWithExports = await scanRouteFilesWithExports(routesDir, config.mode)
          const revalidateManifest = buildRevalidateManifest(
            fileRoutesWithExports,
            writtenPaths,
          )
          revalidateCount = Object.keys(revalidateManifest).length
          if (revalidateCount > 0) {
            // M2.1 — atomic write. Adapters polling for the manifest at
            // deploy time should see the full document or nothing.
            await writeFileAtomic(
              join(distDir, '_pyreon-revalidate.json'),
              `${JSON.stringify({ revalidate: revalidateManifest }, null, 2)}\n`,
            )
          }
        } catch (err) {
          // Manifest emission is opt-in via the `revalidate` export.
          // A scan failure shouldn't abort the build — just record it
          // alongside the other SSG errors so CI surfaces it.
          errors.push({ path: '(revalidate-manifest)', error: err })
        }
      }

      // PR C — Auto-emit dist/404.html from _404.tsx convention.
      // PR K (i18n follow-up) — also emit dist/{locale}/404.html for every
      // locale subtree that has its own _404 (i.e. every non-default locale
      // under `prefix-except-default`, every locale under `prefix`).
      //
      // fs-router scans `_404.tsx` / `_not-found.tsx` and attaches it as
      // `notFoundComponent` on its parent layout RouteRecord (or directly
      // on the page record when no wrapping layout exists — which is the
      // per-locale subtree shape after PR H's root-layout-skip). The
      // synthetic SSG entry walks the routes tree at module-eval time,
      // collects per-locale 404 components into a Map keyed by locale
      // (or `null` for the default / no-i18n case), and exposes an
      // async `__renderNotFound(locale)` that renders the matching one.
      //
      // We iterate that map here and write each to the right path:
      //   - `null` locale → `dist/404.html` (static-host convention —
      //     Netlify / Cloudflare Pages / GitHub Pages / S3+CloudFront
      //     serve this for unmatched URLs by default)
      //   - non-null locale `de` → `dist/de/404.html` (mirrors how those
      //     same hosts serve per-prefix 404s when configured with the
      //     `errors_404` field per directory in `netlify.toml` / etc.)
      //
      // Per-locale 404 lets search engines + users see a 404 page in the
      // right language with the right navigation chrome, not the
      // default-locale page bolted onto a German URL.
      //
      // Gated by `config.ssg.emit404 !== false` (default true). Skipped
      // silently when no `_404.tsx` exists anywhere — the Map is empty
      // and the loop body never runs.
      let emitted404Count = 0
      if (config.ssg?.emit404 !== false && handlerMod.__renderNotFound) {
        // Back-compat: old SSG entries (pre-PR-K) expose only the singular
        // `__notFoundComponent`; new entries expose the Map. Build a synthetic
        // single-entry iterator from the singular when the Map isn't there
        // so users with a stale SSR_ENTRY cache or downstream consumers that
        // never rebuilt their lib/ keep emitting one 404.html.
        const localeEntries: (string | null)[]
          = handlerMod.__notFoundComponentsByLocale instanceof Map
            ? [...handlerMod.__notFoundComponentsByLocale.keys()]
            : handlerMod.__notFoundComponent
              ? [null]
              : []

        for (const locale of localeEntries) {
          // Hold the timer id outside try/Promise.race so the finally
          // block can `clearTimeout` it on the success path. Same shape
          // as the per-path render timeout above — every successful
          // 404 render leaked a 30s pending timer pre-fix.
          let timeoutId: ReturnType<typeof setTimeout> | undefined
          try {
            const result = await Promise.race([
              handlerMod.__renderNotFound(locale),
              new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Prerender timeout for ${locale == null ? '404' : `${locale}/404`} (30s)`,
                      ),
                    ),
                  30_000,
                )
              }),
            ])
            if (result) {
              // Inject `<meta name="robots" content="noindex, nofollow">`
              // BEFORE writing — the framework knows it's emitting a 404,
              // and `<Meta>`'s default of `'index, follow'` is wrong here.
              // User override wins: if the rendered head already carries
              // a `<meta name="robots">` (case-insensitive), the helper
              // passes the HTML through unchanged. Same helper that
              // render404Page uses, so the contract is identical across
              // build-time SSG emit and runtime dev/SSR emit paths.
              const html = ensureNoindexMeta(injectIntoTemplate(template, result))
              const filePath
                = locale == null
                  ? join(distDir, '404.html')
                  : join(distDir, locale, '404.html')
              // Ensure the locale subdirectory exists before writeFile —
              // dist/de/ may not have been created yet if no static pages
              // landed under that locale, but most apps will have at
              // least the locale-root index.html so this is usually a no-op.
              if (locale != null) {
                await mkdir(join(distDir, locale), { recursive: true })
              }
              await writeFile(filePath, html, 'utf-8')
              emitted404Count++
              // M2.3 — track per-locale 404 emits.
              if (__DEV__) _countSink.__pyreon_count__?.('ssg.404Emit')
            }
          } catch (error) {
            errors.push({
              path: locale == null ? '404.html' : `${locale}/404.html`,
              error,
            })
          } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId)
          }
        }
      }

      // PR B — emit redirect manifests when loaders threw `redirect()`.
      // Both Netlify (`_redirects`) and Vercel (`_redirects.json`)
      // formats ship together so the user doesn't have to pick at SSG
      // time. The file is empty / absent when no redirects fired.
      if (redirects.length > 0 && config.ssg?.emitRedirects !== false) {
        // M2.1 — atomic so an interrupted build doesn't leave a half-
        // written `_redirects` file that adapters / static hosts misparse.
        await writeFileAtomic(
          join(distDir, '_redirects'),
          renderNetlifyRedirects(redirects),
        )
        await writeFileAtomic(
          join(distDir, '_redirects.json'),
          renderVercelRedirectsJson(redirects),
        )
      }

      // PR G — emit `dist/_pyreon-ssg-errors.json` summarising every error
      // captured during the render loop (path traversal, render exception,
      // getStaticPaths throw, onPathError throw, 404 render fail). The file
      // is ONLY written when `errors.length > 0` — successful builds don't
      // leak an empty manifest. Reading it lets CI gate on render failures
      // without parsing console output.
      //
      // Default: 'json' (write the artifact). Set `errorArtifact: 'none'`
      // to opt out — errors stay console-only, matching pre-PR-G behaviour.
      if (errors.length > 0 && config.ssg?.errorArtifact !== 'none') {
        // M2.1 — atomic so CI that reads this manifest (`jq '.errors | length'`)
        // never sees a partial-JSON parse error from an interrupted build.
        await writeFileAtomic(
          join(distDir, '_pyreon-ssg-errors.json'),
          renderErrorArtifact(errors),
        )
      }

      // PR J — adapter.build() invocation for SSG mode. Each platform
      // adapter (vercel/cloudflare/netlify) writes its routing config
      // for the prerendered dist; static / node / bun adapters no-op
      // for SSG (they're SSR runners or trivial).
      //
      // Pre-PR-J: Adapter.build() was implemented per-platform but
      // never invoked from any build pipeline — the methods existed
      // but no production code path called them. SSG is the natural
      // first hook because the dist/ shape is final at this point
      // (all paths rendered, redirects + sitemap manifests written).
      // Adapter throws are caught here so a buggy adapter can't take
      // down the rest of the build (sitemap, error artifact, summary
      // log all already ran). The error lands in the error log + the
      // _pyreon-ssg-errors.json if errorArtifact was set, but we
      // emit it AFTER the artifact write so the path-render errors
      // already in the file aren't displaced.
      const adapter = resolveAdapter(config)
      try {
        await adapter.build({ kind: 'ssg', outDir: distDir, config, assetsDir })
      } catch (adapterError) {
        errors.push({ path: `(adapter:${adapter.name})`, error: adapterError })
      }

      // Cleanup the SSR build artifacts — they're an implementation detail
      // and shouldn't ship to the static host.
      await rm(ssrOutDir, { recursive: true, force: true })

      const elapsed = Date.now() - start
      const redirectsSummary = redirects.length > 0 ? ` + ${redirects.length} redirect(s)` : ''
      const concurrencySummary = concurrency > 1 ? ` (concurrency: ${concurrency})` : ''
      const adapterSummary = adapter.name !== 'node' ? ` [adapter: ${adapter.name}]` : ''
      // M2.5 — revalidate-manifest entry count surfaces in the summary so
      // users see at a glance whether per-route ISR config landed in
      // `_pyreon-revalidate.json` (vs silently empty because no route
      // exported a `revalidate` literal).
      const revalidateSummary =
        revalidateCount > 0 ? ` + ${revalidateCount} revalidate path(s)` : ''
      // M2.5 — per-locale breakdown when i18n config is active. The
      // breakdown is computed from `writtenPaths` — each path either has a
      // locale prefix (`/de/...`) or belongs to the default locale (under
      // `prefix-except-default`) / is locale-less (no i18n). Surfaces
      // shape mismatches: `[en: 100, de: 90, cs: 100]` flags that de had
      // 10 paths skipped relative to the others.
      const localeSummary = config.i18n ? buildLocaleSummary(writtenPaths, config.i18n) : ''
      // oxlint-disable-next-line no-console
      console.log(
        `[zero:ssg] Prerendered ${pages} page(s)${
          emitted404Count > 0
            ? emitted404Count === 1
              ? ' + 404.html'
              : ` + ${emitted404Count} 404 pages`
            : ''
        }${redirectsSummary}${revalidateSummary} in ${elapsed}ms${concurrencySummary}${adapterSummary}${localeSummary}` +
          (errors.length > 0 ? ` (${errors.length} error(s))` : ''),
      )
      for (const { path: errPath, error } of errors) {
        // oxlint-disable-next-line no-console
        console.error(`[zero:ssg] Failed to prerender "${errPath}":`, error)
      }
      } finally {
        // PR-S13: ensure the per-build mkdir cache is cleared even if the
        // render loop above throws. The cache holds resolved-mkdir
        // Promises keyed by absolute path; entries point at directories
        // that `dist/`-wipe between builds (vite build --watch, CI
        // pipelines) would invalidate. Pre-PR-S13 the start-of-build
        // reset handled the common case, but a crash here left the cache
        // populated for any subsequent in-process consumer. The finally
        // reset is defense-in-depth — symmetric with the start-of-build
        // reset above and structurally analogous to PR I's
        // `try { ... } finally { delete process.env[SSG_BUILD_FLAG] }`
        // pattern (lines 1037 / 1067).
        _resetMkdirCache()
      }
    },
  } satisfies Plugin
}

// ─── Test exports ─────────────────────────────────────────────────────────────
//
// Internal helpers exposed for unit tests. Not part of the public API.

export const _internal = {
  resolvePaths,
  autoDetectStaticPaths,
  resolveOutputPath,
  isInsideDist,
  expandUrlPattern,
  injectIntoTemplate,
  renderNetlifyRedirects,
  renderVercelRedirectsJson,
  renderMetaRefreshHtml,
  renderErrorArtifact,
  runWithConcurrency,
  buildRevalidateManifest,
  // Keep the historical `renderSsrEntrySource` export name (the test
  // suite calls `_internal.renderSsrEntrySource()`); under the hood it
  // dispatches the SSG kind through the shared dispatcher (preserving
  // the original behaviour byte-for-byte). The SSG-specific renderer
  // is also exposed for tests that want to assert the locale-baking
  // contract directly.
  renderSsrEntrySource: renderSsgEntrySource,
  renderSsgEntrySource,
  SSR_ENTRY_FILENAME,
  detectPathCollisions,
  formatPathCollisionError,
  assertNoPathCollisions,
  writeFileAtomic,
  buildLocaleSummary,
  // PR-S13: expose mkdirOnce + _resetMkdirCache so the cache-reset
  // contract is unit-testable. The closeBundle finally-block wiring is
  // integration-level (requires a full SSG round-trip to exercise the
  // crash path) — these exports cover the cache primitives' contract.
  mkdirOnce,
  _resetMkdirCache,
  _peekMkdirCacheSize,
}
