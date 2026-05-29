import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Stable content hash (FNV-1a, 32-bit) of the favicon source file(s),
 * rendered as a `?v=<hex>` cache-bust query for the injected `<head>`
 * links. Browsers cache favicons extremely aggressively (often per-
 * session / effectively forever), so with a stable URL a changed icon
 * is never re-fetched by returning visitors. Same source bytes →
 * identical query (no needless cache churn); changed bytes → new query
 * → browser re-downloads. Falls back to `''` (no query, prior
 * behaviour) if a source can't be read — never break the build over a
 * cache-bust nicety. NOTE: this versions everything referenced via
 * `<link>` (svg/png/apple-touch/manifest). The bare `/favicon.ico`
 * convention request (browsers fetch it with no link tag) and the
 * `site.webmanifest`'s internal icon entries keep stable URLs — those
 * rely on host cache headers / are re-resolved on PWA (re)install.
 */
export function faviconVersionQuery(paths: string[]): string {
  let h = 0x811c9dc5
  let any = false
  for (const p of paths) {
    let buf: Buffer
    try {
      buf = readFileSync(p)
    } catch {
      continue
    }
    any = true
    for (let i = 0; i < buf.length; i++) {
      h ^= buf[i]!
      h = Math.imul(h, 0x01000193)
    }
  }
  if (!any) return ''
  return `?v=${(h >>> 0).toString(16).padStart(8, '0')}`
}

let sharpWarned = false
function warnSharpMissing() {
  if (sharpWarned) return
  sharpWarned = true
  // oxlint-disable-next-line no-console
  console.warn(
    '\n[Pyreon] sharp not installed — favicons will not be generated. Install for full support: bun add -D sharp\n',
  )
}

// ─── Favicon generation plugin ──────────────────────────────────────────────
//
// Generates all favicon formats from a single source file (SVG or PNG):
// - favicon.ico (16x16 + 32x32 combined)
// - favicon.svg (copied if source is SVG)
// - apple-touch-icon.png (180x180)
// - icon-192.png (for web manifest)
// - icon-512.png (for web manifest)
// - site.webmanifest
//
// Usage:
//   import { faviconPlugin } from "@pyreon/zero"
//   export default { plugins: [Pyreon] }

export interface FaviconLocaleConfig {
  /** Locale-specific source icon (SVG or PNG). */
  source: string
  /** Optional dark mode variant for this locale. */
  darkSource?: string
}

export interface FaviconPluginConfig {
  /** Path to the source icon (SVG or PNG, at least 512x512 for PNG). */
  source: string
  /** Theme color for web manifest. Default: "#ffffff" */
  themeColor?: string
  /** Background color for web manifest. Default: "#ffffff" */
  backgroundColor?: string
  /** App name for web manifest. Uses package.json name if not set. */
  name?: string
  /** Generate web manifest. Default: true */
  manifest?: boolean
  /**
   * Dark-mode favicon source.
   *
   * When provided, the plugin emits theme-aware `light`/`dark` variants
   * (`favicon-light.svg` / `favicon-dark.svg` for SVG sources, plus the
   * `*-light-*` / `*-dark-*` PNG/apple-touch set) tagged with
   * `data-favicon-theme`. The injected blocking theme-swap script and
   * `initTheme()` toggle their `media` attribute so the displayed
   * favicon follows the app's resolved theme — including a manual
   * in-app theme toggle, not just the OS `prefers-color-scheme`.
   *
   * For SVG sources a `favicon.svg` is also emitted that wraps both
   * variants behind an OS `prefers-color-scheme` query — kept as the
   * no-JS / direct-`/favicon.svg`-reference fallback only (it cannot
   * follow a manual toggle, which is why the `data-favicon-theme`
   * variants above are what the reactive mechanism actually uses).
   */
  darkSource?: string
  /**
   * Locale-specific icon overrides. Each key is a locale code,
   * value is a source icon (and optional dark variant).
   * Locales not in this map use the base `source`.
   *
   * Generated files are placed under `/{locale}/` prefix:
   *   /de/favicon.svg, /de/favicon-32x32.png, etc.
   *
   * @example
   * ```ts
   * faviconPlugin({
   *   source: "./icon.svg",
   *   locales: {
   *     de: { source: "./icon-de.svg" },
   *     cs: { source: "./icon-cs.svg" },
   *   },
   * })
   * ```
   */
  locales?: Record<string, FaviconLocaleConfig>
  /**
   * Dev mode favicon — shown only during development to distinguish
   * dev tabs from production. Can be:
   * - A path to a separate icon file
   * - `true` to auto-generate a dev badge (grayscale + "DEV" overlay)
   *
   * @example
   * ```ts
   * faviconPlugin({
   *   source: "./icon.svg",
   *   devSource: "./icon-dev.svg",     // custom dev icon
   *   // OR
   *   devSource: true,                 // auto-generate grayscale badge
   * })
   * ```
   */
  devSource?: string | boolean
}

