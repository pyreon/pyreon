import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Middleware } from '@pyreon/server'
import type { Plugin } from 'vite'
import { generateRssFeed } from './seo-rss'
import type { RssConfig } from './seo-rss'
import type { I18nRoutingConfig } from './i18n-routing'

// ─── SEO utilities ──────────────────────────────────────────────────────────
//
// Zero provides built-in SEO tooling:
// - Automatic sitemap.xml generation from file-based routes
// - Configurable robots.txt
// - Structured data (JSON-LD) helpers
// - Open Graph / Twitter Card meta helpers

export interface SitemapConfig {
  /** Base URL of the site (required). e.g. "https://example.com" */
  origin: string
  /** Paths to exclude from the sitemap. */
  exclude?: string[]
  /** Default change frequency. Default: "weekly" */
  changefreq?: ChangeFreq
  /** Default priority. Default: 0.7 */
  priority?: number
  /** Additional URLs to include (for dynamic routes). */
  additionalPaths?: SitemapEntry[]
  /**
   * When `true` AND the build is running in SSG mode, the sitemap reads
   * the resolved-paths manifest emitted by the SSG plugin
   * (`dist/_pyreon-ssg-paths.json`) and includes EVERY prerendered URL —
   * including dynamic routes enumerated via `getStaticPaths` (PR A) and
   * per-locale variants (PR H, when shipped). Without this flag the
   * sitemap walks the file-system route tree directly and silently
   * skips dynamic routes (`[id]` / `[...slug]`) because their concrete
   * values aren't knowable without running each route's enumerator.
   *
   * Sequencing: when `true`, sitemap.xml emission moves from Vite's
   * `generateBundle` hook (where the SSG plugin's path enumeration
   * hasn't run yet) to `closeBundle` with `enforce: 'post'` so it
   * runs AFTER the SSG plugin. The user must ensure `seoPlugin()` is
   * placed AFTER `zero()` in the Vite plugin array (the canonical
   * ordering — `closeBundle` hooks fire in plugin-registration order).
   *
   * Falls back gracefully: when the manifest doesn't exist (mode is
   * not `ssg`, or the SSG step was skipped), the sitemap still walks
   * the file-system routes — same shape as without this flag.
   *
   * Default: `false` (preserves prior behaviour). Set `true` for SSG
   * sites that ship dynamic-route enumerations.
   */
  useSsgPaths?: boolean
  /**
   * Emit `<xhtml:link rel="alternate" hreflang="...">` cross-references
   * inside each `<url>` entry, declaring the locale variants of every
   * page (PR K — i18n follow-up).
   *
   * Accepts:
   *   - `true` — read the i18n config from the SSG paths manifest
   *     (which `zero({ i18n: ... })` automatically embeds when SSG runs).
   *     Zero-config win — declare i18n once, sitemap picks it up.
   *   - `I18nRoutingConfig` — pass the i18n config explicitly. Use when
   *     the project doesn't run SSG (file-scan sitemap path) but still
   *     wants hreflang in the emitted sitemap.
   *   - `false` / omitted — no hreflang, plain `<url>` entries.
   *
   * The emitted shape per page-cluster is the Google-recommended form:
   *
   *   <url>
   *     <loc>https://example.com/about</loc>
   *     <xhtml:link rel="alternate" hreflang="en" href="https://example.com/about"/>
   *     <xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/about"/>
   *     <xhtml:link rel="alternate" hreflang="cs" href="https://example.com/cs/about"/>
   *     <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about"/>
   *   </url>
   *
   * The `x-default` entry points at the default-locale URL so search
   * engines have a fallback when the user's language doesn't match any
   * of the configured locales. URLs are clustered by their un-prefixed
   * (default-locale) form — `/about`, `/de/about`, `/cs/about` collapse
   * into ONE `<url>` entry with three `xhtml:link` siblings.
   */
  hreflang?: boolean | I18nRoutingConfig
  /**
   * Trailing-slash policy applied to every non-root `<loc>` (and the
   * `xhtml:link` hreflang hrefs).
   *
   * - `'preserve'` (default) — emit paths exactly as resolved. No
   *   behaviour change.
   * - `'always'` — append a trailing slash to every non-root path
   *   (`/resume` → `/resume/`, root → `${origin}/`).
   * - `'never'` — strip trailing slashes from non-root paths
   *   (`/resume/` → `/resume`, root → `${origin}`).
   *
   * **Set `'always'` when deploying SSG output to a host that 301-
   * redirects `/path` → `/path/`** (GitHub Pages, and Netlify /
   * Cloudflare Pages with directory-style URLs). The default
   * `'preserve'` emits `/resume`, which those hosts 301 to `/resume/` —
   * a redirect Lighthouse penalises ("Avoid multiple page redirects").
   * Matching the directory-style output up front removes the hop.
   *
   * Kept `'preserve'` by default rather than auto-switching on adapter:
   * not every SSG host redirects (some serve `/resume` → the directory's
   * `index.html` with no hop), so silently rewriting every URL by
   * deploy target would be the wrong default for those hosts. Opt in
   * explicitly to match YOUR host's behaviour.
   */
  trailingSlash?: TrailingSlash
}

