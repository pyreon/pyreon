// ─── image-processing.ts ───────────────────────────────────────────────────
//
// Internal: the sharp pipeline behind `imagePlugin`: variant encoding,
// placeholders, quality resolution and the JPEG/WebP dimension parsers. Split
// out of the public entry `image-plugin.ts`, which imports from here, so
// these helpers are not public API; their unit tests reach them through
// `@pyreon/zero/internal-server`.

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { ImageFormat, ImageQuality, PlaceholderStrategy, ProcessedImage } from './image-plugin'

let sharpWarned = false

function warnSharpMissing() {
  if (sharpWarned) return
  sharpWarned = true
  // oxlint-disable-next-line no-console
  console.warn(
    '\n[Pyreon] sharp not installed — images will not be optimized. Install for full support: bun add -D sharp\n',
  )
}

/**
 * Validate the configured {@link PlaceholderStrategy}. An untyped (JS) config
 * with an unknown value would otherwise fall through to `'blur'` silently.
 * @internal Exported for testing.
 */
export function resolvePlaceholder(s: PlaceholderStrategy): PlaceholderStrategy {
  if (s === 'blur' || s === 'color' || s === 'none') return s
  throw new Error(
    `[Pyreon] imagePlugin: unknown placeholder strategy ${JSON.stringify(s)}. Use 'blur', 'color' or 'none'.`,
  )
}

// ─── Image processing utilities ─────────────────────────────────────────────

interface ProcessOptions {
  widths: number[]
  formats: ImageFormat[]
  qualityFor: (format: ImageFormat) => number
  placeholderStrategy: 'blur' | 'color' | 'none'
  placeholderSize: number
  outSubDir: string
  /** Encoded variants persist here across builds, keyed by content. */
  cacheDir: string
}

/**
 * Encode every requested variant of one image.
 *
 * - Variants encode CONCURRENTLY (sharp runs each on libvips' own thread
 *   pool), where they used to run one after another.
 * - Each variant is keyed by the source bytes plus width, format, quality and
 *   the libvips version, and cached under `cacheDir`, so an unchanged image
 *   costs a file read on the next build instead of a re-encode.
 * - Output stays in memory and goes straight to `emitFile`; it is no longer
 *   written into the output directory first and read back.
 * - File names carry a content hash (`hero-1a2b3c4d-640.webp`). They are
 *   served from `/assets/`, which every adapter marks `immutable`, so an
 *   unhashed name kept a changed image stale for a year, and two `hero.jpg`
 *   files in different folders overwrote each other.
 * - Widths that clamp to the same value (a 800px source asked for 1024 and
 *   1920) produce ONE variant, not duplicate files and srcset entries.
 *
 * @internal Exported for testing.
 */
export async function processImage(
  absPath: string,
  opts: ProcessOptions,
): Promise<{ image: ProcessedImage; files: Map<string, Uint8Array> }> {
  const input = await readFile(absPath)
  const metadata = imageMetadataFromBuffer(input, extname(absPath))
  const name = basename(absPath, extname(absPath))
  const sharp = await loadSharp()
  const encoderId = sharp ? `vips-${sharp.versions.vips}` : 'copy'
  const inputHash = createHash('sha256').update(input).digest('hex')

  const widths = [...new Set(opts.widths.map((w) => (metadata.width ? Math.min(w, metadata.width) : w)))]
  // Formats first so sources stay grouped by format.
  const jobs = opts.formats.flatMap((format) => widths.map((width) => ({ format, width })))

  const encoded = await Promise.all(
    jobs.map(async ({ format, width }) => {
      const quality = opts.qualityFor(format)
      const key = createHash('sha256')
        .update(`${inputHash}|${width}|${format}|${quality}|${encoderId}`)
        .digest('hex')
      const bytes = await cachedEncode(opts.cacheDir, key, sharp !== null, () =>
        encodeVariant(sharp, input, width, format, quality).catch((err: unknown) => {
          // Same fallback as before (ship the original bytes), but no longer
          // silent: a variant that failed to encode is named.
          // oxlint-disable-next-line no-console
          console.warn(
            `[Pyreon] image: could not encode ${basename(absPath)} as ${format} at ${width}px, shipping the original: ${String(err)}`,
          )

          return input
        }),
      )

      return { file: `${name}-${key.slice(0, 8)}-${width}.${format}`, width, format, bytes }
    }),
  )

  const files = new Map<string, Uint8Array>()
  const sources: Array<{ src: string; width: number; format: string }> = []
  for (const e of encoded) {
    files.set(e.file, e.bytes)
    sources.push({ src: e.file, width: e.width, format: e.format })
  }

  // Pre-fix this hard-coded `generateBlurPlaceholder`, so `placeholder:
  // 'none'` was ignored in build mode.
  const placeholder = await generatePlaceholder(
    absPath,
    opts.placeholderStrategy,
    opts.placeholderSize,
  )

  // `src` / `srcset` / `formats` are rebuilt from the final URLs by
  // `rebuildFormatSrcsets` once the files are emitted.
  return {
    image: {
      src: sources.at(-1)?.src ?? absPath,
      srcset: '',
      width: metadata.width,
      height: metadata.height,
      placeholder,
      formats: [],
      sources,
    },
    files,
  }
}

async function cachedEncode(
  cacheDir: string,
  key: string,
  cacheable: boolean,
  encode: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const path = join(cacheDir, `${key}.bin`)
  if (cacheable) {
    try {
      return await readFile(path)
    } catch {
      // miss
    }
  }
  const bytes = await encode()
  if (cacheable) {
    try {
      await mkdir(cacheDir, { recursive: true })
      await writeFile(path, bytes)
    } catch {
      // A read-only cache dir costs the next build a re-encode, nothing else.
    }
  }

  return bytes
}

type Sharp = (typeof import('sharp'))['default']

async function loadSharp(): Promise<Sharp | null> {
  try {
    const m = await import('sharp')
    return (m.default ?? m) as Sharp
  } catch {
    warnSharpMissing()
    return null
  }
}

export interface ImageMetadata {
  width: number
  height: number
  format: string
}

export function imageMetadataFromBuffer(buffer: Buffer, extension: string): ImageMetadata {
  const ext = extension.toLowerCase()

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

/** Resize + encode one variant; without sharp the original bytes pass through. */
async function encodeVariant(
  sharp: Sharp | null,
  input: Buffer,
  width: number,
  format: ImageFormat,
  quality: number,
): Promise<Uint8Array> {
  if (!sharp) return input
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

  return pipeline.toBuffer()
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
 * and the dominant-colour strategy was never implemented anywhere — the
 * exact typed-but-unimplemented bug class the `audit-types` gate exists to
 * catch.
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
