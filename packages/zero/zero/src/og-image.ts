/**
 * OG Image generation plugin.
 *
 * Generates Open Graph images at build time from templates with
 * text overlays. Supports locale-specific text for i18n apps.
 * Uses sharp for image processing (same optional dep as favicon/image plugins).
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { ogImagePlugin } from "@pyreon/zero/og-image"
 *
 * export default {
 *   plugins: [
 *     ogImagePlugin({
 *       locales: ["en", "de", "cs"],
 *       templates: [{
 *         name: "default",
 *         background: "./src/assets/og-bg.jpg",
 *         layers: [{
 *           text: { en: "Build faster", de: "Schneller bauen", cs: "Stavte rychleji" },
 *           y: "40%",
 *           fontSize: 72,
 *         }],
 *       }],
 *     }),
 *   ],
 * }
 * ```
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { renderOgImage } from './og-image-render'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OgImageLayer {
  /**
   * Text content. Can be:
   * - A string (same for all locales)
   * - A record mapping locale → text
   * - A function receiving locale and returning text
   */
  text: string | Record<string, string> | ((locale: string) => string)
  /** X position — number (px) or string with % (e.g. "50%"). Default: "50%" */
  x?: number | string
  /** Y position — number (px) or string with % (e.g. "40%"). Default: "50%" */
  y?: number | string
  /** Font size in px. Default: 64 */
  fontSize?: number
  /** Font family. Default: "sans-serif" */
  fontFamily?: string
  /** Font weight. Default: "bold" */
  fontWeight?: string
  /** Text color. Default: "#ffffff" */
  color?: string
  /** Text anchor (alignment). Default: "middle" */
  textAnchor?: 'start' | 'middle' | 'end'
  /** Max width in px before wrapping. Default: 80% of image width. */
  maxWidth?: number
}

export interface OgImageTemplate {
  /** Template name — used for output file naming. */
  name: string
  /**
   * Background: path to an image file, or a solid color config.
   *
   * @example "./src/assets/og-bg.jpg"
   * @example { color: "#0066ff", width: 1200, height: 630 }
   */
  background: string | { color: string; width?: number; height?: number }
  /** Output width. Default: 1200 */
  width?: number
  /** Output height. Default: 630 */
  height?: number
  /** Output format. Default: "png" */
  format?: 'png' | 'jpeg'
  /** JPEG quality (1-100). Default: 90 */
  quality?: number
  /** Text layers to overlay on the background. */
  layers?: OgImageLayer[]
}

export interface OgImagePluginConfig {
  /** Templates to generate. */
  templates: OgImageTemplate[]
  /** Locales to generate for. When omitted, generates a single image per template. */
  locales?: string[]
  /** Output directory prefix. Default: "og" */
  outDir?: string
}

// ─── Path utility ───────────────────────────────────────────────────────────

/**
 * Compute the OG image path for a template and locale.
 *
 * @example
 * ```ts
 * ogImagePath("default", "de")      // → "/og/default-de.png"
 * ogImagePath("default")            // → "/og/default.png"
 * ogImagePath("hero", "en", "images") // → "/images/hero-en.png"
 * ```
 */
export function ogImagePath(
  templateName: string,
  locale?: string,
  outDir = 'og',
  format: 'png' | 'jpeg' = 'png',
): string {
  const ext = format === 'jpeg' ? 'jpg' : 'png'
  const suffix = locale ? `-${locale}` : ''
  return `/${outDir}/${templateName}${suffix}.${ext}`
}

// ─── Vite plugin ────────────────────────────────────────────────────────────

/**
 * OG image generation Vite plugin.
 *
 * Generates Open Graph images at build time. In dev, generates on-demand.
 * Requires `sharp` as an optional dependency.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { ogImagePlugin } from "@pyreon/zero/og-image"
 *
 * export default {
 *   plugins: [
 *     ogImagePlugin({
 *       locales: ["en", "de"],
 *       templates: [{
 *         name: "default",
 *         background: { color: "#0066ff" },
 *         layers: [{ text: { en: "Hello", de: "Hallo" }, fontSize: 72 }],
 *       }],
 *     }),
 *   ],
 * }
 * ```
 */
export function ogImagePlugin(config: OgImagePluginConfig): Plugin {
  const outDir = config.outDir ?? 'og'
  let root = ''
  let isBuild = false

  return {
    name: 'pyreon-zero-og-image',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      root = resolvedConfig.root
      isBuild = resolvedConfig.command === 'build'
    },

    // Dev: generate on-demand
    configureServer(server) {
      const devCache = new Map<string, Uint8Array>()

      // Invalidate the dev cache when a template's background image changes —
      // the cache key is template name + locale, which doesn't change when
      // the background file's CONTENT does.
      const watchedBackgrounds = config.templates
        .map((t) => (typeof t.background === 'string' ? join(root, t.background) : null))
        .filter((p): p is string => p !== null)
      if (watchedBackgrounds.length > 0) {
        server.watcher.add(watchedBackgrounds)
        server.watcher.on('change', (file) => {
          if (watchedBackgrounds.includes(file)) devCache.clear()
        })
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith(`/${outDir}/`)) return next()

        // Parse: /og/default-en.png → template=default, locale=en
        const fileName = url.slice(outDir.length + 2) // strip /{outDir}/
        const match = fileName.match(/^(.+?)(?:-([a-z]{2,5}))?\.(png|jpe?g)$/)
        if (!match) return next()

        const [, templateName, locale, ext] = match
        const template = config.templates.find((t) => t.name === templateName)
        if (!template) return next()

        const resolvedLocale = locale ?? config.locales?.[0] ?? 'en'
        const cacheKey = `${templateName}:${resolvedLocale}`

        let buffer = devCache.get(cacheKey)
        if (!buffer) {
          const result = await renderOgImage(template, resolvedLocale, root)
          if (!result) return next()
          buffer = result
          devCache.set(cacheKey, result)
        }

        const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
        res.setHeader('Content-Type', contentType)
        res.setHeader('Cache-Control', 'no-cache')
        res.end(Buffer.from(buffer))
      })
    },

    // Build: generate all template × locale variants IN PARALLEL — each is an
    // independent sharp composite (previously awaited sequentially, so 3
    // templates × 5 locales paid 15× the single-image wall clock).
    async generateBundle() {
      if (!isBuild) return

      const jobs: Promise<{ fileName: string; buffer: Uint8Array | null }>[] = []
      for (const template of config.templates) {
        const locales = config.locales ?? [undefined]
        const format = template.format ?? 'png'
        const ext = format === 'jpeg' ? 'jpg' : 'png'

        // Validate background exists if it's a file path (once per template,
        // not per locale — the path doesn't vary by locale).
        if (typeof template.background === 'string') {
          const bgPath = join(root, template.background)
          if (!existsSync(bgPath)) {
            // oxlint-disable-next-line no-console
            console.warn(`[Pyreon] Background not found: ${bgPath}`)
            continue
          }
        }

        for (const locale of locales) {
          const suffix = locale ? `-${locale}` : ''
          const fileName = `${outDir}/${template.name}${suffix}.${ext}`
          jobs.push(
            renderOgImage(template, locale ?? 'en', root).then((buffer) => ({ fileName, buffer })),
          )
        }
      }

      for (const { fileName, buffer } of await Promise.all(jobs)) {
        if (!buffer) continue
        this.emitFile({ type: 'asset', fileName, source: buffer })
      }
    },
  }
}