export interface SitemapEntry {
  path: string
  changefreq?: ChangeFreq
  priority?: number
  lastmod?: string
}

export type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

/** Trailing-slash policy for sitemap `<loc>` paths. See {@link SitemapConfig.trailingSlash}. */
export type TrailingSlash = 'always' | 'never' | 'preserve'

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
 * Generate a sitemap.xml string from route file paths.
 *
 * When `i18n` is set (PR K — passed by `seoPlugin` after reading the
 * i18n config from `zero({ i18n: ... })`), URLs are clustered by their
 * un-prefixed (default-locale) form and each `<url>` carries
 * `<xhtml:link rel="alternate" hreflang="...">` siblings for every
 * locale variant + an `x-default` entry pointing at the default locale.
 */
export function generateSitemap(
  routeFiles: string[],
  config: SitemapConfig,
  i18n?: I18nRoutingConfig,
): string {
  const { origin, exclude = [], changefreq = 'weekly', priority = 0.7, trailingSlash = 'preserve' } = config

  const paths = routeFiles
    .filter((f) => {
      // Exclude layout, error, loading files
      const name = f
        .split('/')
        .pop()
        ?.replace(/\.\w+$/, '')
      return name !== '_layout' && name !== '_error' && name !== '_loading'
    })
    .map((f) => {
      // Convert file path to URL
      let path = f
        .replace(/\.\w+$/, '')
        .replace(/\/index$/, '/')
        .replace(/^index$/, '/')

      // Skip dynamic routes — they need additionalPaths
      if (path.includes('[')) return null

      // Strip route groups
      path = path.replace(/\([\w-]+\)\//g, '')

      if (!path.startsWith('/')) path = `/${path}`
      return path
    })
    .filter((p): p is string => p !== null)
    .filter((p) => !exclude.some((e) => p.startsWith(e)))

  // Dedup by path (first-wins, order-preserving). The same static route
  // routinely appears in BOTH the file-system route scan AND
  // `additionalPaths` (e.g. SSG-emitted paths merged in via
  // `seoPlugin`), which previously produced a DUPLICATE `<url>` entry —
  // the i18n branch of `clusterPathsByLocale` dedups via `byUnPrefixed`,
  // but the non-i18n branch is a raw 1:1 `entries.map(...)`, so without
  // this the duplicate reached the emitted sitemap. Dedup here covers
  // both branches at the single source. The route-scan entry wins so its
  // configured `changefreq`/`priority` is kept over a bare dup.
  const allPaths: SitemapEntry[] = (() => {
    const byPath = new Map<string, SitemapEntry>()
    for (const e of [
      ...paths.map((p) => ({ path: p, changefreq, priority })),
      ...(config.additionalPaths ?? []),
    ]) {
      if (!byPath.has(e.path)) byPath.set(e.path, e)
    }
    return [...byPath.values()]
  })()

  // PR K: when i18n is set, cluster URLs by their un-prefixed (default-
  // locale) form so each `<url>` entry can carry the hreflang siblings
  // for every locale variant. Without i18n the cluster collapses to a
  // single-entry form (one per path) and the renderer skips xhtml:link.
  const clusters = clusterPathsByLocale(allPaths, i18n)
  const hasHreflang = i18n != null && i18n.locales.length > 0
  const xmlnsHreflang = hasHreflang ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''

  const entries = clusters
    .map((cluster) => renderClusterEntry(cluster, origin, changefreq, priority, i18n, trailingSlash))
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlnsHreflang}>
${entries}
</urlset>`
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

/** A URL cluster — the canonical entry + per-locale variants. @internal */
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

function renderClusterEntry(
  cluster: Cluster,
  origin: string,
  changefreq: ChangeFreq,
  priority: number,
  i18n: I18nRoutingConfig | undefined,
  trailingSlash: TrailingSlash,
): string {
  const { canonical, variantsByLocale } = cluster
  const loc = formatLoc(origin, canonical.path, trailingSlash)

  const lines: string[] = [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <changefreq>${canonical.changefreq ?? changefreq}</changefreq>`,
    `    <priority>${canonical.priority ?? priority}</priority>`,
  ]
  if (canonical.lastmod) lines.push(`    <lastmod>${canonical.lastmod}</lastmod>`)

  if (i18n != null && i18n.locales.length > 0 && variantsByLocale.size > 1) {
    // hreflang per locale variant + x-default → default locale's URL.
    for (const locale of i18n.locales) {
      const variant = variantsByLocale.get(locale)
      if (!variant) continue
      const variantLoc = formatLoc(origin, variant.path, trailingSlash)
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(locale)}" href="${escapeXml(variantLoc)}"/>`,
      )
    }
    // x-default — the fallback when no locale matches the user.
    const defaultVariant = variantsByLocale.get(i18n.defaultLocale)
    if (defaultVariant) {
      const defaultLoc = formatLoc(origin, defaultVariant.path, trailingSlash)
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defaultLoc)}"/>`,
      )
    }
  }
  lines.push('  </url>')
  return lines.join('\n')
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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

