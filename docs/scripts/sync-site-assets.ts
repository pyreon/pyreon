/**
 * Copy the marketing site's visual assets into the app.
 *
 *   bun scripts/sync-site-assets.ts <path-to-09-site> [route | product-id ...] [--all] [--prune]
 *
 * Source: `09-site/assets/` and its `manifest.json` (every asset with the
 * pages that use it, alt text, theme, posters and width variants).
 *
 * What is copied — only what the app's pages reference, not the whole set:
 *
 *   - The routes are the app's own: the static routes under
 *     `src/routes/(site)/`, one `/products/<id>` per product content file, the
 *     404, plus any route given on the command line (`/why/components-run-once`,
 *     or a prefix like `/why/*`). `--all` takes every route in the manifest.
 *     Site-wide assets (`pages: ["/*"]`: favicons, app icons) always come.
 *   - Raster images ship as their AVIF/WebP width variants. The PNG master is
 *     skipped when variants exist (a `<picture>` never asks for it), except
 *     for share images (`og/`, which crawlers need as PNG) and video posters.
 *   - Animated and theme-aware SVGs go to `src/site/media/` so a component can
 *     inline them (`import art from '../media/home/hero-trace.svg?raw'`: the
 *     site's theme toggle then reaches their CSS variables) or reference a
 *     hashed URL (`?url`). Everything else goes to `public/media/`, served at
 *     `/media/<path>`; brand icons go to `public/brand/` (the webmanifest
 *     names them there), and `site.webmanifest` to `public/`.
 *
 * Why not everything: the full set is 76 MB (55 MB without review sheets and
 * sources), most of it product captures and share images for pages a given
 * build may not have yet. Each slice re-runs this for the routes it adds, so
 * the repository grows with the pages that use the files. `--prune` removes
 * synced files no current route references.
 *
 * It also writes `src/site/content/_assets.json` (the manifest records of the
 * copied assets, read by the kit's `assets.ts`), `_share-default.json`, and
 * `content/visuals/<id>.json` for each product page in the routes (the
 * products slice's shape: hero visual, share image, SVGs, stills).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

interface Variant {
  file: string
  width: number
  height: number
  bytes: number
  format: string
}
interface AssetRecord {
  file: string
  kind: string
  pages: string[]
  slot: string
  alt: string
  theme: string
  pair?: string
  poster?: string | { dark: string; light: string }
  posterVariants?: { dark: Variant[]; light: Variant[] } | Variant[]
  variantFiles?: Variant[]
  width?: number
  height?: number
  motion?: unknown
  caption?: unknown
  note?: string
  template?: string
  format?: string
  size?: string
}

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const source = positional[0]
if (!source) {
  console.error('[Pyreon] usage: bun scripts/sync-site-assets.ts <path-to-09-site> [route ...] [--all] [--prune]')
  process.exit(1)
}
const all = args.includes('--all')
const prune = args.includes('--prune')
// A bare word is a product id (the products slice's usage): `/products/<id>`.
const extraRoutes = positional.slice(1).map((a) => (a.startsWith('/') ? a : `/products/${a}`))

const from = join(resolve(source), 'assets')
const app = resolve(import.meta.dir, '..')
const manifestPath = join(from, 'manifest.json')
if (!existsSync(manifestPath)) throw new Error(`[Pyreon] ${manifestPath} does not exist. Is ${source} the 09-site folder?`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { assets: AssetRecord[] }

// ─── The app's routes ──────────────────────────────────────────────────────

function appRoutes(): string[] {
  const routes = new Set<string>(['/', '/404'])
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        // `(group)` folders add nothing to the URL.
        walk(full, /^\(.*\)$/.test(name) ? prefix : `${prefix}/${name}`)
      } else if (/\.tsx?$/.test(name) && !name.startsWith('_') && !name.includes('[')) {
        const base = name.replace(/\.tsx?$/, '')
        routes.add(base === 'index' ? prefix || '/' : `${prefix}/${base}`)
      }
    }
  }
  walk(join(app, 'src/routes/(site)'), '')
  const products = join(app, 'src/site/content/products')
  for (const f of readdirSync(products)) if (f.endsWith('.json') && !f.startsWith('_')) routes.add(`/products/${f.slice(0, -5)}`)
  for (const r of extraRoutes) routes.add(r)
  return [...routes]
}

/** A manifest page pattern (`/`, `/products/form`, `/docs/*`, `/*`) against a route or route prefix. */
function pageMatches(page: string, route: string): boolean {
  if (page === '/*' || page === '*') return true
  const prefix = (p: string) => (p.endsWith('/*') ? p.slice(0, -1) : null)
  const pp = prefix(page)
  const rp = prefix(route)
  if (pp !== null && rp !== null) return pp.startsWith(rp) || rp.startsWith(pp)
  if (pp !== null) return route.startsWith(pp)
  if (rp !== null) return page.startsWith(rp)
  return page === route
}