interface FaviconSize {
  size: number
  name: string
}

const SIZES: FaviconSize[] = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
]

/**
 * Favicon generation Vite plugin.
 *
 * Generates all required favicon formats at build time from a single source.
 * In dev mode, serves the source directly.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { faviconPlugin } from "@pyreon/zero"
 *
 * export default {
 *   plugins: [faviconPlugin({ source: "./src/assets/icon.svg" })],
 * }
 * ```
 */
export function faviconPlugin(config: FaviconPluginConfig): Plugin {
  const themeColor = config.themeColor ?? '#ffffff'
  const backgroundColor = config.backgroundColor ?? '#ffffff'
  const generateManifest = config.manifest !== false

  let root = ''
  let isBuild = false
  // Lazily computed once per build/dev session (source rarely changes
  // within a run; recomputing per index.html transform is wasteful).
  let versionQuery: string | null = null
  function getVersionQuery(): string {
    if (versionQuery === null) {
      const paths = [join(root, config.source)]
      if (config.darkSource) paths.push(join(root, config.darkSource))
      versionQuery = faviconVersionQuery(paths)
    }
    return versionQuery
  }

  return {
    name: 'pyreon-zero-favicon',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      root = resolvedConfig.root
      isBuild = resolvedConfig.command === 'build'
    },

    // Dev server: serve generated favicons on-the-fly
    configureServer(server) {
      const sourcePath = join(root, config.source)
      const darkPath = config.darkSource ? join(root, config.darkSource) : null
      const devSourcePath =
        typeof config.devSource === 'string' ? join(root, config.devSource) : null
      const autoDevBadge = config.devSource === true
      const devCache = new Map<string, Uint8Array>()

      /** Resolve source path for a request — handles dark variants and dev badge. */
      function resolveSourceForDev(baseName: string, defaultSource: string): string {
        // Dark variant: favicon-dark-32x32.png → use darkSource
        if (darkPath && baseName.includes('-dark-')) return darkPath
        // Light variant: favicon-light-32x32.png → use source
        if (baseName.includes('-light-')) return defaultSource
        return defaultSource
      }

      server.middlewares.use(async (req, res, next) => {
        // Strip the `?v=<hash>` cache-bust query (and any query) before
        // matching — the injected links carry it; dev serves fresh
        // (`Cache-Control: no-cache`) so the version is irrelevant here,
        // but a query in the path would break every name match below.
        const url = (req.url ?? '').split('?')[0]!

        // Resolve locale-specific source
        const localeSource = resolveLocaleSource(url, config, root)
        const svgUrl = localeSource ? localeSource.url : url
        const svgPath = localeSource ? localeSource.sourcePath : sourcePath
        const isSvgSource = localeSource
          ? localeSource.source.endsWith('.svg')
          : config.source.endsWith('.svg')

        // Serve the per-theme SVG variants (the app-toggle path):
        // /favicon-light.svg → source, /favicon-dark.svg → darkSource.
        // Dev-badge / devSource override applies to the light variant
        // only (it is the active default the swap toggles to), matching
        // the /favicon.svg handler's intent.
        if (
          isSvgSource &&
          (svgUrl.endsWith('/favicon-light.svg') || svgUrl.endsWith('/favicon-dark.svg'))
        ) {
          const isDarkVariant = svgUrl.endsWith('/favicon-dark.svg')
          const variantPath = isDarkVariant ? (darkPath ?? svgPath) : svgPath
          try {
            let content = await readFile(variantPath, 'utf-8')
            if (!isDarkVariant) {
              if (autoDevBadge) content = addDevBadgeToSvg(content)
              else if (devSourcePath && existsSync(devSourcePath)) {
                content = await readFile(devSourcePath, 'utf-8')
              }
            }
            res.setHeader('Content-Type', 'image/svg+xml')
            res.end(content)
            return
          } catch {
            /* fall through */
          }
        }

        // Serve favicon.svg — in dev, add dev badge overlay if configured
        if (svgUrl.endsWith('/favicon.svg') && isSvgSource) {
          try {
            let content = await readFile(svgPath, 'utf-8')
            if (autoDevBadge) content = addDevBadgeToSvg(content)
            else if (devSourcePath && existsSync(devSourcePath)) {
              content = await readFile(devSourcePath, 'utf-8')
            }
            res.setHeader('Content-Type', 'image/svg+xml')
            res.end(content)
            return
          } catch {
            /* fall through */
          }
        }

        // Serve generated PNGs on-demand — supports dark variants + dev badge
        const baseName = svgUrl.split('/').pop() ?? ''
        // Strip light-/dark- prefix for size matching
        const cleanName = baseName.replace(/-?(light|dark)-/, '-')
        const sizeMatch = SIZES.find((s) => s.name === cleanName || baseName === s.name)
        if (sizeMatch) {
          const resolvedSource = resolveSourceForDev(baseName, svgPath)
          const cacheKey = `${resolvedSource}:${sizeMatch.size}:${autoDevBadge}`
          let png = devCache.get(cacheKey)
          if (!png) {
            let result = await resizeToPng(resolvedSource, sizeMatch.size)
            if (result && autoDevBadge) {
              result = await addDevBadgeToPng(result, sizeMatch.size)
            }
            if (result) {
              png = result
              devCache.set(cacheKey, result)
            }
          }
          if (png) {
            res.setHeader('Content-Type', 'image/png')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(Buffer.from(png))
            return
          }
        }

        // Serve generated ICO on-demand
        if (baseName === 'favicon.ico') {
          const cacheKey = `ico:${svgPath}`
          let ico: Uint8Array | undefined = devCache.get(cacheKey)
          if (!ico) {
            const result = await generateIco(svgPath)
            if (result) {
              ico = result
              devCache.set(cacheKey, result)
            }
          }
          if (ico) {
            res.setHeader('Content-Type', 'image/x-icon')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(Buffer.from(ico))
            return
          }
        }

        // Serve manifest (supports /{locale}/site.webmanifest)
        if (baseName === 'site.webmanifest' && generateManifest) {
          const prefix = localeSource ? `/${localeSource.locale}` : ''
          const manifest = {
            name: config.name ?? 'App',
            short_name: config.name ?? 'App',
            icons: [
              { src: `${prefix}/icon-192.png`, sizes: '192x192', type: 'image/png' },
              { src: `${prefix}/icon-512.png`, sizes: '512x512', type: 'image/png' },
            ],
            theme_color: themeColor,
            background_color: backgroundColor,
            display: 'standalone',
          }
          res.setHeader('Content-Type', 'application/manifest+json')
          res.end(JSON.stringify(manifest, null, 2))
          return
        }

        next()
      })
    },

    // Inject favicon <link> tags into HTML
    transformIndexHtml() {
      const isSvg = config.source.endsWith('.svg')
      const hasDark = !!config.darkSource
      const tags: Array<{
        tag: string
        attrs: Record<string, string>
        injectTo: 'head'
      }> = []

      // SVG favicon. Browsers prefer an SVG favicon over PNG when both
      // are present, so the SVG link MUST carry the same
      // `data-favicon-theme` contract the PNG dual-variant uses —
      // otherwise the theme-swap script / initTheme() (which only touch
      // `[data-favicon-theme]`) can never change the displayed icon and
      // the whole reactive-favicon feature is silently dead in every
      // SVG-capable browser. When a dark variant exists, emit TWO
      // theme-aware SVG links (mirroring the PNG pattern); the static
      // `/favicon.svg` (an OS `prefers-color-scheme` wrapped dual) stays
      // emitted as the no-JS / direct-reference fallback only.
      if (isSvg && hasDark) {
        tags.push(
          {
            tag: 'link',
            attrs: {
              rel: 'icon',
              type: 'image/svg+xml',
              href: '/favicon-light.svg',
              'data-favicon-theme': 'light',
            },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: {
              rel: 'icon',
              type: 'image/svg+xml',
              href: '/favicon-dark.svg',
              'data-favicon-theme': 'dark',
              media: 'not all',
            },
            injectTo: 'head',
          },
        )
      } else if (isSvg) {
        tags.push({
          tag: 'link',
          attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
          injectTo: 'head',
        })
      }

      if (hasDark) {
        // Dual-variant PNG/ICO favicons — light active, dark hidden via media="not all".
        // The themeScript and initTheme() swap these based on the resolved theme.
        const lightAttrs = { 'data-favicon-theme': 'light' }
        const darkAttrs = { 'data-favicon-theme': 'dark', media: 'not all' }

        tags.push(
          {
            tag: 'link',
            attrs: {
              rel: 'icon',
              type: 'image/png',
              sizes: '32x32',
              href: '/favicon-light-32x32.png',
              ...lightAttrs,
            },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: {
              rel: 'icon',
              type: 'image/png',
              sizes: '32x32',
              href: '/favicon-dark-32x32.png',
              ...darkAttrs,
            },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: {
              rel: 'icon',
              type: 'image/png',
              sizes: '16x16',
              href: '/favicon-light-16x16.png',
              ...lightAttrs,
            },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: {
              rel: 'icon',
              type: 'image/png',
              sizes: '16x16',
              href: '/favicon-dark-16x16.png',
              ...darkAttrs,
            },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: {
              rel: 'apple-touch-icon',
              sizes: '180x180',
              href: '/apple-touch-icon-light.png',
              ...lightAttrs,
            },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: {
              rel: 'apple-touch-icon',
              sizes: '180x180',
              href: '/apple-touch-icon-dark.png',
              ...darkAttrs,
            },
            injectTo: 'head',
          },
        )
      } else {
        // Single-variant (no dark mode)
        tags.push(
          {
            tag: 'link',
            attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
            injectTo: 'head',
          },
        )
      }

      if (generateManifest) {
        tags.push({
          tag: 'link',
          attrs: { rel: 'manifest', href: '/site.webmanifest' },
          injectTo: 'head',
        })
      }

      tags.push({
        tag: 'meta',
        attrs: { name: 'theme-color', content: themeColor },
        injectTo: 'head',
      })

      // Auto-inject favicon swap script when dark variant exists.
      // This runs in the blocking <head> before any render — no flash.
      // Reads theme from localStorage or OS preference, then swaps
      // data-favicon-theme media attributes.
      if (hasDark) {
        tags.push({
          tag: 'script',
          attrs: {},
          injectTo: 'head',
          children: `(function(){try{var t=localStorage.getItem("zero-theme");var r=t==="light"?"light":t==="dark"?"dark":window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";document.querySelectorAll("[data-favicon-theme]").forEach(function(l){l.media=l.dataset.faviconTheme===r?"":"not all"})}catch(e){}})()`,
        } as any)
      }

      // Cache-bust: stamp the source content hash onto every injected
      // favicon/manifest link href so a changed icon is actually
      // re-downloaded by returning visitors (theme-swap toggles `media`,
      // not `href`, so this is orthogonal to the light/dark variants).
      const v = getVersionQuery()
      if (v) {
        for (const t of tags) {
          if (t.tag === 'link' && t.attrs.href) t.attrs.href += v
        }
      }

      return tags
    },

    async generateBundle() {
      if (!isBuild) return

      // `faviconPlugin` is in the plugin list and a `source` is configured
      // (it's a required field), so the user clearly WANTS favicons. If
      // `sharp` is missing, the old behaviour was a single swallow-able
      // `console.warn` + emit nothing — i.e. silently ship a production
      // site with zero favicons. That's the footgun. Fail the build loudly
      // with an actionable message instead. Dev keeps the soft warning
      // (see `warnSharpMissing`) so local iteration isn't blocked.
      try {
        await import('sharp')
      } catch {
        this.error(
          '[Pyreon] faviconPlugin: a favicon `source` is configured but ' +
            '`sharp` is not installed — NO favicons would be generated and ' +
            'the production build would silently ship none.\n' +
            '  Fix:    bun add -D sharp   (or: npm i -D sharp)\n' +
            `  Source: ${config.source}\n` +
            'To intentionally build without favicons, remove faviconPlugin() ' +
            'from your Vite plugins.',
        )
      }

      // Generate favicons for the base (default) source
      await generateFaviconSet.call(
        this,
        root,
        config.source,
        config.darkSource,
        '',
        config,
        themeColor,
        backgroundColor,
        generateManifest,
      )

      // Generate locale-specific favicon sets
      if (config.locales) {
        for (const [locale, localeConfig] of Object.entries(config.locales)) {
          await generateFaviconSet.call(
            this,
            root,
            localeConfig.source,
            localeConfig.darkSource,
            `${locale}/`,
            config,
            themeColor,
            backgroundColor,
            generateManifest,
          )
        }
      }
    },
  }
}

