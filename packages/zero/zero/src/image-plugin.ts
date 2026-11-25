import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { Plugin } from 'vite'
import {
  generatePlaceholder,
  imageMetadataFromBuffer,
  processImage,
  resolvePlaceholder,
  resolveQuality,
  type ImageMetadata,
} from './image-processing'

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
//   // → ProcessedImage { src, srcset, width, height, placeholder }
//
// Type the `?optimize` / `?component` / `?raw` imports out of the box —
// add ONE line to a tsconfig-covered `.d.ts` (e.g. `src/env.d.ts`):
//   /// <reference types="@pyreon/zero/image-types" />
// (ships the ambient `declare module "*?optimize"` etc. — reuses this
//  module's own `ProcessedImage`, so it never drifts.)
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
 */
export type PlaceholderStrategy = 'blur' | 'color' | 'none'

/** Quality per output format (1-100), or a single number applied to all. */
export type ImageQuality = number | Partial<Record<ImageFormat, number>>

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
 * Emit the descriptor as the module's default export with `toString()`,
 * `Symbol.toPrimitive` and `valueOf` overrides returning the URL.
 *
 * This is the **compatibility guardrail** for the bi-modal `<Image>` design.
 * Without it, code that does `<img src={imageImport}>` would render
 * `[object Object]` because attribute serialization stringifies via the
 * runtime's normal path. With it, descriptors **coerce to their URL** in
 * any string context (template literals, attribute values, `String(x)`,
 * `${x}`) so third-party components and pasted snippets keep working
 * unchanged. The descriptor still carries its rich shape — `<Image>`
 * reads `width` / `height` / `srcset` / `placeholder` off it directly,
 * and consumers can still spread it. Frozen to prevent accidental
 * mutation in the shared module-level descriptor.
 *
 * Emitted inline (no shared runtime import) to keep the per-image
 * payload at ~120 bytes — three property defs over the JSON.
 */
function emitDescriptor(d: ProcessedImage): string {
  return `const _d = ${JSON.stringify(d)};
const _s = () => _d.src;
Object.defineProperty(_d, 'toString', { value: _s });
Object.defineProperty(_d, 'valueOf', { value: _s });
Object.defineProperty(_d, Symbol.toPrimitive, { value: _s });
export default Object.freeze(_d);`
}

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
  const placeholderStrategy = resolvePlaceholder(config.placeholder ?? 'blur')
  const outSubDir = config.outDir ?? 'assets/img'
  const include = config.include ?? IMAGE_EXT_RE
  const cdn = config.cdn
  const svgOpts: SvgOptions | false = config.svg === true
    ? { currentColor: true }
    : config.svg === false || config.svg === undefined
      ? false
      : config.svg

  let root = ''
  let isBuild = false

  return {
    name: 'pyreon-zero-images',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      root = resolvedConfig.root
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
        return emitDescriptor(result)
      }

      if (!isBuild) {
        const result = await loadDevImage(
          absPath,
          rawPath,
          placeholderStrategy,
          placeholderSize,
        )
        return emitDescriptor(result)
      }

      const { image: processed, files } = await processImage(absPath, {
        widths: defaultWidths,
        formats: defaultFormats,
        qualityFor,
        placeholderStrategy,
        placeholderSize,
        outSubDir,
        cacheDir: join(root, 'node_modules', '.cache', 'pyreon-zero-images'),
      })

      emitProcessedSources(processed, files, outSubDir, this)
      rebuildFormatSrcsets(processed, absPath)

      return emitDescriptor(processed)
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

function emitProcessedSources(
  processed: ProcessedImage,
  files: Map<string, Uint8Array>,
  outSubDir: string,
  ctx: {
    emitFile: (f: { type: 'asset'; fileName: string; source: Uint8Array }) => void
  },
) {
  for (const source of processed.sources) {
    const fileName = join(outSubDir, source.src)
    ctx.emitFile({ type: 'asset', fileName, source: files.get(source.src)! })
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

/**
 * Read basic image metadata.
 * Uses minimal binary header parsing — no external dependencies.
 */
async function getImageMetadata(absPath: string): Promise<ImageMetadata> {
  return imageMetadataFromBuffer(await readFile(absPath), extname(absPath))
}

