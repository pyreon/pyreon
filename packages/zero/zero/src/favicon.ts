import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Plugin } from 'vite'

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

    // Inject favicon <link> tags into HTML
    transformIndexHtml() {
      const isSvg = config.source.endsWith('.svg')
      const tags: Array<{
        tag: string
        attrs: Record<string, string>
        injectTo: 'head'
      }> = []

      if (isSvg) {
        tags.push({
          tag: 'link',
          attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
          injectTo: 'head',
        })
      }

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

      const sourcePath = join(root, config.source)
      if (!existsSync(sourcePath)) {
        // eslint-disable-next-line no-console
        console.warn(`[zero:favicon] Source not found: ${sourcePath}`)
        return
      }

      const isSvg = config.source.endsWith('.svg')

      // Copy SVG as favicon.svg
      if (isSvg) {
        const svgContent = await readFile(sourcePath, 'utf-8')
        let finalSvg = svgContent

        // If dark mode variant provided, wrap in media query
        if (config.darkSource) {
          const darkPath = join(root, config.darkSource)
          if (existsSync(darkPath)) {
            const darkSvg = await readFile(darkPath, 'utf-8')
            finalSvg = wrapSvgWithDarkMode(svgContent, darkSvg)
          }
        }

        this.emitFile({
          type: 'asset',
          fileName: 'favicon.svg',
          source: finalSvg,
        })
      }

      // Generate PNG sizes via sharp
      for (const { size, name } of SIZES) {
        const pngBuffer = await resizeToPng(sourcePath, size)
        if (pngBuffer) {
          this.emitFile({
            type: 'asset',
            fileName: name,
            source: pngBuffer,
          })
        }
      }

      // Generate favicon.ico (16 + 32)
      const ico = await generateIco(sourcePath)
      if (ico) {
        this.emitFile({
          type: 'asset',
          fileName: 'favicon.ico',
          source: ico,
        })
      }

      // Generate web manifest
      if (generateManifest) {
        const manifest = {
          name: config.name ?? 'App',
          short_name: config.name ?? 'App',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
          theme_color: themeColor,
          background_color: backgroundColor,
          display: 'standalone',
        }

        this.emitFile({
          type: 'asset',
          fileName: 'site.webmanifest',
          source: JSON.stringify(manifest, null, 2),
        })
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

async function resizeToPng(input: string, size: number): Promise<Uint8Array | null> {
  try {
    const sharp = await import('sharp').then((m) => m.default ?? m)
    return await sharp(input).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  } catch {
    return null
  }
}

async function generateIco(input: string): Promise<Uint8Array | null> {
  try {
    const sharp = await import('sharp').then((m) => m.default ?? m)
    const png16 = await sharp(input).resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    const png32 = await sharp(input).resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()

    // ICO format: header + directory entries + PNG data
    return createIcoFromPngs([
      { buffer: png16, size: 16 },
      { buffer: png32, size: 32 },
    ])
  } catch {
    return null
  }
}

interface IcoEntry {
  buffer: Buffer
  size: number
}

function createIcoFromPngs(entries: IcoEntry[]): Uint8Array {
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
