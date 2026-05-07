import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Middleware } from '@pyreon/server'
import type { Plugin } from 'vite'

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
}

export interface SitemapEntry {
  path: string
  changefreq?: ChangeFreq
  priority?: number
  lastmod?: string
}

export type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

/**
 * Generate a sitemap.xml string from route file paths.
 */
export function generateSitemap(routeFiles: string[], config: SitemapConfig): string {
  const { origin, exclude = [], changefreq = 'weekly', priority = 0.7 } = config

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

  const allPaths: SitemapEntry[] = [
    ...paths.map((p) => ({ path: p, changefreq, priority })),
    ...(config.additionalPaths ?? []),
  ]

  const entries = allPaths
    .map((entry) => {
      const loc = `${origin}${entry.path === '/' ? '' : entry.path}`
      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <changefreq>${entry.changefreq ?? changefreq}</changefreq>
    <priority>${entry.priority ?? priority}</priority>${entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''}
  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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
          const sitemap = generateSitemap(files, config.sitemap)

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
        if (existsSync(manifestPath)) {
          const raw = await readFile(manifestPath, 'utf-8')
          const parsed = JSON.parse(raw) as { paths?: unknown }
          if (Array.isArray(parsed.paths)) {
            ssgPaths = parsed.paths
              .filter((p): p is string => typeof p === 'string')
              .map((path) => ({ path }))
          }
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
        const sitemap = generateSitemap(files, merged)
        await writeFile(join(distDir, 'sitemap.xml'), sitemap, 'utf-8')
      } catch {
        // Sitemap generation failed — skip silently
      }
    },
  }
}

// ─── SEO middleware (serve sitemap/robots in dev) ────────────────────────────

/**
 * SEO middleware for dev server.
 * Serves sitemap.xml and robots.txt dynamically during development.
 */
export function seoMiddleware(config: SeoPluginConfig = {}): Middleware {
  return async (ctx) => {
    if (ctx.url.pathname === '/robots.txt' && config.robots) {
      return new Response(generateRobots(config.robots), {
        headers: { 'Content-Type': 'text/plain' },
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
