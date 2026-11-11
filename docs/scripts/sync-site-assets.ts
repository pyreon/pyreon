/**
 * Copy the marketing site's visual assets into the app.
 *
 *   bun scripts/sync-site-assets.ts <path-to-09-site> [route ...] [--all] [--prune]
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
 * It also writes `src/site/content/_assets.json`: the manifest records of the
 * copied assets (the kit's `assets.ts` reads it at build time).
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
const extraRoutes = positional.slice(1)

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
    `${prune ? `; pruned ${pruned}` : ''}. Manifest: ${relative(app, join(app, 'src/site/content/_assets.json'))}.\n`,
)
