// ─── og-image-render.ts ────────────────────────────────────────────────────
//
// Internal: renders an `ogImagePlugin` template to PNG through sharp (text
// overlay SVG + compositing). Split out of the public entry `og-image.ts`,
// which imports from here, so these helpers are not public API; their unit
// tests reach them through `@pyreon/zero/internal-server`.

import { join } from 'node:path'
import type { OgImageLayer, OgImageTemplate } from './og-image'

let sharpWarned = false

function warnSharpMissing() {
  if (sharpWarned) return
  sharpWarned = true
  // oxlint-disable-next-line no-console
  console.warn(
    '\n[Pyreon] sharp not installed — OG images will not be generated. Install for full support: bun add -D sharp\n',
  )
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

    // Word wrapping via tspan elements.
    // Width estimation: Latin chars ~0.55em, CJK chars ~1.0em, narrow chars ~0.35em.
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    const estimateWidth = (s: string): number => {
      let w = 0
      for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i)
        if (code >= 0x3000 && code <= 0x9FFF) {
          // CJK characters — full width
          w += fontSize * 1.0
        } else if (code <= 0x7E && 'iljft!|:;.,\''.includes(s[i]!)) {
          // Narrow Latin characters
          w += fontSize * 0.35
        } else {
          // Regular Latin characters
          w += fontSize * 0.55
        }
      }

      return w
    }

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      if (estimateWidth(testLine) > maxWidth && currentLine) {
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
