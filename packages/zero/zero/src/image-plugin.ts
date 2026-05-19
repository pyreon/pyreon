import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Plugin } from 'vite'

let sharpWarned = false
function warnSharpMissing() {
  if (sharpWarned) return
  sharpWarned = true
  // oxlint-disable-next-line no-console
  console.warn(
    '\n[Pyreon] sharp not installed — images will not be optimized. Install for full support: bun add -D sharp\n',
  )
}

// ─── Image processing Vite plugin ──────────────────────────────────────────
//
// Processes images at build time:
// - Generates multiple sizes for responsive srcset
// - Converts to modern formats (WebP, AVIF)
// - Creates tiny blur placeholders (base64 inline)
// - Outputs optimized images to the build directory
//
// Usage in code:
//   import heroImg from "./hero.jpg?optimize"
//   // → { src, srcset, width, height, placeholder }
//
// Or use the component helper:
//   import { Image } from "@pyreon/zero/image"
//   <Image src="/hero.jpg" width={1920} height={1080} optimize />

/**
 * CDN provider — rewrites image URLs to CDN endpoints.
 * Return the rewritten URL, or null to use local processing.
 */
export type ImageCdnProvider = (src: string, opts: {
  width: number
  quality: number
  format: ImageFormat
}) => string | null

/** Built-in CDN providers. */
export const cdnProviders = {
  /** Cloudinary: `https://res.cloudinary.com/{cloud}/image/upload/...` */
  cloudinary: (cloudName: string): ImageCdnProvider => (src, { width, quality, format }) =>
    `https://res.cloudinary.com/${cloudName}/image/upload/w_${width},q_${quality},f_${format}/${src}`,

  /** Imgix: `https://{domain}.imgix.net/...?w=...&q=...&fm=...` */
  imgix: (domain: string): ImageCdnProvider => (src, { width, quality, format }) =>
    `https://${domain}.imgix.net/${src}?w=${width}&q=${quality}&fm=${format}&auto=format`,

  /** Vercel Image Optimization: `/_next/image?url=...&w=...&q=...` */
  vercel: (): ImageCdnProvider => (src, { width, quality }) =>
    `/_vercel/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`,

  /** Bunny CDN: `https://{pullZone}.b-cdn.net/...?width=...&quality=...` */
  bunny: (pullZone: string): ImageCdnProvider => (src, { width, quality }) =>
    `https://${pullZone}.b-cdn.net/${src}?width=${width}&quality=${quality}`,
} as const

/**
 * Placeholder generation strategy.
 *
 * - `'blur'` — tiny downscaled + blurred WebP data URI (a few hundred bytes).
 *   The richest preview; faithfully previews the image's content.
 * - `'color'` — the image's dominant colour as a ~200-byte flat SVG data
 *   URI. Constant size regardless of source complexity (a blurred WebP
 *   grows with image content; this doesn't), zero decode, instant paint,
 *   zero layout shift. For real photos it's far smaller than `'blur'`; for
 *   trivial/solid sources `'blur'` can be the smaller of the two. Best when
 *   you want a clean solid backdrop rather than a blurry preview.
 * - `'none'` — no placeholder (`placeholder: ''`). Skips all placeholder work.
 *
 * `'dominant-color'` is a deprecated alias of `'color'` — it was typed from
 * the plugin's inception but never implemented (the build + dev paths always
 * fell through to blur). It now resolves to `'color'`; prefer the shorter
 * name in new code.
 */
export type PlaceholderStrategy = 'blur' | 'color' | 'dominant-color' | 'none'

/** Quality per output format (1-100), or a single number applied to all. */
export type ImageQuality = number | Partial<Record<ImageFormat, number>>

/**
 * Normalize the public {@link PlaceholderStrategy} to an internal kind.
 * @internal Exported for testing.
 */
export function normalizePlaceholder(s: PlaceholderStrategy): 'blur' | 'color' | 'none' {
  return s === 'dominant-color' ? 'color' : s
}

/** SVG processing options for ?component imports. */
export interface SvgOptions {
  /** Replace fill/stroke with currentColor. Default: true */
  currentColor?: boolean
  /** Default size (width/height). */
  defaultSize?: number
}

