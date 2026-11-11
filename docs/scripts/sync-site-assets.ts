/**
 * Copy the product pages' visuals from the marketing asset set into the app.
 *
 *   bun scripts/sync-site-assets.ts <path-to-09-site> <id> [id ...]
 *
 * For each product id it reads `assets/manifest.json` and
 *
 *   - writes `src/site/content/visuals/<id>.json` (typed by
 *     `src/site/content/visuals.ts`): the hero visual (an inline animated SVG,
 *     a dark/light capture pair, or the three-targets loop), the share image,
 *     any further SVG the page uses (`svgs`) and the platform stills
 *     (`stills`), with the manifest's alt text, sizes and width variants;
 *   - copies the raster and video files those entries reference into
 *     `public/assets/<same path>` (the asset set's README layout). Animated
 *     SVGs are inlined from the JSON, so they are not copied.
 *
 * The asset set is generated elsewhere and re-synced; nothing here edits it.
 * The app loads `visuals/<id>.json` lazily with the product's own content
 * file, so a page carries only its own visual.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

interface Variant {
  file: string
  width: number
  height: number
  format: 'webp' | 'avif'
}
interface Asset {
  file: string
  kind: string
  pages?: string[]
  slot?: string
  alt?: string
  theme?: string
  pair?: string
  poster?: string | { dark: string; light: string }
  size?: string
  width?: number
  height?: number
  variantFiles?: Variant[]
}

const [source, ...ids] = process.argv.slice(2)
if (!source || ids.length === 0) {
  process.stderr.write('[Pyreon] usage: bun scripts/sync-site-assets.ts <path-to-09-site> <id> [id ...]\n')
  process.exit(1)
}
const assets = join(resolve(source), 'assets')
const docs = resolve(import.meta.dir, '..')
const outDir = join(docs, 'src/site/content/visuals')
const manifest = JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8')) as { assets: Asset[] }
const byFile = new Map(manifest.assets.map((a) => [a.file, a]))

const copied = new Set<string>()
function copy(file: string): string {
  const from = join(assets, file)
  if (!existsSync(from)) throw new Error(`[Pyreon] ${from} is listed in the manifest but does not exist.`)
  if (!copied.has(file)) {
    const to = join(docs, 'public/assets', file)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    copied.add(file)
  }
  return `/assets/${file}`
}

/** `<picture>` sources for one raster: AVIF and WebP srcsets plus a WebP fallback. */
function picture(a: Asset) {
  const v = a.variantFiles ?? []
  if (v.length === 0) throw new Error(`[Pyreon] ${a.file} has no width variants in the manifest.`)
  const set = (format: Variant['format']) =>
    v
      .filter((x) => x.format === format)
      .sort((x, y) => x.width - y.width)
      .map((x) => `${copy(x.file)} ${x.width}w`)
      .join(', ')
  const webp = v.filter((x) => x.format === 'webp').sort((x, y) => x.width - y.width)
  const fallback = webp[Math.min(1, webp.length - 1)] as Variant
  return { avif: set('avif'), webp: set('webp'), src: copy(fallback.file), width: a.width ?? fallback.width, height: a.height ?? fallback.height }
}

function svgOf(a: Asset): string {
  return readFileSync(join(assets, a.file), 'utf8').trim()
}

function pairOf(a: Asset) {
  const darkAsset = a.theme === 'light' && a.pair ? (byFile.get(a.pair) as Asset) : a
  const lightAsset = a.theme === 'light' ? a : (byFile.get(a.pair ?? '') as Asset | undefined)
  if (!lightAsset) throw new Error(`[Pyreon] ${a.file} has no light pair.`)
  return { alt: a.alt ?? '', width: darkAsset.width ?? 0, height: darkAsset.height ?? 0, dark: picture(darkAsset), light: picture(lightAsset) }
}

/** A poster PNG's WebP/AVIF siblings (`x.poster.png` → `x.poster.webp`, `x.poster-640.webp`). */
function posterOf(png: string) {
  const base = png.replace(/\.png$/, '')
  const files = [`${base}-640.avif`, `${base}.avif`, `${base}-640.webp`, `${base}.webp`].filter((f) => existsSync(join(assets, f)))
  const avif = files.filter((f) => f.endsWith('.avif'))
  const webp = files.filter((f) => f.endsWith('.webp'))
  return { avif: avif.map(copy), webp: webp.map(copy), src: copy(webp[webp.length - 1] ?? png) }
}

