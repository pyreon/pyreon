import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'

let sharpWarned = false
function warnSharpMissing() {
  if (sharpWarned) return
  sharpWarned = true
  // oxlint-disable-next-line no-console
  console.warn(
    '\n[zero:favicon] sharp not installed — favicons will not be generated. Install for full support: bun add -D sharp\n',
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
//   export default { plugins: [zero(), faviconPlugin({ source: "./icon.svg" })] }

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
   * Dark mode favicon (SVG only).
   * When provided, the SVG favicon uses prefers-color-scheme media query
   * to switch between light and dark variants.
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
      const devSourcePath = typeof config.devSource === 'string'
        ? join(root, config.devSource)
        : null
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
        const url = req.url ?? ''

        // Resolve locale-specific source
        const localeSource = resolveLocaleSource(url, config, root)
        const svgUrl = localeSource ? localeSource.url : url
        const svgPath = localeSource ? localeSource.sourcePath : sourcePath
        const isSvgSource = localeSource ? localeSource.source.endsWith('.svg') : config.source.endsWith('.svg')

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
          } catch { /* fall through */ }
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

      // SVG favicon (with prefers-color-scheme media query when dark variant exists)
      if (isSvg) {
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
          { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-light-32x32.png', ...lightAttrs }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-dark-32x32.png', ...darkAttrs }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-light-16x16.png', ...lightAttrs }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-dark-16x16.png', ...darkAttrs }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon-light.png', ...lightAttrs }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon-dark.png', ...darkAttrs }, injectTo: 'head' },
        )
      } else {
        // Single-variant (no dark mode)
        tags.push(
          { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }, injectTo: 'head' },
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

      return tags
    },

    async generateBundle() {
      if (!isBuild) return

      // Generate favicons for the base (default) source
      await generateFaviconSet.call(this, root, config.source, config.darkSource, '', config, themeColor, backgroundColor, generateManifest)

      // Generate locale-specific favicon sets
      if (config.locales) {
        for (const [locale, localeConfig] of Object.entries(config.locales)) {
          await generateFaviconSet.call(this, root, localeConfig.source, localeConfig.darkSource, `${locale}/`, config, themeColor, backgroundColor, generateManifest)
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
    console.warn(`[zero:favicon] Source not found: ${sourcePath}`)
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
      const lightName = name.replace(/^(favicon-)/, '$1light-').replace(/^(apple-touch-icon)/, '$1-light').replace(/^(icon-)/, '$1light-')
      const lightPng = await resizeToPng(sourcePath, size)
      if (lightPng) {
        this.emitFile({ type: 'asset', fileName: `${prefix}${lightName}`, source: lightPng })
      }

      // Dark variant
      if (darkExists) {
        const darkName = name.replace(/^(favicon-)/, '$1dark-').replace(/^(apple-touch-icon)/, '$1-dark').replace(/^(icon-)/, '$1dark-')
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
): Array<{ rel: string; type?: string; sizes?: string; href: string }> {
  const hasLocaleOverride = locale && config.locales?.[locale]
  const prefix = hasLocaleOverride ? `/${locale}` : ''
  const isSvg = (hasLocaleOverride ? config.locales![locale]!.source : config.source).endsWith('.svg')

  const links: Array<{ rel: string; type?: string; sizes?: string; href: string }> = []

  if (isSvg) {
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
    return await sharp(input).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } } as any).png().toBuffer()
  } catch {
    warnSharpMissing()
    return null
  }
}

async function generateIco(input: string): Promise<Uint8Array | null> {
  try {
    const sharp = await import('sharp').then((m) => m.default ?? m)
    const png16 = await sharp(input).resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } } as any).png().toBuffer()
    const png32 = await sharp(input).resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } } as any).png().toBuffer()

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
  header.writeUInt16LE(0, 0)              // reserved
  header.writeUInt16LE(1, 2)              // type: icon
  header.writeUInt16LE(entries.length, 4) // count

  // Directory entries
  const dirEntries = Buffer.alloc(dirSize)
  const dataBuffers: Buffer[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const offset = i * dirEntrySize
    dirEntries.writeUInt8(entry.size === 256 ? 0 : entry.size, offset)     // width
    dirEntries.writeUInt8(entry.size === 256 ? 0 : entry.size, offset + 1) // height
    dirEntries.writeUInt8(0, offset + 2)                                    // palette
    dirEntries.writeUInt8(0, offset + 3)                                    // reserved
    dirEntries.writeUInt16LE(1, offset + 4)                                 // color planes
    dirEntries.writeUInt16LE(32, offset + 6)                                // bits per pixel
    dirEntries.writeUInt32LE(entry.buffer.length, offset + 8)               // size
    dirEntries.writeUInt32LE(dataOffset, offset + 12)                       // offset

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

  const badge = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ef4444" stroke="white" stroke-width="${size * 0.03}"/>` +
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
      .composite([{
        input: badgePng,
        gravity: 'southeast',
      }])
      .png()
      .toBuffer()
  } catch {
    // sharp not available — return original
    return pngBuffer
  }
}