export interface ImagePluginConfig {
  /** Output directory for processed images. Default: "assets/img" */
  outDir?: string
  /** Default widths for responsive images. Default: [640, 1024, 1920] */
  widths?: number[]
  /** Output formats. Default: ["webp"] */
  formats?: ImageFormat[]
  /**
   * Quality for lossy formats (1-100). Default: 80.
   *
   * Accepts a single number applied to every format, OR a per-format map so
   * you can tune each codec independently — AVIF tolerates a much lower
   * number than WebP/JPEG for the same perceived quality:
   *
   * ```ts
   * imagePlugin({ formats: ['avif', 'webp'], quality: { avif: 55, webp: 75 } })
   * ```
   *
   * Formats omitted from the map fall back to 80.
   */
  quality?: ImageQuality
  /** Blur placeholder size in px (only used by the `'blur'` strategy). Default: 16 */
  placeholderSize?: number
  /** Placeholder strategy. Default: `"blur"`. See {@link PlaceholderStrategy}. */
  placeholder?: PlaceholderStrategy
  /** File patterns to process. Default: /\.(jpe?g|png|webp|avif)$/i */
  include?: RegExp
  /**
   * CDN provider for URL rewriting. When set, images are NOT processed
   * locally — URLs are rewritten to the CDN endpoint.
   *
   * @example
   * ```ts
   * imagePlugin({ cdn: cdnProviders.cloudinary('my-cloud') })
   * imagePlugin({ cdn: cdnProviders.vercel() })
   * ```
   */
  cdn?: ImageCdnProvider
  /**
   * SVG processing options. Enables `?component` import for inline SVGs.
   *
   * @example
   * ```tsx
   * import Logo from './logo.svg?component'
   * <Logo width={24} class="text-primary" />
   * ```
   */
  svg?: SvgOptions | boolean
}

export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'png'

/** Per-format source set for <picture> <source> elements. */
export interface FormatSource {
  /** MIME type. e.g. "image/webp", "image/avif" */
  type: string
  /** srcset string for this format. e.g. "/img-640.webp 640w, /img-1920.webp 1920w" */
  srcset: string
}

export interface ProcessedImage {
  /** Fallback source path (last format, largest width). */
  src: string
  /** Fallback srcset string (last format). */
  srcset: string
  /** Intrinsic width. */
  width: number
  /** Intrinsic height. */
  height: number
  /** Base64 blur placeholder data URI. */
  placeholder: string
  /** Per-format source sets for <picture> element. Ordered by priority (best format first). */
  formats: FormatSource[]
  /** Flat list of all sources. */
  sources: Array<{ src: string; width: number; format: string }>
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif)$/i

/**
 * Zero image processing Vite plugin.
 *
 * Transforms image imports with query params into optimized responsive images:
 *
 * @example
 * // vite.config.ts
 * import { imagePlugin } from "@pyreon/zero/image-plugin"
 *
 * export default {
 *   plugins: [
 *     pyreon(),
 *     zero(),
 *     imagePlugin({ widths: [480, 960, 1440], quality: 85 }),
 *   ],
 * }
 *
 * @example
 * // In a component — import with ?optimize
 * import hero from "./images/hero.jpg?optimize"
 * // hero = { src, srcset, width, height, placeholder }
 *
 * <Image {...hero} alt="Hero" priority />
 */