/**
 * Duck-type guard for `I18nRoutingConfig`. The SSG manifest is JSON,
 * so the embedded i18n field could in principle be malformed if a
 * downstream user hand-edits the manifest (don't). Validate the shape
 * before trusting it.
 *
 * @internal
 */
function isI18nRoutingConfig(value: unknown): value is I18nRoutingConfig {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.locales)
    && v.locales.every((l: unknown) => typeof l === 'string')
    && typeof v.defaultLocale === 'string'
  )
}

// ─── Robots.txt ─────────────────────────────────────────────────────────────

export interface RobotsConfig {
  /** Rules per user-agent. */
  rules?: RobotsRule[]
  /** Sitemap URL. */
  sitemap?: string
  /** Host directive. */
  host?: string
}

export interface RobotsRule {
  userAgent: string
  allow?: string[]
  disallow?: string[]
  crawlDelay?: number
}

/**
 * Generate a robots.txt string.
 */
export function generateRobots(config: RobotsConfig = {}): string {
  const { rules = [{ userAgent: '*', allow: ['/'] }], sitemap, host } = config
  const lines: string[] = []

  for (const rule of rules) {
    lines.push(`User-agent: ${rule.userAgent}`)
    if (rule.allow) {
      for (const path of rule.allow) lines.push(`Allow: ${path}`)
    }
    if (rule.disallow) {
      for (const path of rule.disallow) lines.push(`Disallow: ${path}`)
    }
    if (rule.crawlDelay) lines.push(`Crawl-delay: ${rule.crawlDelay}`)
    lines.push('')
  }

  if (sitemap) lines.push(`Sitemap: ${sitemap}`)
  if (host) lines.push(`Host: ${host}`)

  return lines.join('\n')
}


// ─── RSS 2.0 feed — re-exported from `./seo-rss` ────────────────────────────
//
// The RSS builder lives in its own client-safe file so it can be
// exported from `@pyreon/zero`'s main client entry. Re-exported here
// so existing `import { generateRssFeed } from '@pyreon/zero/seo'`
// imports keep working AND `seoPlugin` can wire it into the Vite
// build hook below.
export type { RssConfig, RssItem } from './seo-rss'
export { generateRssFeed, toRfc822 } from './seo-rss'

// ─── Structured data (JSON-LD) ──────────────────────────────────────────────