const routes = all ? ['/*'] : appRoutes()
const wanted = manifest.assets.filter((a) => a.pages.some((p) => routes.some((r) => pageMatches(p, r))))

// ─── Where each file goes ──────────────────────────────────────────────────

const PUBLIC = join(app, 'public')
const SRC_MEDIA = join(app, 'src/site/media')

/** Inlinable SVGs (theme-aware or animated) live in src; the rest is public. */
function destination(file: string): string {
  if (!file.includes('/')) return join(PUBLIC, file)
  if (file.startsWith('brand/') && !file.includes('/', 'brand/'.length)) return join(PUBLIC, file)
  if (file.endsWith('.svg')) return join(SRC_MEDIA, file)
  return join(PUBLIC, 'media', file)
}

const files = new Set<string>()
const posterFiles = (a: AssetRecord): string[] => {
  const p = a.poster
  if (p === undefined) return []
  return typeof p === 'string' ? [p] : [p.dark, p.light]
}
const posterVariantFiles = (a: AssetRecord): string[] => {
  const pv = a.posterVariants
  if (pv === undefined) return []
  return (Array.isArray(pv) ? pv : [...pv.dark, ...pv.light]).map((v) => v.file)
}

for (const a of wanted) {
  const isShare = a.slot === 'og' || a.file.startsWith('og/')
  const isRasterWithVariants = a.kind !== 'poster' && (a.variantFiles?.length ?? 0) > 0 && !a.file.endsWith('.svg')
  if (isShare || !isRasterWithVariants) files.add(a.file)
  for (const v of a.variantFiles ?? []) files.add(v.file)
  // Animated SVG / chart posters: the variants serve <picture>; the PNG
  // master stays out unless there are none. Video posters keep the PNG.
  const variants = posterVariantFiles(a)
  if (a.kind === 'video' || variants.length === 0) for (const f of posterFiles(a)) files.add(f)
  for (const f of variants) files.add(f)
}

let bytes = 0
const written = new Set<string>()
for (const file of [...files].sort()) {
  const src = join(from, file)
  if (!existsSync(src)) throw new Error(`[Pyreon] manifest names ${file}, which is not in ${from}.`)
  const dest = destination(file)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  written.add(dest)
  bytes += statSync(src).size
}
if (!files.has('site.webmanifest')) copyFileSync(join(from, 'site.webmanifest'), join(PUBLIC, 'site.webmanifest'))

// ─── The trimmed manifest the kit reads ────────────────────────────────────

const KEEP = ['file', 'kind', 'pages', 'slot', 'alt', 'theme', 'pair', 'poster', 'posterVariants', 'variantFiles', 'width', 'height', 'motion', 'caption', 'size'] as const
const records = wanted.map((a) => {
  const out: Record<string, unknown> = {}
  for (const k of KEEP) if (a[k] !== undefined) out[k] = a[k]
  return out
})
writeFileSync(
  join(app, 'src/site/content/_assets.json'),
  `${JSON.stringify({ note: 'Written by docs/scripts/sync-site-assets.ts from 09-site/assets/manifest.json. Do not edit.', assets: records }, null, 1)}\n`,
)