export function imagePlugin(config: ImagePluginConfig = {}): Plugin {
  const defaultWidths = config.widths ?? [640, 1024, 1920]
  const defaultFormats = config.formats ?? ['webp']
  const qualityFor = resolveQuality(config.quality)
  const placeholderSize = config.placeholderSize ?? 16
  const placeholderStrategy = normalizePlaceholder(config.placeholder ?? 'blur')
  const outSubDir = config.outDir ?? 'assets/img'
  const include = config.include ?? IMAGE_EXT_RE
  const cdn = config.cdn
  const svgOpts: SvgOptions | false = config.svg === true
    ? { currentColor: true }
    : config.svg === false || config.svg === undefined
      ? false
      : config.svg

  let root = ''
  let outDir = ''
  let isBuild = false

  return {
    name: 'pyreon-zero-images',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      root = resolvedConfig.root
      outDir = resolvedConfig.build.outDir
      isBuild = resolvedConfig.command === 'build'
    },

    async resolveId(id, importer) {
      const isSvgComponent =
        svgOpts && id.includes('?component') && id.split('?')[0]!.endsWith('.svg')
      const isOptimize =
        id.includes('?optimize') && include.test(id.split('?')[0]!)
      if (!isSvgComponent && !isOptimize) return null

      // Resolve the bare specifier to an ABSOLUTE fs path the way Vite
      // resolves `?url` — importer-relative + alias-aware. The old code
      // embedded the raw unresolved id, so `load()` had to guess: a
      // relative `./img.png?optimize` resolved against cwd (≠ the
      // importer's dir → ENOENT), and an aliased `~/x.png?optimize`
      // arrived already-absolute and got `join(root,'public',…)`-doubled.
      // `this.resolve` (skipSelf so we don't recurse into our own
      // resolveId) handles relative + aliases + extensions. A public-dir
      // web path (`/foo.png?optimize`) doesn't resolve to a module →
      // null → keep the original id so load()'s public/ fallback applies.
      const qIdx = id.indexOf('?')
      const bare = qIdx === -1 ? id : id.slice(0, qIdx)
      const query = qIdx === -1 ? '' : id.slice(qIdx)
      const resolved = await this.resolve(bare, importer, { skipSelf: true })
      const carried = resolved ? `${resolved.id}${query}` : id

      if (isSvgComponent) return `\0virtual:zero-svg:${carried}`
      return `\0virtual:zero-image:${carried}`
    },

    async load(id) {
      // SVG component loading
      if (id.startsWith('\0virtual:zero-svg:')) {
        const rawPath = id.replace('\0virtual:zero-svg:', '').split('?')[0] ?? id
        // resolveId now carries an absolute fs path for relative/aliased
        // imports → trust it if it exists. Only a public-dir web path
        // (`/logo.svg`, unresolved) falls back to root-join.
        const absPath = existsSync(rawPath)
          ? rawPath
          : rawPath.startsWith('/')
            ? join(root, rawPath)
            : rawPath
        if (!existsSync(absPath)) return null

        let svg = await readFile(absPath, 'utf-8')

        // Replace fill/stroke with currentColor
        if (svgOpts && (svgOpts as SvgOptions).currentColor !== false) {
          svg = svg
            .replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"')
            .replace(/stroke="(?!none)[^"]*"/g, 'stroke="currentColor"')
        }

        // Add default size from config
        const defaultSize = svgOpts && (svgOpts as SvgOptions).defaultSize
        if (defaultSize && !svg.includes('width=')) {
          svg = svg.replace('<svg', `<svg width="${defaultSize}" height="${defaultSize}"`)
        }

        // Export as Pyreon component
        return `
import { h } from '@pyreon/core'
const _svg = ${JSON.stringify(svg)}
export default function SvgComponent(props) {
  const el = h('span', {
    ...props,
    dangerouslySetInnerHTML: { __html: _svg },
    style: [
      'display:inline-flex;align-items:center;justify-content:center',
      props.width ? 'width:' + props.width + 'px' : '',
      props.height ? 'height:' + props.height + 'px' : '',
      props.style || '',
    ].filter(Boolean).join(';'),
  })
  return el
}
`
      }

      // Image optimization loading
      if (!id.startsWith('\0virtual:zero-image:')) return null

      const rawPath = id.replace('\0virtual:zero-image:', '').split('?')[0] ?? id
      // resolveId now carries an absolute fs path for relative/aliased
      // imports (the `./img.png?optimize` and `~/img.png?optimize` cases
      // that used to ENOENT / double-`public`). Trust an existing
      // absolute path; only an unresolved public-dir web path
      // (`/foo.png?optimize`) falls back to `<root>/public/…`.
      const absPath = existsSync(rawPath)
        ? rawPath
        : rawPath.startsWith('/')
          ? join(root, 'public', rawPath)
          : rawPath

      // CDN mode — rewrite URLs, no local processing
      if (cdn) {
        const metadata = await getImageMetadata(absPath)
        const sources = defaultWidths.map((w) => ({
          src:
            cdn(rawPath, {
              width: w,
              quality: qualityFor(defaultFormats[0]!),
              format: defaultFormats[0]!,
            }) ?? rawPath,
          width: w,
          format: defaultFormats[0]! as string,
        }))
        const srcset = sources.map((s) => `${s.src} ${s.width}w`).join(', ')
        const result: ProcessedImage = {
          src: sources[sources.length - 1]?.src ?? rawPath,
          srcset,
          width: metadata.width,
          height: metadata.height,
          placeholder: await generatePlaceholder(absPath, placeholderStrategy, placeholderSize),
          formats: defaultFormats.map((fmt) => ({
            type: `image/${fmt}`,
            srcset: defaultWidths
              .map(
                (w) =>
                  `${cdn(rawPath, { width: w, quality: qualityFor(fmt), format: fmt }) ?? rawPath} ${w}w`,
              )
              .join(', '),
          })),
          sources,
        }
        return `export default ${JSON.stringify(result)}`
      }

      if (!isBuild) {
        const result = await loadDevImage(
          absPath,
          rawPath,
          placeholderStrategy,
          placeholderSize,
        )
        return `export default ${JSON.stringify(result)}`
      }

      const processed = await processImage(absPath, {
        widths: defaultWidths,
        formats: defaultFormats,
        qualityFor,
        placeholderStrategy,
        placeholderSize,
        outSubDir,
        outDir: join(root, outDir),
      })

      await emitProcessedSources(processed, outSubDir, this)
      rebuildFormatSrcsets(processed, absPath)

      return `export default ${JSON.stringify(processed)}`
    },
  }
}

