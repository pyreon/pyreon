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
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plugin } from 'vite'
import { resolveAdapter } from './adapters'
import { resolveConfig } from './config'
import { parseFileRoutes, scanRouteFiles, scanRouteFilesWithExports } from './fs-router'
import { expandRoutesForLocales, type I18nRoutingConfig } from './i18n-routing'
import type { ZeroConfig } from './types'

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
const renderSsrEntrySource = (locales: readonly string[] = []): string => {
  const i18nLocalesLiteral = JSON.stringify(locales)
  return `
import { routes } from "virtual:zero/routes"
import { h } from "@pyreon/core"
import { renderWithHead } from "@pyreon/head/ssr"
import { getRedirectInfo, serializeLoaderData } from "@pyreon/router"
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

export default async function renderPath(path) {
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
  try {
    await router.preload(path)
  } catch (err) {
    const info = getRedirectInfo(err)
    if (info) {
      return { kind: "redirect", from: path, to: info.url, status: info.status }
    }
    throw err
  }

  return runWithRequestContext(async () => {
    const app = h(App, null)
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
    const loaderScript = hasData
      ? \`<script>window.__PYREON_LOADER_DATA__=\${JSON.stringify(loaderData).replace(/<\\//g, "<\\\\/")}</script>\`
      : ""
    return { kind: "html", appHtml, head: finalHead, loaderScript }
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

// Render the not-found component through the same SSR pipeline as a
// regular path. We DON'T navigate the router to a probe path — the
// runtime's 404 wrapper short-circuits BEFORE the router for unmatched
// URLs and renders the component directly via h(NotFound, null), so
// the SSG path mirrors that. The result flows through the same template
// injection in the outer plugin (styler tag, @pyreon/head meta, loader
// data — all consistent with regular pages) and lands at \`dist/404.html\`
// (or \`dist/\${locale}/404.html\` for per-locale 404s under PR H i18n).
export async function __renderNotFound(locale) {
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

  // Always include "/" as a fallback if no static routes were found —
  // a project with only dynamic routes still needs an index.html for the
  // host to know where to send unmatched URLs.
  return out.length > 0 ? out : ['/']
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

function resolveOutputPath(distDir: string, path: string): string {
  if (path === '/') return join(distDir, 'index.html')
  if (path.endsWith('.html')) return join(distDir, path)
  return join(distDir, path, 'index.html')
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
  for (const route of fileRoutes) {
    if (route.isLayout || route.isError || route.isLoading || route.isNotFound) continue
    const literal = route.exports?.revalidateLiteral
    if (literal === undefined) continue
    let parsed: unknown
    try {
      // The literal text is a number (`60`, `3600`) or boolean
      // (`false`). JSON.parse handles both. Other values (`true`,
      // strings, objects) aren't valid `revalidate` shapes — skip
      // silently rather than throw.
      parsed = JSON.parse(literal)
    } catch {
      continue
    }
    if (typeof parsed !== 'number' && parsed !== false) continue
    const value = parsed as number | false
    const matcher = compileUrlPatternMatcher(route.urlPath)
    for (const concretePath of writtenPaths) {
      if (matcher(concretePath)) {
        manifest[concretePath] = value
      }
    }
  }
  return manifest
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

/**
 * Inject a rendered SSR result into the index.html template. Prefers
 * Pyreon's `<!--pyreon-head-->` / `<!--pyreon-app-->` /
 * `<!--pyreon-scripts-->` placeholders; falls back to inserting before
 * `</head>` / inside `<div id="app">` / before `</body>` so a bare
 * Vite-style `index.html` (no Pyreon comments) still receives content.
 *
 * Factored out of the per-path render loop so the 404 emission path can
 * reuse the exact same injection rules — keeps the rendered _404.tsx
 * subject to the same head/body/scripts pipeline as regular pages
 * (styler tag, @pyreon/head meta, hashed asset preload links).
 */
function injectIntoTemplate(
  template: string,
  result: { appHtml: string; head: string; loaderScript: string },
): string {
  let html = template
  if (html.includes('<!--pyreon-head-->')) {
    html = html.replace('<!--pyreon-head-->', result.head)
  } else if (result.head) {
    html = html.replace('</head>', `${result.head}</head>`)
  }
  if (html.includes('<!--pyreon-app-->')) {
    html = html.replace('<!--pyreon-app-->', result.appHtml)
  } else if (result.appHtml) {
    const appDivMatch = html.match(/<div\s+id=["']app["']\s*>([\s\S]*?)<\/div>/)
    if (appDivMatch) {
      html = html.replace(appDivMatch[0], `<div id="app">${result.appHtml}</div>`)
    } else {
      html = html.replace('</body>', `<div id="app">${result.appHtml}</div></body>`)
    }
  }
  if (html.includes('<!--pyreon-scripts-->')) {
    html = html.replace('<!--pyreon-scripts-->', result.loaderScript)
  } else if (result.loaderScript) {
    html = html.replace('</body>', `${result.loaderScript}</body>`)
  }
  return html
}

/**
 * Plugin that performs SSG when `mode: "ssg"` is configured. Wires into
 * Vite's `closeBundle` hook so it runs once after the main client build
 * completes. The recursive SSR sub-build is gated by an env flag.
 */
export function ssgPlugin(userConfig: ZeroConfig = {}): Plugin {
  const config = resolveConfig(userConfig)
  let root = ''
  let distDir = ''
  // Track whether this plugin instance is running inside the inner SSR
  // sub-build (where it must be a no-op) vs. the outer client build.
  const isInnerBuild = process.env[SSG_BUILD_FLAG] === '1'

  return {
    name: 'pyreon-zero-ssg',
    apply: 'build',
    enforce: 'post',

    configResolved(resolved) {
      root = resolved.root
      distDir = resolve(root, resolved.build.outDir)
    },

    async closeBundle() {
      if (config.mode !== 'ssg') return
      if (isInnerBuild) return

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
      await writeFile(entryPath, renderSsrEntrySource(i18nLocales), 'utf-8')

      // Vite's programmatic build API. Loaded lazily so the plugin doesn't
      // pull `vite` into the runtime dep graph at module-evaluation time.
      const { build } = await import('vite')

      // Inner SSR sub-build. Re-assembles zero's plugin chain plus
      // `@pyreon/vite-plugin` (JSX compiler) — every Pyreon app already
      // has both because zero is built on top of pyreon. Loading both
      // lazily keeps the SSG plugin off the module-eval critical path.
      // Env-flag gate prevents the inner ssgPlugin instance from
      // re-triggering itself.
      process.env[SSG_BUILD_FLAG] = '1'
      try {
        const [{ zeroPlugin }, pyreonModule] = await Promise.all([
          import('./vite-plugin'),
          import('@pyreon/vite-plugin'),
        ])
        const pyreon = (pyreonModule as { default: () => unknown }).default

        await build({
          root,
          mode: 'production',
          logLevel: 'error',
          configFile: false,
          publicDir: false,
          plugins: [pyreon(), zeroPlugin(userConfig)] as Plugin[],
          resolve: { conditions: ['bun'] },
          build: {
            ssr: entryPath,
            outDir: ssrOutDir,
            emptyOutDir: true,
            target: 'esnext',
            rollupOptions: {
              input: entryPath,
              output: {
                format: 'es',
                entryFileNames: 'entry-server.mjs',
              },
              external: [/^node:/],
            },
          },
        })
      } finally {
        delete process.env[SSG_BUILD_FLAG]
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
      const handlerMod = (await import(/* @vite-ignore */ pathToFileURL(handlerPath).href)) as {
        // PR B — return shape is a discriminated union: regular paths
        // produce HTML, redirect-throwing loaders produce a redirect
        // descriptor for the manifest writer.
        default: (
          path: string,
        ) => Promise<
          | { kind: 'html'; appHtml: string; head: string; loaderScript: string }
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
      const renderPath = handlerMod.default
      const registry = handlerMod.__getStaticPathsRegistry

      // Read the user's built index.html template. Vite has just produced it
      // with hashed asset URLs (`/assets/index-XYZ.js`), preload links, etc.
      // We inject the rendered head/body/loader-data into placeholder
      // comments — same convention as zero's dev SSR. If the template lacks
      // the placeholders, we fall back to inserting before `</head>` and
      // `</body>` respectively so a bare `index.html` still works.
      const template = await readFile(indexHtmlPath, 'utf-8')

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
        try {
          const result = await Promise.race([
            renderPath(p),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Prerender timeout for "${p}" (30s)`)), 30_000),
            ),
          ])

          if (result.kind === 'redirect') {
            // PR B — loader threw `redirect()`. Record for the manifest;
            // optionally emit a meta-refresh HTML stub at the source path.
            redirects.push({ from: result.from, to: result.to, status: result.status })

            if (config.ssg?.redirectsAsHtml === 'meta-refresh') {
              const filePath = resolveOutputPath(distDir, p)
              const resolvedOut = resolve(distDir)
              if (!resolve(filePath).startsWith(resolvedOut)) {
                errors.push({ path: p, error: new Error(`Path traversal detected: "${p}"`) })
                return
              }
              await mkdir(dirname(filePath), { recursive: true })
              await writeFile(filePath, renderMetaRefreshHtml(result.to), 'utf-8')
            }
            return
          }

          const html = injectIntoTemplate(template, result)

          const filePath = resolveOutputPath(distDir, p)

          // Path-traversal guard — same as @pyreon/server's prerender.
          const resolvedOut = resolve(distDir)
          if (!resolve(filePath).startsWith(resolvedOut)) {
            errors.push({ path: p, error: new Error(`Path traversal detected: "${p}"`) })
            return
          }

          await mkdir(dirname(filePath), { recursive: true })
          await writeFile(filePath, html, 'utf-8')
          pages++
          writtenPaths.push(p)
        } catch (error) {
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
                const resolvedOut = resolve(distDir)
                if (!resolve(filePath).startsWith(resolvedOut)) {
                  errors.push({ path: p, error: new Error(`Path traversal detected: "${p}"`) })
                  return
                }
                await mkdir(dirname(filePath), { recursive: true })
                await writeFile(filePath, fallbackHtml, 'utf-8')
                pages++
              }
            } catch (callbackError) {
              errors.push({ path: `${p} (onPathError)`, error: callbackError })
            }
          }
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
        await writeFile(
          join(distDir, '_pyreon-ssg-paths.json'),
          `${JSON.stringify(
            {
              paths: writtenPaths,
              ...(config.i18n ? { i18n: config.i18n } : {}),
            },
            null,
            2,
          )}\n`,
          'utf-8',
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
      if (existsSync(routesDir)) {
        try {
          const fileRoutesWithExports = await scanRouteFilesWithExports(routesDir, config.mode)
          const revalidateManifest = buildRevalidateManifest(
            fileRoutesWithExports,
            writtenPaths,
          )
          if (Object.keys(revalidateManifest).length > 0) {
            await writeFile(
              join(distDir, '_pyreon-revalidate.json'),
              `${JSON.stringify({ revalidate: revalidateManifest }, null, 2)}\n`,
              'utf-8',
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
      const emitted404Locales: (string | null)[] = []
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
          try {
            const result = await Promise.race([
              handlerMod.__renderNotFound(locale),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Prerender timeout for ${locale == null ? '404' : `${locale}/404`} (30s)`,
                      ),
                    ),
                  30_000,
                ),
              ),
            ])
            if (result) {
              const html = injectIntoTemplate(template, result)
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
              emitted404Locales.push(locale)
            }
          } catch (error) {
            errors.push({
              path: locale == null ? '404.html' : `${locale}/404.html`,
              error,
            })
          }
        }
      }
      const emitted404 = emitted404Count > 0

      // PR B — emit redirect manifests when loaders threw `redirect()`.
      // Both Netlify (`_redirects`) and Vercel (`_redirects.json`)
      // formats ship together so the user doesn't have to pick at SSG
      // time. The file is empty / absent when no redirects fired.
      if (redirects.length > 0 && config.ssg?.emitRedirects !== false) {
        await writeFile(join(distDir, '_redirects'), renderNetlifyRedirects(redirects), 'utf-8')
        await writeFile(
          join(distDir, '_redirects.json'),
          renderVercelRedirectsJson(redirects),
          'utf-8',
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
        await writeFile(
          join(distDir, '_pyreon-ssg-errors.json'),
          renderErrorArtifact(errors),
          'utf-8',
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
        await adapter.build({ kind: 'ssg', outDir: distDir, config })
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
      // oxlint-disable-next-line no-console
      console.log(
        `[zero:ssg] Prerendered ${pages} page(s)${
          emitted404Count > 0
            ? emitted404Count === 1
              ? ' + 404.html'
              : ` + ${emitted404Count} 404 pages`
            : ''
        }${redirectsSummary} in ${elapsed}ms${concurrencySummary}${adapterSummary}` +
          (errors.length > 0 ? ` (${errors.length} error(s))` : ''),
      )
      for (const { path: errPath, error } of errors) {
        // oxlint-disable-next-line no-console
        console.error(`[zero:ssg] Failed to prerender "${errPath}":`, error)
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
  expandUrlPattern,
  injectIntoTemplate,
  renderNetlifyRedirects,
  renderVercelRedirectsJson,
  renderMetaRefreshHtml,
  renderErrorArtifact,
  runWithConcurrency,
  buildRevalidateManifest,
  renderSsrEntrySource,
  SSR_ENTRY_FILENAME,
}
