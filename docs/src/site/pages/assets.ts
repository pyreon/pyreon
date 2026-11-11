import type { MetaTag } from '@pyreon/head'
import { usePageHead } from '../../components/site-head'
import { SITE_ORIGIN } from '../../blog/site'
import OG from '../assets/og.json'

/**
 * The ONE file through which the story, compare, migrate, benchmarks and
 * project pages reach assets and page metadata. The home slice is building
 * the shared helpers (`Picture`, `Loop`, `AnimatedSvg`, a head helper); when
 * they land, switching these pages over is an edit to this file only.
 *
 * Assets come from `09-site/assets` via `scripts/sync-site-pages.ts`:
 *   - diagram / chart SVGs in `src/site/assets/<group>/`, inlined (their CSS
 *     variables follow `<html data-theme>`, which an `<img>` cannot), one
 *     lazy chunk per file so a page carries only its own;
 *   - share images in `public/assets/og/`, brand files in `public/brand/`;
 *   - their manifest entries in `src/site/assets/pages-manifest.json`.
 */

// ─── Inline SVGs ──────────────────────────────────────────────────────────

const SVGS = import.meta.glob<string>('../assets/{why,compare,migrate,benchmarks}/*.svg', {
  query: '?raw',
  import: 'default',
})

/** Asset path as the manifest writes it, e.g. `why/components-run-once.svg`. */
export type SvgFile = string

/** The SVG markup of one asset (a lazy chunk), or `undefined` when the file is not in the app. */
export async function loadSvg(file: SvgFile): Promise<string | undefined> {
  const load = SVGS[`../assets/${file}`]
  return load ? load() : undefined
}

/** Several SVGs at once, keyed by file; missing files are left out. */
export async function loadSvgs(files: readonly SvgFile[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(
    files.map(async (f) => {
      const svg = await loadSvg(f)
      if (svg !== undefined) out[f] = svg
    }),
  )
  return out
}

/** Whether an asset SVG exists in the app (for tests and the diagram slots). */
export const hasSvg = (file: SvgFile): boolean => `../assets/${file}` in SVGS

// ─── Raster images (brand page) ───────────────────────────────────────────

export interface ImageVariant {
  file: string
  width: number
  height: number
  format: string
}
export interface ImageAsset {
  file: string
  alt: string
  width: number
  height: number
  theme?: string | undefined
  pair?: string | undefined
  variantFiles: ImageVariant[]
}

/** Manifest entries for raster files (loaded on the page that needs them). */
export async function loadImages(files: readonly string[]): Promise<Record<string, ImageAsset>> {
  const manifest = (await import('../assets/pages-manifest.json')).default as {
    assets: (Partial<ImageAsset> & { file: string })[]
  }
  const out: Record<string, ImageAsset> = {}
  for (const a of manifest.assets) {
    if (!files.includes(a.file)) continue
    out[a.file] = {
      file: a.file,
      alt: a.alt ?? '',
      width: a.width ?? 0,
      height: a.height ?? 0,
      theme: a.theme,
      pair: a.pair,
      variantFiles: a.variantFiles ?? [],
    }
  }
  return out
}

/** Public URL of a copied asset. Brand files live at `/brand/…`, the rest under `/assets/…`. */
export const assetUrl = (file: string): string => (file.startsWith('brand/') ? `/${file}` : `/assets/${file}`)

// ─── Page metadata ────────────────────────────────────────────────────────

const OG_IMAGES = OG as Readonly<Record<string, { file: string; alt: string }>>

/** The share image for a route (`og/default.png` is not copied; the site default applies). */
export const ogImageFor = (route: string): { url: string; alt: string } | null => {
  const og = OG_IMAGES[route]
  return og ? { url: `${SITE_ORIGIN}${assetUrl(og.file)}`, alt: og.alt } : null
}

/**
 * Title, description, canonical, Open Graph and Twitter tags for one page,
 * with its share image from the asset set when there is one (else the site
 * default the root layout sets).
 */
export function useSitePageHead(head: { path: string; title: string; description: string; meta?: MetaTag[] }): void {
  const og = ogImageFor(head.path)
  const image: MetaTag[] = og
    ? [
        { property: 'og:image', content: og.url },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: og.alt },
        { name: 'twitter:image', content: og.url },
        { name: 'twitter:image:alt', content: og.alt },
      ]
    : []
  usePageHead({ path: head.path, title: head.title, description: head.description, meta: [...image, ...(head.meta ?? [])] })
}