async function loadDevImage(
  absPath: string,
  rawPath: string,
  strategy: 'blur' | 'color' | 'none',
  placeholderSize: number,
): Promise<ProcessedImage> {
  const metadata = await getImageMetadata(absPath)
  // `rawPath` is a public-dir web path (e.g. `/logo.png`, served from
  // `public/` at the web root) ONLY when it does NOT resolve to a real
  // file on disk — the same discriminator the `absPath` derivation uses
  // above. `resolveId` now hands absolute fs paths for relative/aliased
  // imports (`/Users/…/img.png`); those ARE real files and must be
  // served through Vite's `/@fs/` prefix, not as a literal `/Users/…`
  // URL (which 404s in dev — build mode was unaffected).
  const isPublicWebPath = rawPath.startsWith('/') && !existsSync(rawPath)
  const publicPath = isPublicWebPath ? rawPath : `/@fs/${absPath}`

  return {
    src: publicPath,
    srcset: '',
    width: metadata.width,
    height: metadata.height,
    placeholder: await generatePlaceholder(absPath, strategy, placeholderSize),
    formats: [],
    sources: [{ src: publicPath, width: metadata.width, format: 'original' }],
  }
}

async function emitProcessedSources(
  processed: ProcessedImage,
  outSubDir: string,
  ctx: {
    emitFile: (f: { type: 'asset'; fileName: string; source: Uint8Array }) => void
  },
) {
  for (const source of processed.sources) {
    const fileName = join(outSubDir, basename(source.src))
    const content = await readFile(source.src)
    ctx.emitFile({ type: 'asset', fileName, source: content })
    source.src = `/${fileName}`
  }
}

function rebuildFormatSrcsets(processed: ProcessedImage, fallbackPath: string) {
  const formatGroups = new Map<string, string[]>()
  for (const s of processed.sources) {
    let group = formatGroups.get(s.format)
    if (!group) {
      group = []
      formatGroups.set(s.format, group)
    }
    group.push(`${s.src} ${s.width}w`)
  }
  processed.formats = [...formatGroups.entries()].map(([fmt, entries]) => ({
    type: `image/${fmt}`,
    srcset: entries.join(', '),
  }))

  const lastFormat = processed.formats.at(-1)
  processed.srcset = lastFormat?.srcset ?? ''
  processed.src = processed.sources.at(-1)?.src ?? fallbackPath
}

// ─── Image processing utilities ─────────────────────────────────────────────

interface ProcessOptions {
  widths: number[]
  formats: ImageFormat[]
  qualityFor: (format: ImageFormat) => number
  placeholderStrategy: 'blur' | 'color' | 'none'
  placeholderSize: number
  outSubDir: string
  outDir: string
}