// The site-wide default share image, on its own: the root layout (which every
// page, docs included, loads in the browser) needs only this record.
const fallbackShare = wanted.find((a) => a.slot === 'og' && (a.pages.includes('*') || a.pages.includes('/*')))
if (fallbackShare === undefined) throw new Error('[Pyreon] The manifest has no site-wide share image (og/default.png).')
writeFileSync(
  join(app, 'src/site/content/_share-default.json'),
  `${JSON.stringify({ file: fallbackShare.file, width: fallbackShare.width, height: fallbackShare.height, alt: fallbackShare.alt }, null, 1)}\n`,
)

// ─── Product visuals (`content/visuals/<id>.json`) ─────────────────────────
//
// Per product page: the hero visual (an inline animated SVG, a dark/light
// capture pair, or the three-targets loop), the share image, further SVGs
// and platform stills, with the manifest's alt text, sizes and variants.
// Same shape as the products slice's first version of this script (read by
// `src/site/content/visuals.ts`), so pages built on it keep working; the
// URLs point at `/media/`, where this script puts the files. (Not
// `/assets/`: that is Vite's hashed output directory, which hosts cache as
// immutable, so a re-synced image under it would stay stale.)

const byFile = new Map(manifest.assets.map((a) => [a.file, a]))
const urlOf = (file: string): string => {
  const dest = destination(file)
  if (!existsSync(dest)) {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(from, file), dest)
    written.add(dest)
  }
  return dest.startsWith(PUBLIC) ? dest.slice(PUBLIC.length) : file
}
function pictureSource(a: AssetRecord) {
  const v = a.variantFiles ?? []
  if (v.length === 0) throw new Error(`[Pyreon] ${a.file} has no width variants in the manifest.`)
  const set = (format: string) =>
    v.filter((x) => x.format === format).sort((x, y) => x.width - y.width).map((x) => `${urlOf(x.file)} ${x.width}w`).join(', ')
  const webp = v.filter((x) => x.format === 'webp').sort((x, y) => x.width - y.width)
  const fallback = webp[Math.min(1, webp.length - 1)] as Variant
  return { avif: set('avif'), webp: set('webp'), src: urlOf(fallback.file), width: a.width ?? fallback.width, height: a.height ?? fallback.height }
}
const svgOf = (a: AssetRecord): string => readFileSync(join(from, a.file), 'utf8').trim()
function themedPair(a: AssetRecord) {
  const dark = a.theme === 'light' && a.pair ? (byFile.get(a.pair) as AssetRecord) : a
  const light = a.theme === 'light' ? a : byFile.get(a.pair ?? '')
  if (!light) throw new Error(`[Pyreon] ${a.file} has no light pair.`)
  return { alt: a.alt, width: dark.width ?? 0, height: dark.height ?? 0, dark: pictureSource(dark), light: pictureSource(light) }
}
function posterSet(png: string) {
  const base = png.replace(/\.png$/, '')
  const found = [`${base}-640.avif`, `${base}.avif`, `${base}-640.webp`, `${base}.webp`].filter((f) => existsSync(join(from, f)))
  const webp = found.filter((f) => f.endsWith('.webp'))
  return { avif: found.filter((f) => f.endsWith('.avif')).map(urlOf), webp: webp.map(urlOf), src: urlOf(webp[webp.length - 1] ?? png) }
}
function loopFor(route: string) {
  const videos = manifest.assets.filter((a) => a.slot === 'three-targets' && a.kind === 'video' && a.pages.includes(route))
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
      large: { webm: urlOf(large.file), mp4: urlOf(pick('large', theme, '.mp4').file), poster: posterSet(String(large.poster)) },
      small: { webm: urlOf(small.file), mp4: urlOf(pick('phone', theme, '.mp4').file), poster: posterSet(String(small.poster)) },
    }
  }
  const large = pick('large', 'dark', '.webm')
  const small = pick('phone', 'dark', '.webm')
  return {
    kind: 'loop' as const,
    alt: (videos[0] as AssetRecord).alt,
    width: large.width ?? 0,
    height: large.height ?? 0,
    smallWidth: small.width ?? 0,
    smallHeight: small.height ?? 0,
    labels: ['Web · server-rendered HTML, hydrated', 'iOS · generated SwiftUI', 'Android · generated Compose, experimental'],
    dark: side('dark'),
    light: side('light'),
  }
}

