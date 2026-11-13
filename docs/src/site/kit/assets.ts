import assetsJson from '../content/_assets.json'

/**
 * The visual assets the app ships (`content/_assets.json`, written by
 * `scripts/sync-site-assets.ts` from `09-site/assets/manifest.json`). Server
 * code reads it to build `<picture>` sources, video sources and share
 * images; islands receive the resolved URLs as props and never import it.
 *
 * Files keep their manifest paths: rasters, videos and share images are
 * served at `/media/<file>`, top-level brand icons at `/brand/<file>`, and
 * inlinable SVGs are imported from `src/site/media/` (`?raw` / `?url`).
 */

export interface Variant {
  readonly file: string
  readonly width: number
  readonly height: number
  readonly format: string
}

export interface AssetRecord {
  readonly file: string
  readonly kind: string
  readonly pages: readonly string[]
  readonly slot: string
  readonly alt: string
  readonly theme: string
  readonly pair?: string
  readonly poster?: string | { readonly dark: string; readonly light: string }
  readonly posterVariants?: { readonly dark: readonly Variant[]; readonly light: readonly Variant[] } | readonly Variant[]
  readonly variantFiles?: readonly Variant[]
  readonly width?: number
  readonly height?: number
  readonly size?: string
}

export const ASSETS: readonly AssetRecord[] = (assetsJson as unknown as { assets: AssetRecord[] }).assets
const BY_FILE = new Map(ASSETS.map((a) => [a.file, a]))

/** The manifest record of a shipped file. Throws with the fix when it was not synced. */
export function asset(file: string): AssetRecord {
  const a = BY_FILE.get(file)
  if (a === undefined) {
    throw new Error(
      `[Pyreon] Asset "${file}" is not in content/_assets.json. Run \`bun scripts/sync-site-assets.ts <09-site> <route>\` for the page that uses it.`,
    )
  }
  return a
}

/** The URL a shipped file is served at. */
export function mediaUrl(file: string): string {
  if (/^brand\/[^/]+$/.test(file)) return `/${file}`
  return `/media/${file}`
}

/** One `<source>` per format, widths ascending (`srcset` with `w` descriptors). */
export interface SourceSet {
  readonly type: string
  readonly srcset: string
}

/** AVIF first (smallest), then WebP; each with every width variant. */
export function sourceSets(variants: readonly Variant[]): SourceSet[] {
  const out: SourceSet[] = []
  for (const format of ['avif', 'webp']) {
    const list = variants.filter((v) => v.format === format).toSorted((a, b) => a.width - b.width)
    if (list.length > 0) out.push({ type: `image/${format}`, srcset: list.map((v) => `${mediaUrl(v.file)} ${v.width}w`).join(', ') })
  }
  return out
}

/** The largest WebP variant: the `<img src>` fallback a browser without `srcset` support loads. */
export function fallbackVariant(variants: readonly Variant[]): Variant | undefined {
  return variants.filter((v) => v.format === 'webp').toSorted((a, b) => b.width - a.width)[0]
}

/** A raster image (or a poster set) ready for `<Picture>`: sources, fallback, intrinsic size. */
export interface PictureData {
  readonly sources: readonly SourceSet[]
  readonly src: string
  readonly width: number
  readonly height: number
  readonly alt: string
}

/** Picture data for a raster file with width variants. */
export function pictureOf(file: string): PictureData {
  const a = asset(file)
  const variants = a.variantFiles ?? []
  const fb = fallbackVariant(variants)
  const width = Math.round(a.width ?? fb?.width ?? 0)
  const height = Math.round(a.height ?? fb?.height ?? 0)
  return { sources: sourceSets(variants), src: fb ? mediaUrl(fb.file) : mediaUrl(file), width, height, alt: a.alt }
}

/** Picture data for the dark or light poster of an animated SVG, chart or video. */
export function posterOf(file: string, mode: 'dark' | 'light'): PictureData {
  const a = asset(file)
  const pv = a.posterVariants
  const variants = pv === undefined ? [] : Array.isArray(pv) ? pv : (pv as { dark: readonly Variant[]; light: readonly Variant[] })[mode]
  const fb = fallbackVariant(variants)
  const poster = typeof a.poster === 'string' ? a.poster : a.poster?.[mode]
  const largest = variants.toSorted((x, y) => y.width - x.width)[0]
  return {
    sources: sourceSets(variants),
    src: fb ? mediaUrl(fb.file) : poster ? mediaUrl(poster) : '',
    width: Math.round(a.width ?? largest?.width ?? 0),
    height: Math.round(a.height ?? largest?.height ?? 0),
    alt: a.alt,
  }
}

/** The dark/light pair of a theme-split asset: `[dark file, light file]`. */
export function themePair(file: string): { dark: string; light: string } {
  const a = asset(file)
  if (a.theme === 'both' || a.pair === undefined) return { dark: file, light: file }
  return a.theme === 'dark' ? { dark: file, light: a.pair } : { dark: a.pair, light: file }
}

// ─── Share images ──────────────────────────────────────────────────────────

export interface ShareImage {
  /** Absolute URL (crawlers need one). */
  readonly url: string
  readonly width: number
  readonly height: number
  readonly alt: string
}

const SITE_ORIGIN = 'https://pyreon.dev'

/**
 * The share image (`og:image` / `twitter:image`) of a route: the manifest's
 * `og` asset whose `pages` names the route, else the site default
 * (`og/default.png`). Always a 1200×630 PNG.
 */
export function shareImage(route: string): ShareImage {
  const path = route.length > 1 ? route.replace(/\/$/, '') : route
  const og = ASSETS.filter((a) => a.slot === 'og')
  const hit = og.find((a) => a.pages.includes(path)) ?? og.find((a) => a.pages.includes('*') || a.pages.includes('/*'))
  if (hit === undefined) {
    throw new Error('[Pyreon] No share image: og/default.png is missing from content/_assets.json. Re-run scripts/sync-site-assets.ts.')
  }
  return { url: `${SITE_ORIGIN}${mediaUrl(hit.file)}`, width: hit.width ?? 1200, height: hit.height ?? 630, alt: hit.alt }
}
