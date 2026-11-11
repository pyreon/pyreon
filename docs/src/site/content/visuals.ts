/**
 * A product page's visuals, from `visuals/<id>.json` (written by
 * `scripts/sync-site-assets.ts` from the asset set's manifest: alt text,
 * sizes and width variants are the manifest's, never hand-copied).
 *
 * Loaded lazily per id beside the product's content file, so a page carries
 * only its own visual. The files in `public/assets/` they point to are copied
 * by the same script.
 */

/** One raster in AVIF + WebP widths (`srcset` strings) with a WebP fallback. */
export interface PictureSource {
  avif: string
  webp: string
  src: string
  width: number
  height: number
}

/** A capture that exists once per theme. */
export interface ThemedPicture {
  alt: string
  width: number
  height: number
  dark: PictureSource
  light: PictureSource
}

export interface LoopSide {
  webm: string
  mp4: string
  poster: { avif: string[]; webp: string[]; src: string }
}

export type HeroVisual =
  | { kind: 'svg'; alt: string; width: number; height: number; svg: string }
  | ({ kind: 'pair' } & ThemedPicture)
  | {
      kind: 'loop'
      alt: string
      width: number
      height: number
      smallWidth: number
      smallHeight: number
      labels: string[]
      dark: { large: LoopSide; small: LoopSide }
      light: { large: LoopSide; small: LoopSide }
    }

export interface ProductVisuals {
  id: string
  og: { src: string; width: number; height: number; alt: string } | null
  hero: HeroVisual
  /** Further animated SVGs the page shows (Native's pipeline), keyed by file name. */
  svgs?: Record<string, { alt: string; svg: string }>
  /** Real device captures (`today-ios`, `today-android`, `today-web`). */
  stills?: Record<string, ThemedPicture>
}

const files = import.meta.glob<ProductVisuals>('./visuals/*.json', { import: 'default' })
const LOADERS = new Map(Object.entries(files).map(([path, load]) => [path.slice(path.lastIndexOf('/') + 1, -'.json'.length), load]))

export const VISUAL_IDS: readonly string[] = [...LOADERS.keys()].sort()

export async function loadVisuals(id: string): Promise<ProductVisuals | undefined> {
  const load = LOADERS.get(id)
  return load ? load() : undefined
}