const visualsDir = join(app, 'src/site/content/visuals')
const productIds = routes.flatMap((r) => (/^\/products\/[a-z0-9-]+$/.test(r) ? [r.slice('/products/'.length)] : []))
let visualCount = 0
for (const id of productIds) {
  const route = `/products/${id}`
  const onPage = manifest.assets.filter((a) => a.pages.includes(route))
  const heroAsset = onPage.find((a) => a.slot === 'hero-visual' && (a.theme !== 'light' || !a.pair))
  const loop = loopFor(route)
  if (!loop && !heroAsset) continue
  const hero = loop
    ? loop
    : heroAsset!.kind === 'animated-svg' || heroAsset!.file.endsWith('.svg')
      ? { kind: 'svg', alt: heroAsset!.alt, width: heroAsset!.width ?? 640, height: heroAsset!.height ?? 400, svg: svgOf(heroAsset!) }
      : { kind: 'pair', ...themedPair(heroAsset!) }
  const svgs: Record<string, { alt: string; svg: string }> = {}
  for (const a of onPage) {
    if (a.file.endsWith('.svg') && a.slot !== 'hero-visual' && a.file.startsWith(`products/${id}/`)) {
      svgs[a.file.slice(a.file.lastIndexOf('/') + 1, -'.svg'.length)] = { alt: a.alt, svg: svgOf(a) }
    }
  }
  if (loop && heroAsset && heroAsset.file.endsWith('.svg')) svgs.hero = { alt: heroAsset.alt, svg: svgOf(heroAsset) }
  const stills: Record<string, unknown> = {}
  for (const a of onPage) {
    if (a.slot === 'platform-still' && a.theme === 'dark') stills[a.file.slice(a.file.lastIndexOf('/') + 1).replace(/-dark\.png$/, '')] = themedPair(a)
  }
  const og = onPage.find((a) => a.slot === 'og')
  const out = {
    id,
    og: og ? { src: urlOf(og.file), width: og.width ?? 1200, height: og.height ?? 630, alt: og.alt } : null,
    hero,
    ...(Object.keys(svgs).length ? { svgs } : {}),
    ...(Object.keys(stills).length ? { stills } : {}),
  }
  mkdirSync(visualsDir, { recursive: true })
  writeFileSync(join(visualsDir, `${id}.json`), `${JSON.stringify(out, null, 1)}\n`)
  visualCount++
}

// ─── Prune ─────────────────────────────────────────────────────────────────

let pruned = 0
if (prune) {
  const sweep = (dir: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) sweep(full)
      else if (!written.has(full)) {
        rmSync(full)
        pruned++
      }
    }
  }
  sweep(join(PUBLIC, 'media'))
  sweep(SRC_MEDIA)
}

process.stdout.write(
  `Synced ${written.size} file(s), ${(bytes / 1e6).toFixed(2)} MB, for ${all ? 'every route' : `${routes.length} route(s)`}` +
    `${prune ? `; pruned ${pruned}` : ''}; ${visualCount} product visuals file(s). Manifest: ${relative(app, join(app, 'src/site/content/_assets.json'))}.\n`,
)