async function processImage(absPath: string, opts: ProcessOptions): Promise<ProcessedImage> {
  const metadata = await getImageMetadata(absPath)
  const ext = extname(absPath)
  const name = basename(absPath, ext)
  const sources: Array<{ src: string; width: number; format: string }> = []

  // Ensure output directory exists
  const processedDir = join(opts.outDir, opts.outSubDir)
  if (!existsSync(processedDir)) {
    await mkdir(processedDir, { recursive: true })
  }

  // Generate resized variants — iterate formats first so sources are grouped by format
  for (const format of opts.formats) {
    for (const targetWidth of opts.widths) {
      // Don't upscale
      const width = Math.min(targetWidth, metadata.width)
      const outName = `${name}-${width}.${format}`
      const outPath = join(processedDir, outName)

      await resizeImage(absPath, outPath, width, format, opts.qualityFor(format))
      sources.push({ src: outPath, width, format })
    }
  }

  // Build per-format source sets for <picture>
  const formatGroups = new Map<string, Array<{ src: string; width: number }>>()
  for (const s of sources) {
    let group = formatGroups.get(s.format)
    if (!group) {
      group = []
      formatGroups.set(s.format, group)
    }
    group.push({ src: s.src, width: s.width })
  }

  const formats: FormatSource[] = [...formatGroups.entries()].map(([fmt, group]) => ({
    type: `image/${fmt === 'jpeg' ? 'jpeg' : fmt}`,
    srcset: group.map((s) => `${s.src} ${s.width}w`).join(', '),
  }))

  // Fallback: last format's srcset
  const fallbackFormat = formats[formats.length - 1]
  const fallbackSources = formatGroups.get([...formatGroups.keys()].pop()!)!

  // Generate the placeholder per the configured strategy. Pre-fix this
  // hard-coded `generateBlurPlaceholder`, so `placeholder: 'none'` was
  // ignored in build mode and `'dominant-color'` never resolved anywhere.
  const placeholder = await generatePlaceholder(
    absPath,
    opts.placeholderStrategy,
    opts.placeholderSize,
  )

  return {
    src: fallbackSources[fallbackSources.length - 1]?.src ?? absPath,
    srcset: fallbackFormat?.srcset ?? '',
    width: metadata.width,
    height: metadata.height,
    placeholder,
    formats,
    sources,
  }
}

interface ImageMetadata {
  width: number
  height: number
  format: string
}

/**
 * Read basic image metadata.
 * Uses minimal binary header parsing — no external dependencies.
 */
async function getImageMetadata(absPath: string): Promise<ImageMetadata> {
  const buffer = await readFile(absPath)
  const ext = extname(absPath).toLowerCase()

  if (ext === '.png') {
    // PNG: width at bytes 16-19, height at 20-23 (big-endian)
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    return { width, height, format: 'png' }
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    // JPEG: scan for SOF markers
    const dimensions = parseJpegDimensions(buffer)
    return { ...dimensions, format: 'jpeg' }
  }

  if (ext === '.webp') {
    // WebP: VP8 header
    const dimensions = parseWebPDimensions(buffer)
    return { ...dimensions, format: 'webp' }
  }

  // Fallback
  return { width: 0, height: 0, format: ext.slice(1) }
}

/** @internal Exported for testing */
export function parseJpegDimensions(buffer: Buffer): {
  width: number
  height: number
} {
  let offset = 2 // Skip SOI marker
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break
    const marker = buffer[offset + 1]!
    // SOF markers (0xC0-0xCF except 0xC4, 0xC8, 0xCC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buffer.readUInt16BE(offset + 5)
      const width = buffer.readUInt16BE(offset + 7)
      return { width, height }
    }
    const length = buffer.readUInt16BE(offset + 2)
    offset += 2 + length
  }
  return { width: 0, height: 0 }
}

/** @internal Exported for testing */
export function parseWebPDimensions(buffer: Buffer): {
  width: number
  height: number
} {
  // RIFF header: bytes 0-3 = "RIFF", 8-11 = "WEBP"
  const chunk = buffer.toString('ascii', 12, 16)
  if (chunk === 'VP8 ') {
    // Lossy VP8
    const width = buffer.readUInt16LE(26) & 0x3fff
    const height = buffer.readUInt16LE(28) & 0x3fff
    return { width, height }
  }
  if (chunk === 'VP8L') {
    // Lossless VP8L
    const bits = buffer.readUInt32LE(21)
    const width = (bits & 0x3fff) + 1
    const height = ((bits >> 14) & 0x3fff) + 1
    return { width, height }
  }
  if (chunk === 'VP8X') {
    // Extended VP8X
    const width = 1 + ((buffer[24]! | (buffer[25]! << 8) | (buffer[26]! << 16)) & 0xffffff)
    const height = 1 + ((buffer[27]! | (buffer[28]! << 8) | (buffer[29]! << 16)) & 0xffffff)
    return { width, height }
  }
  return { width: 0, height: 0 }
}

