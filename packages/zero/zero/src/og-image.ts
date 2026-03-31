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

let sharpWarned = false
function warnSharpMissing() {
  if (sharpWarned) return
  sharpWarned = true
  // oxlint-disable-next-line no-console
  console.warn(
    '\n[zero:og-image] sharp not installed — OG images will not be generated. Install for full support: bun add -D sharp\n',
  )
}

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolvePosition(value: number | string | undefined, dimension: number, fallback = '50%'): number {
  if (value === undefined) value = fallback
  if (typeof value === 'number') return value
  if (value.endsWith('%')) return Math.round((Number.parseFloat(value) / 100) * dimension)
  return Number.parseInt(value, 10) || 0
}

function resolveLayerText(layer: OgImageLayer, locale: string): string {
  if (typeof layer.text === 'string') return layer.text
  if (typeof layer.text === 'function') return layer.text(locale)
  return layer.text[locale] ?? layer.text[Object.keys(layer.text)[0] ?? ''] ?? ''
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
 * Build an SVG overlay with text layers.
 * @internal Exported for testing.
 */
export function buildTextOverlaySvg(
  layers: OgImageLayer[],
  width: number,
  height: number,
  locale: string,
): string {
  const textElements = layers.map((layer) => {
    const text = resolveLayerText(layer, locale)
    const x = resolvePosition(layer.x, width, '50%')
    const y = resolvePosition(layer.y, height, '50%')
    const fontSize = layer.fontSize ?? 64
    const fontFamily = layer.fontFamily ?? 'sans-serif'
    const fontWeight = layer.fontWeight ?? 'bold'
    const color = layer.color ?? '#ffffff'
    const anchor = layer.textAnchor ?? 'middle'
    const maxWidth = layer.maxWidth ?? Math.round(width * 0.8)

    // Simple word wrapping via tspan elements
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    // Approximate character width as 0.5 × fontSize
    const charWidth = fontSize * 0.5
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      if (testLine.length * charWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)

    const tspans = lines
      .map((line, i) => {
        const dy = i === 0 ? '0' : `${fontSize * 1.2}`
        return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`
      })
      .join('')

    return `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="${escapeXml(fontFamily)}" font-weight="${fontWeight}" fill="${color}" text-anchor="${anchor}" dominant-baseline="middle">${tspans}</text>`
  })

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${textElements.join('')}</svg>`
}

/**
 * Render an OG image from a template for a specific locale.
 * @internal Exported for testing.
 */
export async function renderOgImage(
  template: OgImageTemplate,
  locale: string,
  rootDir: string,
): Promise<Uint8Array | null> {
  try {
    const sharp = await import('sharp').then((m) => m.default ?? m)
    const width = template.width ?? 1200
    const height = template.height ?? 630

    let pipeline: any
    if (typeof template.background === 'string') {
      const bgPath = join(rootDir, template.background)
      pipeline = sharp(bgPath).resize(width, height, { fit: 'cover' })
    } else {
      pipeline = (sharp as any)({
        create: {
          width,
          height,
          channels: 4,
          background: template.background.color,
        },
      })
    }

    // Overlay text layers if any
    if (template.layers && template.layers.length > 0) {
      const svgOverlay = buildTextOverlaySvg(template.layers, width, height, locale)
      pipeline = pipeline.composite([{
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      }])
    }

    if (template.format === 'jpeg') {
      return await pipeline.jpeg({ quality: template.quality ?? 90 }).toBuffer()
    }
    return await pipeline.png().toBuffer()
  } catch {
    warnSharpMissing()
    return null
  }
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

    // Build: generate all variants
    async generateBundle() {
      if (!isBuild) return

      for (const template of config.templates) {
        const locales = config.locales ?? [undefined]
        const format = template.format ?? 'png'
        const ext = format === 'jpeg' ? 'jpg' : 'png'

        for (const locale of locales) {
          // Validate background exists if it's a file path
          if (typeof template.background === 'string') {
            const bgPath = join(root, template.background)
            if (!existsSync(bgPath)) {
              // oxlint-disable-next-line no-console
              console.warn(`[zero:og-image] Background not found: ${bgPath}`)
              continue
            }
          }

          const buffer = await renderOgImage(template, locale ?? 'en', root)
          if (!buffer) continue

          const suffix = locale ? `-${locale}` : ''
          this.emitFile({
            type: 'asset',
            fileName: `${outDir}/${template.name}${suffix}.${ext}`,
            source: buffer,
          })
        }
      }
    },
  }
}