/**
 * Wrap two SVGs into a single SVG that switches based on prefers-color-scheme.
 */
function wrapSvgWithDarkMode(lightSvg: string, darkSvg: string): string {
  // Extract viewBox from light SVG
  const viewBoxMatch = lightSvg.match(/viewBox="([^"]*)"/)
  const viewBox = viewBoxMatch?.[1] ?? '0 0 32 32'

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  <style>
    :root { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) { .light { display: none; } }
    @media (prefers-color-scheme: light), (prefers-color-scheme: no-preference) { .dark { display: none; } }
  </style>
  <g class="light">${stripSvgWrapper(lightSvg)}</g>
  <g class="dark">${stripSvgWrapper(darkSvg)}</g>
</svg>`
}

function stripSvgWrapper(svg: string): string {
  return svg
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim()
}

/**
 * Resolve the source path for a locale-prefixed favicon URL.
 * Returns null if the URL is not locale-prefixed or locale has no override.
 */
function resolveLocaleSource(
  url: string,
  config: FaviconPluginConfig,
  rootDir: string,
): { locale: string; url: string; source: string; sourcePath: string } | null {
  if (!config.locales) return null

  for (const [locale, localeConfig] of Object.entries(config.locales)) {
    const prefix = `/${locale}/`
    if (url.startsWith(prefix)) {
      return {
        locale,
        url,
        source: localeConfig.source,
        sourcePath: join(rootDir, localeConfig.source),
      }
    }
  }
  return null
}

/**
 * Generate a complete favicon set (SVG, PNGs, ICO, manifest) with a file prefix.
 * Called once for base (prefix = '') and once per locale (prefix = '{locale}/').
 */
async function generateFaviconSet(
  this: any,
  rootDir: string,
  source: string,
  darkSource: string | undefined,
  prefix: string,
  config: FaviconPluginConfig,
  themeColor: string,
  backgroundColor: string,
  generateManifest: boolean,
): Promise<void> {
  const sourcePath = join(rootDir, source)
  if (!existsSync(sourcePath)) {
    // oxlint-disable-next-line no-console
    console.warn(`[Pyreon] Source not found: ${sourcePath}`)
    return
  }

  const isSvg = source.endsWith('.svg')

  // Copy SVG as favicon.svg
  if (isSvg) {
    const svgContent = await readFile(sourcePath, 'utf-8')
    let finalSvg = svgContent

    if (darkSource) {
      const darkPath = join(rootDir, darkSource)
      if (existsSync(darkPath)) {
        const darkSvg = await readFile(darkPath, 'utf-8')
        finalSvg = wrapSvgWithDarkMode(svgContent, darkSvg)
        // Per-theme SVG variants for the app-toggle path:
        // transformIndexHtml / faviconLinks emit
        // `/favicon-light.svg` + `/favicon-dark.svg` with
        // `data-favicon-theme` so the theme-swap actually changes the
        // SVG (the wrapped `favicon.svg` is OS-`prefers-color-scheme`
        // only — kept above as the no-JS / direct-ref fallback).
        this.emitFile({
          type: 'asset',
          fileName: `${prefix}favicon-light.svg`,
          source: svgContent,
        })
        this.emitFile({
          type: 'asset',
          fileName: `${prefix}favicon-dark.svg`,
          source: darkSvg,
        })
      }
    }

    this.emitFile({
      type: 'asset',
      fileName: `${prefix}favicon.svg`,
      source: finalSvg,
    })
  }

  // Generate PNG sizes via sharp
  if (darkSource) {
    // Dual-variant: generate light + dark PNGs with prefixed names
    const darkPath = join(rootDir, darkSource)
    const darkExists = existsSync(darkPath)

    for (const { size, name } of SIZES) {
      // Light variant
      const lightName = name
        .replace(/^(favicon-)/, '$1light-')
        .replace(/^(apple-touch-icon)/, '$1-light')
        .replace(/^(icon-)/, '$1light-')
      const lightPng = await resizeToPng(sourcePath, size)
      if (lightPng) {
        this.emitFile({ type: 'asset', fileName: `${prefix}${lightName}`, source: lightPng })
      }

      // Dark variant
      if (darkExists) {
        const darkName = name
          .replace(/^(favicon-)/, '$1dark-')
          .replace(/^(apple-touch-icon)/, '$1-dark')
          .replace(/^(icon-)/, '$1dark-')
        const darkPng = await resizeToPng(darkPath, size)
        if (darkPng) {
          this.emitFile({ type: 'asset', fileName: `${prefix}${darkName}`, source: darkPng })
        }
      }
    }

    // Also generate standard names (used by manifest + external references)
    for (const { size, name } of SIZES) {
      const pngBuffer = await resizeToPng(sourcePath, size)
      if (pngBuffer) {
        this.emitFile({ type: 'asset', fileName: `${prefix}${name}`, source: pngBuffer })
      }
    }
  } else {
    // Single-variant
    for (const { size, name } of SIZES) {
      const pngBuffer = await resizeToPng(sourcePath, size)
      if (pngBuffer) {
        this.emitFile({ type: 'asset', fileName: `${prefix}${name}`, source: pngBuffer })
      }
    }
  }

  // Generate favicon.ico (16 + 32)
  const ico = await generateIco(sourcePath)
  if (ico) {
    this.emitFile({
      type: 'asset',
      fileName: `${prefix}favicon.ico`,
      source: ico,
    })
  }

  // Generate web manifest
  if (generateManifest) {
    const manifestPrefix = prefix ? `/${prefix.slice(0, -1)}` : ''
    const manifest = {
      name: config.name ?? 'App',
      short_name: config.name ?? 'App',
      icons: [
        { src: `${manifestPrefix}/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${manifestPrefix}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
      theme_color: themeColor,
      background_color: backgroundColor,
      display: 'standalone',
    }

    this.emitFile({
      type: 'asset',
      fileName: `${prefix}site.webmanifest`,
      source: JSON.stringify(manifest, null, 2),
    })
  }
}