function loopOf(route: string) {
  const videos = manifest.assets.filter((a) => a.slot === 'three-targets' && a.kind === 'video' && a.pages?.includes(route))
  if (videos.length === 0) return undefined
  const pick = (size: string, theme: string, ext: string) => {
    const v = videos.find((x) => x.size === size && x.theme === theme && x.file.endsWith(ext))
    if (!v) throw new Error(`[Pyreon] no ${size} ${theme} ${ext} three-targets video.`)
    return v
  }
  const side = (theme: 'dark' | 'light') => {
    const large = pick('large', theme, '.webm')
    const small = pick('phone', theme, '.webm')
    return {
      large: { webm: copy(large.file), mp4: copy(pick('large', theme, '.mp4').file), poster: posterOf(String(large.poster)) },
      small: { webm: copy(small.file), mp4: copy(pick('phone', theme, '.mp4').file), poster: posterOf(String(small.poster)) },
    }
  }
  const first = videos[0] as Asset
  const large = pick('large', 'dark', '.webm')
  const small = pick('phone', 'dark', '.webm')
  return {
    kind: 'loop' as const,
    alt: first.alt ?? '',
    width: large.width ?? 0,
    height: large.height ?? 0,
    smallWidth: small.width ?? 0,
    smallHeight: small.height ?? 0,
    labels: ['Web · server-rendered HTML, hydrated', 'iOS · generated SwiftUI', 'Android · generated Compose, experimental'],
    dark: side('dark'),
    light: side('light'),
  }
}

mkdirSync(outDir, { recursive: true })
for (const id of ids) {
  const route = `/products/${id}`
  const onPage = manifest.assets.filter((a) => a.pages?.includes(route))
  const heroAsset = onPage.find((a) => a.slot === 'hero-visual' && (a.theme !== 'light' || !a.pair))
  const loop = loopOf(route)
  let hero: unknown
  if (loop) hero = loop
  else if (!heroAsset) throw new Error(`[Pyreon] ${id} has no hero visual in the manifest.`)
  else if (heroAsset.kind === 'animated-svg' || heroAsset.file.endsWith('.svg'))
    hero = { kind: 'svg', alt: heroAsset.alt ?? '', width: heroAsset.width ?? 640, height: heroAsset.height ?? 400, svg: svgOf(heroAsset) }
  else hero = { kind: 'pair', ...pairOf(heroAsset) }

  const svgs: Record<string, { alt: string; svg: string }> = {}
  for (const a of onPage) {
    if (a.file.endsWith('.svg') && a.slot !== 'hero-visual' && a.file.startsWith(`products/${id}/`)) {
      const key = a.file.slice(a.file.lastIndexOf('/') + 1, -'.svg'.length)
      svgs[key] = { alt: a.alt ?? '', svg: svgOf(a) }
    }
  }
  if (loop && heroAsset && heroAsset.file.endsWith('.svg')) svgs.hero = { alt: heroAsset.alt ?? '', svg: svgOf(heroAsset) }

  const stills: Record<string, unknown> = {}
  for (const a of onPage) {
    if (a.slot === 'platform-still' && a.theme === 'dark') {
      const key = a.file.slice(a.file.lastIndexOf('/') + 1).replace(/-dark\.png$/, '')
      stills[key] = pairOf(a)
    }
  }

  const og = onPage.find((a) => a.slot === 'og')
  const out = {
    id,
    og: og ? { src: copy(og.file), width: og.width ?? 1200, height: og.height ?? 630, alt: og.alt ?? '' } : null,
    hero,
    ...(Object.keys(svgs).length ? { svgs } : {}),
    ...(Object.keys(stills).length ? { stills } : {}),
  }
  writeFileSync(join(outDir, `${id}.json`), `${JSON.stringify(out, null, 1)}\n`)
  process.stdout.write(`  ${id}: ${(hero as { kind: string }).kind}${Object.keys(svgs).length ? ` + svgs ${Object.keys(svgs).join(',')}` : ''}${Object.keys(stills).length ? ` + stills ${Object.keys(stills).join(',')}` : ''}\n`)
}
process.stdout.write(`Copied ${copied.size} file(s) into public/assets.\n`)