/**
 * Resize an image using native platform capabilities.
 * Uses sharp if available, falls back to canvas API.
 */
async function resizeImage(
  input: string,
  output: string,
  width: number,
  format: ImageFormat,
  quality: number,
): Promise<void> {
  try {
    // Try sharp (the standard Node.js image processing library)
    const sharp = await import('sharp').then((m) => m.default ?? m)
    let pipeline = sharp(input).resize(width)

    switch (format) {
      case 'webp':
        pipeline = pipeline.webp({ quality })
        break
      case 'avif':
        pipeline = pipeline.avif({ quality })
        break
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality, mozjpeg: true })
        break
      case 'png':
        pipeline = pipeline.png({ compressionLevel: 9 })
        break
    }

    await pipeline.toFile(output)
  } catch {
    // sharp not available — copy original as fallback
    warnSharpMissing()
    const content = await readFile(input)
    await writeFile(output, content)
  }
}

/**
 * Generate a tiny blur placeholder as a base64 data URI.
 */
async function generateBlurPlaceholder(input: string, size: number): Promise<string> {
  try {
    const sharp = await import('sharp').then((m) => m.default ?? m)
    const buffer = await sharp(input)
      .resize(size, size, { fit: 'inside' })
      .blur(2)
      .webp({ quality: 20 })
      .toBuffer()

    return `data:image/webp;base64,${buffer.toString('base64')}`
  } catch {
    // sharp not available — return a transparent placeholder
    return TRANSPARENT_PLACEHOLDER
  }
}

/** 1×1 transparent SVG — the no-sharp fallback for every strategy. */
const TRANSPARENT_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E"

const DEFAULT_QUALITY = 80

/**
 * Resolve the public {@link ImageQuality} config into a per-format lookup.
 *
 * - `undefined` → every format gets {@link DEFAULT_QUALITY}.
 * - `number` → that number for every format (backward-compatible).
 * - `Partial<Record<ImageFormat, number>>` → per-format; formats omitted
 *   from the map fall back to {@link DEFAULT_QUALITY}.
 *
 * @internal Exported for testing.
 */
export function resolveQuality(
  q: ImageQuality | undefined,
): (format: ImageFormat) => number {
  if (q === undefined) return () => DEFAULT_QUALITY
  if (typeof q === 'number') return () => q
  return (format) => q[format] ?? DEFAULT_QUALITY
}

/**
 * Dispatch placeholder generation by strategy. Single source of truth used
 * by every code path (CDN / dev / build) — pre-fix each path open-coded
 * `generateBlurPlaceholder`, so `'none'` was honoured only in the CDN path
 * and `'dominant-color'` (typed since the plugin's inception) was never
 * implemented anywhere — the exact typed-but-unimplemented bug class the
 * `audit-types` gate exists to catch.
 *
 * @internal Exported for testing.
 */
export async function generatePlaceholder(
  input: string,
  strategy: 'blur' | 'color' | 'none',
  size: number,
): Promise<string> {
  if (strategy === 'none') return ''
  if (strategy === 'color') return generateColorPlaceholder(input)
  return generateBlurPlaceholder(input, size)
}

/**
 * Generate a dominant-colour placeholder: a ~200-byte flat-fill SVG data URI.
 *
 * Uses sharp's `.stats()` `dominant` swatch — a histogram-binned colour,
 * not a naive average (averaging a photo trends muddy grey). Note the
 * swatch is approximate by design: a pure-red source resolves to ~#f80808,
 * not #ff0000. The SVG is a constant ~200 bytes regardless of source
 * complexity and needs zero image decode, at the cost of showing a solid
 * colour instead of a blurry preview of the content.
 */
async function generateColorPlaceholder(input: string): Promise<string> {
  try {
    const sharp = await import('sharp').then((m) => m.default ?? m)
    const { dominant } = await sharp(input).stats()
    const hex =
      '#' +
      [dominant.r, dominant.g, dominant.b]
        .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0'))
        .join('')
    // Inline SVG with the colour as a single rect — URL-encoded so it needs
    // no base64 inflation. preserveAspectRatio + viewBox let it scale to any
    // container the way an <img> placeholder is expected to.
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'>` +
      `<rect width='1' height='1' fill='${hex}'/></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  } catch {
    // sharp not available — transparent fallback (same as the blur path).
    return TRANSPARENT_PLACEHOLDER
  }
}
