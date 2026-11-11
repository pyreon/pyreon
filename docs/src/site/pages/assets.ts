/**
 * Inline SVGs for the story, compare, migrate and benchmarks pages.
 *
 * Diagram and chart SVGs come from the asset set through
 * `scripts/sync-site-assets.ts`, which puts inlinable SVGs in
 * `src/site/media/<group>/`. They are inlined (their CSS variables follow
 * `<html data-theme>`, which an `<img>` cannot), one lazy chunk per file so a
 * page carries only its own. Raster images, share images and loops use the
 * kit's helpers (`kit/media.tsx`, `kit/assets.ts`; head: `site/head.ts`).
 */

const SVGS = import.meta.glob<string>('../media/{why,compare,migrate,benchmarks}/*.svg', {
  query: '?raw',
  import: 'default',
})

/** Asset path as the manifest writes it, e.g. `why/components-run-once.svg`. */
export type SvgFile = string

/** The SVG markup of one asset (a lazy chunk), or `undefined` when the file is not in the app. */
export async function loadSvg(file: SvgFile): Promise<string | undefined> {
  const load = SVGS[`../media/${file}`]
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
export const hasSvg = (file: SvgFile): boolean => `../media/${file}` in SVGS