/**
 * Get favicon link tags for a specific locale.
 * Returns link objects suitable for `useHead()` or direct HTML injection.
 *
 * @example
 * ```ts
 * const links = faviconLinks("de", { source: "./icon.svg", locales: { de: { source: "./icon-de.svg" } } })
 * // → [{ rel: "icon", type: "image/svg+xml", href: "/de/favicon.svg" }, ...]
 * ```
 */
export function faviconLinks(
  locale: string | undefined,
  config: FaviconPluginConfig,
): Array<{
  rel: string
  type?: string
  sizes?: string
  href: string
  'data-favicon-theme'?: string
  media?: string
}> {
  const hasLocaleOverride = locale && config.locales?.[locale]
  const prefix = hasLocaleOverride ? `/${locale}` : ''
  const isSvg = (hasLocaleOverride ? config.locales![locale]!.source : config.source).endsWith(
    '.svg',
  )
  const hasDark = !!config.darkSource

  const links: Array<{
    rel: string
    type?: string
    sizes?: string
    href: string
    'data-favicon-theme'?: string
    media?: string
  }> = []

  // Mirror transformIndexHtml: a single static SVG link would always
  // win over the theme-toggled PNGs (browsers prefer SVG), silently
  // killing reactive switching for SSR'd pages too. Emit the two
  // theme-aware SVG variants so initTheme()'s `[data-favicon-theme]`
  // swap reaches the SVG. `/favicon.svg` stays the no-JS fallback.
  if (isSvg && hasDark) {
    links.push(
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: `${prefix}/favicon-light.svg`,
        'data-favicon-theme': 'light',
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: `${prefix}/favicon-dark.svg`,
        'data-favicon-theme': 'dark',
        media: 'not all',
      },
    )
  } else if (isSvg) {
    links.push({ rel: 'icon', type: 'image/svg+xml', href: `${prefix}/favicon.svg` })
  }

  links.push(
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${prefix}/favicon-32x32.png` },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: `${prefix}/favicon-16x16.png` },
    { rel: 'apple-touch-icon', sizes: '180x180', href: `${prefix}/apple-touch-icon.png` },
  )

  if (config.manifest !== false) {
    links.push({ rel: 'manifest', href: `${prefix}/site.webmanifest` })
  }

  return links
}

async function resizeToPng(input: string, size: number): Promise<Uint8Array | null> {
  try {
    const sharp = await import('sharp').then((m) => m.default ?? m)
    return await sharp(input)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } } as any)
      .png()
      .toBuffer()
  } catch {
    warnSharpMissing()
    return null
  }
}

async function generateIco(input: string): Promise<Uint8Array | null> {
  try {
    const sharp = await import('sharp').then((m) => m.default ?? m)
    const png16 = await sharp(input)
      .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } } as any)
      .png()
      .toBuffer()
    const png32 = await sharp(input)
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } } as any)
      .png()
      .toBuffer()

    // ICO format: header + directory entries + PNG data
    return createIcoFromPngs([
      { buffer: png16, size: 16 },
      { buffer: png32, size: 32 },
    ])
  } catch {
    warnSharpMissing()
    return null
  }
}

export interface IcoEntry {
  buffer: Buffer
  size: number
}

/** @internal Exported for testing */
export function createIcoFromPngs(entries: IcoEntry[]): Uint8Array {
  const headerSize = 6
  const dirEntrySize = 16
  const dirSize = dirEntrySize * entries.length
  let dataOffset = headerSize + dirSize

  // ICO header
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4) // count

  // Directory entries
  const dirEntries = Buffer.alloc(dirSize)
  const dataBuffers: Buffer[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const offset = i * dirEntrySize
    dirEntries.writeUInt8(entry.size === 256 ? 0 : entry.size, offset) // width
    dirEntries.writeUInt8(entry.size === 256 ? 0 : entry.size, offset + 1) // height
    dirEntries.writeUInt8(0, offset + 2) // palette
    dirEntries.writeUInt8(0, offset + 3) // reserved
    dirEntries.writeUInt16LE(1, offset + 4) // color planes
    dirEntries.writeUInt16LE(32, offset + 6) // bits per pixel
    dirEntries.writeUInt32LE(entry.buffer.length, offset + 8) // size
    dirEntries.writeUInt32LE(dataOffset, offset + 12) // offset

    dataOffset += entry.buffer.length
    dataBuffers.push(entry.buffer)
  }

  return Buffer.concat([header, dirEntries, ...dataBuffers])
}

// ─── Dev badge helpers ──────────────────────────────────────────────────────

/**
 * Add a "DEV" badge overlay to an SVG string.
 * Adds a small colored circle with "DEV" text in the bottom-right corner.
 */
function addDevBadgeToSvg(svg: string): string {
  const viewBoxMatch = svg.match(/viewBox="([^"]*)"/)
  const viewBox = viewBoxMatch?.[1] ?? '0 0 32 32'
  const [, , w, h] = viewBox.split(' ').map(Number)
  const size = Math.min(w ?? 32, h ?? 32)
  const r = size * 0.28
  const cx = (w ?? 32) - r
  const cy = (h ?? 32) - r
  const fontSize = r * 0.85

  const badge =
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ef4444" stroke="white" stroke-width="${size * 0.03}"/>` +
    `<text x="${cx}" y="${cy}" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">D</text>`

  // Insert badge before closing </svg>
  return svg.replace(/<\/svg>\s*$/, `${badge}</svg>`)
}

/**
 * Add a "DEV" badge to a PNG buffer via sharp composite.
 * Composites a red circle with "D" in the bottom-right corner.
 */
async function addDevBadgeToPng(pngBuffer: Uint8Array, size: number): Promise<Uint8Array> {
  try {
    const sharp = await import('sharp').then((m) => m.default ?? m)
    const r = Math.round(size * 0.28)
    const d = r * 2
    const fontSize = Math.round(r * 0.85)

    const badgeSvg = `<svg width="${d}" height="${d}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${r}" cy="${r}" r="${r}" fill="#ef4444"/>
      <text x="${r}" y="${r}" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">D</text>
    </svg>`

    const badgePng = await sharp(Buffer.from(badgeSvg)).png().toBuffer()

    return await (sharp(Buffer.from(pngBuffer)) as any)
      .composite([
        {
          input: badgePng,
          gravity: 'southeast',
        },
      ])
      .png()
      .toBuffer()
  } catch {
    // sharp not available — return original
    return pngBuffer
  }
}