export type JsonLdType =
  | 'WebSite'
  | 'WebPage'
  | 'Article'
  | 'BlogPosting'
  | 'Product'
  | 'Organization'
  | 'Person'
  | 'BreadcrumbList'
  | 'FAQPage'
  | (string & {})

/**
 * Generate a JSON-LD script tag string for structured data.
 *
 * @example
 * useHead({
 *   script: [jsonLd({
 *     "@type": "WebSite",
 *     name: "My Site",
 *     url: "https://example.com",
 *   })],
 * })
 */
export function jsonLd(data: Record<string, unknown>): string {
  const ld = {
    '@context': 'https://schema.org',
    ...data,
  }
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`
}

// ─── SEO Vite plugin ────────────────────────────────────────────────────────

export interface SeoPluginConfig {
  /** Sitemap configuration. */
  sitemap?: SitemapConfig
  /** Robots.txt configuration. */
  robots?: RobotsConfig
  /**
   * RSS 2.0 feed configuration. Emits `dist/rss.xml` during the
   * client build. Items aren't auto-derived from routes (zero has no
   * built-in notion of "blog posts") — the user supplies an
   * up-front list.
   *
   * For collection-driven sites, derive items from your data source
   * inside `vite.config.ts`:
   *
   *     seoPlugin({
   *       rss: {
   *         title: 'My Blog',
   *         origin: 'https://example.com',
   *         items: posts.map((p) => ({ title: p.title, link: `/blog/${p.slug}` })),
   *       },
   *     })
   */
  rss?: RssConfig
}

/**
 * Zero SEO Vite plugin.
 * Generates sitemap.xml and robots.txt at build time.
 *
 * @example
 * import { seoPlugin } from "@pyreon/zero/seo"
 *
 * export default {
 *   plugins: [
 *     pyreon(),
 *     zero(),
 *     seoPlugin({
 *       sitemap: {
 *         origin: "https://example.com",
 *         useSsgPaths: true, // include dynamic-route enumerations
 *       },
 *       robots: { sitemap: "https://example.com/sitemap.xml" },
 *     }),
 *   ],
 * }
 */
export function seoPlugin(config: SeoPluginConfig = {}): Plugin {
  // PR F — when `useSsgPaths` is true, sitemap.xml emission moves to
  // `closeBundle` (post-SSG) so the SSG plugin's resolved-paths manifest
  // is available. Otherwise it stays at `generateBundle` for the
  // file-scan-only fast path.
  const useSsgPaths = config.sitemap?.useSsgPaths === true
  let distDir = ''

  return {
    name: 'pyreon-zero-seo',
    apply: 'build',
    // `enforce: 'post'` for the closeBundle case so we run AFTER the
    // SSG plugin's path-manifest write. `closeBundle` hooks fire in
    // plugin-registration order, but enforce-post pushes us to the
    // tail regardless of where seoPlugin lands in the user's array.
    ...(useSsgPaths ? ({ enforce: 'post' } as const) : {}),

    configResolved(resolved) {
      distDir = resolve(resolved.root, resolved.build.outDir)
    },

    async generateBundle(_, _bundle) {
      // Skip sitemap emission here when `useSsgPaths` is true — moves to
      // `closeBundle` below where the SSG manifest is readable.
      if (config.sitemap && !useSsgPaths) {
        const { scanRouteFiles } = await import('./fs-router')
        const routesDir = `${process.cwd()}/src/routes`

        try {
          const files = await scanRouteFiles(routesDir)
          // File-scan path can't auto-detect i18n from the SSG manifest
          // (the manifest only exists in SSG mode). Honour explicit user
          // config (`hreflang: { locales: [...] }`); auto-detect mode
          // (`hreflang: true`) is a no-op here since there's no manifest.
          const hreflangI18n = resolveHreflangI18n(config.sitemap.hreflang, undefined)
          const sitemap = generateSitemap(files, config.sitemap, hreflangI18n)

          this.emitFile({
            type: 'asset',
            fileName: 'sitemap.xml',
            source: sitemap,
          })
        } catch {
          // Sitemap generation failed — skip silently
        }
      }

      // Generate robots.txt
      if (config.robots) {
        const robots = generateRobots(config.robots)

        this.emitFile({
          type: 'asset',
          fileName: 'robots.txt',
          source: robots,
        })
      }

      // Generate rss.xml — items are supplied up-front (no
      // auto-derivation from routes; zero has no notion of "posts").
      if (config.rss) {
        const rss = generateRssFeed(config.rss)
        this.emitFile({
          type: 'asset',
          fileName: 'rss.xml',
          source: rss,
        })
      }
    },

    async closeBundle() {
      // PR F — `useSsgPaths` path. Read the manifest the SSG plugin
      // wrote at its own `closeBundle`, merge into the file-scan paths,
      // emit sitemap.xml to dist via writeFile (Vite's `emitFile` API
      // only works during the bundling phase, not at closeBundle).
      if (!config.sitemap || !useSsgPaths) return

      const { scanRouteFiles } = await import('./fs-router')
      const routesDir = `${process.cwd()}/src/routes`
      const manifestPath = join(distDir, '_pyreon-ssg-paths.json')

      try {
        let ssgPaths: SitemapEntry[] = []
        // PR K: pick up the i18n config the SSG plugin embeds into the
        // manifest when `zero({ i18n: ... })` is set. Read it here so
        // hreflang siblings emit without the user having to declare
        // i18n in two places.
        let manifestI18n: I18nRoutingConfig | undefined
        if (existsSync(manifestPath)) {
          const raw = await readFile(manifestPath, 'utf-8')
          const parsed = JSON.parse(raw) as { paths?: unknown; i18n?: unknown }
          if (Array.isArray(parsed.paths)) {
            ssgPaths = parsed.paths
              .filter((p): p is string => typeof p === 'string')
              .map((path) => ({ path }))
          }
          if (isI18nRoutingConfig(parsed.i18n)) manifestI18n = parsed.i18n
          // Cleanup — manifest is an internal artifact, not for
          // the published static host.
          try {
            await rm(manifestPath, { force: true })
          } catch {
            // best-effort
          }
        }

        // File-scan still runs as a fallback for static routes that
        // weren't enumerated by the SSG manifest (e.g. mode is `ssg`
        // but the manifest write was skipped, or static routes
        // are present alongside the SSG output). The merge dedups
        // by path so a static route emitted by both paths only
        // appears once in the sitemap.
        let files: string[] = []
        try {
          files = await scanRouteFiles(routesDir)
        } catch {
          // routesDir missing — only the SSG manifest paths land in the sitemap.
        }

        const merged: SitemapConfig = {
          ...config.sitemap,
          additionalPaths: [...ssgPaths, ...(config.sitemap.additionalPaths ?? [])],
        }
        // Resolve hreflang i18n config in priority order:
        //   1. Explicit user config (object form: hreflang: { locales: [...] })
        //   2. Auto-detect from SSG manifest (hreflang: true)
        //   3. Nothing — emit plain sitemap without xhtml:link
        const hreflangI18n = resolveHreflangI18n(config.sitemap.hreflang, manifestI18n)
        const sitemap = generateSitemap(files, merged, hreflangI18n)
        await writeFile(join(distDir, 'sitemap.xml'), sitemap, 'utf-8')
      } catch {
        // Sitemap generation failed — skip silently
      }
    },
  }
}

// ─── SEO middleware (serve sitemap/robots/rss in dev) ──────────────────────

/**
 * SEO middleware for dev server.
 * Serves sitemap.xml, robots.txt, and rss.xml dynamically during
 * development.
 */
export function seoMiddleware(config: SeoPluginConfig = {}): Middleware {
  return async (ctx) => {
    if (ctx.url.pathname === '/robots.txt' && config.robots) {
      return new Response(generateRobots(config.robots), {
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    if (ctx.url.pathname === '/rss.xml' && config.rss) {
      return new Response(generateRssFeed(config.rss), {
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
      })
    }

    if (ctx.url.pathname === '/sitemap.xml' && config.sitemap) {
      try {
        const { scanRouteFiles } = await import('./fs-router')
        const routesDir = `${process.cwd()}/src/routes`
        const files = await scanRouteFiles(routesDir)
        const sitemap = generateSitemap(files, config.sitemap)

        return new Response(sitemap, {
          headers: { 'Content-Type': 'application/xml' },
        })
      } catch {
        // Sitemap generation failed — continue to rendering
      }
    }
  }
}
