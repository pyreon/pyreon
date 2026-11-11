/**
 * Copy the story, compare, migrate, benchmarks and project content into the app.
 *
 *   bun scripts/sync-site-pages.ts <path-to-09-site>
 *
 * The content set keeps each page family in one file (`content/_why.json`,
 * `_compare.json`, `_migrate.json`, `_project.json`, `_benchmarks.json`).
 * The app splits every family into ONE JSON FILE PER PAGE under
 * `src/site/content/pages/<family>/`, so a page's lazy chunk (and the loader
 * data serialized into its HTML) carries that page only. The split is
 * mechanical: nothing is edited, and the fields shared by a family go into
 * `<family>/_meta.json`. `_sitemap.json` is copied whole (the build test reads
 * it). A sync is a plain overwrite; app-side additions live in `.ts` files
 * next to the JSON, never in it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [source] = process.argv.slice(2)
if (!source) {
  console.error('[Pyreon] usage: bun scripts/sync-site-pages.ts <path-to-09-site>')
  process.exit(1)
}
const from = resolve(source, 'content')
const out = resolve(import.meta.dir, '../src/site/content/pages')

type Json = Record<string, unknown>
const read = (file: string): Json => {
  const path = join(from, file)
  if (!existsSync(path)) throw new Error(`[Pyreon] ${path} does not exist. Is ${source} the 09-site folder?`)
  return JSON.parse(readFileSync(path, 'utf8')) as Json
}

let written = 0
const write = (rel: string, data: unknown) => {
  const path = join(out, rel)
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
  written++
}

/** Start a family folder empty, so a page dropped from the content set disappears from the app. */
const reset = (family: string) => {
  const dir = join(out, family)
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.json')) rmSync(join(dir, f))
}

const pagesById = (family: string, pages: Json[]) => {
  reset(family)
  for (const page of pages) write(`${family}/${String(page.id)}.json`, page)
}

const why = read('_why.json')
pagesById('why', why.pages as Json[])

const compare = read('_compare.json')
pagesById('compare', compare.pages as Json[])
write('compare/_meta.json', { record: compare.record, caveat: compare.caveat, order: compare.order })

const migrate = read('_migrate.json')
pagesById('migrate', migrate.layers as Json[])
write('migrate/_landing.json', migrate.landing)
write('migrate/_guides.json', migrate.guides)

const project = read('_project.json')
reset('project')
for (const id of ['status', 'releases', 'community', 'brand']) write(`project/${id}.json`, project[id])

write('benchmarks.json', read('_benchmarks.json'))
write('_sitemap.json', read('_sitemap.json'))

process.stdout.write(`Synced ${written} page file(s) from ${from} at ${new Date().toISOString()}.\n`)

// ─── Assets these pages use (09-site/assets, see its README) ───────────────
//
//   - Diagram and chart SVGs are INLINED (so the site's theme toggle reaches
//     their CSS variables): copied to src/site/assets/<group>/ and imported
//     with `?raw`, one lazy chunk per file.
//   - Share images and the brand downloads are plain files: copied to
//     public/assets/og/… and public/brand/… under their manifest paths.
//   - The manifest entries for every copied file go to
//     src/site/assets/pages-manifest.json (alt text, size, theme pair,
//     WebP/AVIF variants), which `site/pages/assets.ts` reads.
const assets = resolve(source, 'assets')
const docs = resolve(import.meta.dir, '..')
interface ManifestAsset {
  file: string
  kind: string
  pages?: string[]
  slot?: string
  alt?: string
  theme?: string
  pair?: string
  width?: number
  height?: number
  variantFiles?: { file: string; width: number; height: number; format: string }[]
}
const manifest = JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8')) as { assets: ManifestAsset[] }

const INLINE = /^(why|compare|migrate|benchmarks)\/[a-z0-9-]+\.svg$/
const OG = /^og\/(benchmarks|status|releases|community|brand|migrate|why\/[a-z-]+|compare\/[a-z-]+|migrate\/[a-z-]+)\.png$/
const BRAND = /^brand\/(logo-pack\.zip|(clear-space|type-specimen|swatches)-(dark|light)\.png)$/

const inline = join(docs, 'src/site/assets')
for (const group of ['why', 'compare', 'migrate', 'benchmarks']) rmSync(join(inline, group), { recursive: true, force: true })

const used: ManifestAsset[] = []
const copyAsset = (file: string, dest: string) => {
  mkdirSync(resolve(dest, '..'), { recursive: true })
  writeFileSync(dest, readFileSync(join(assets, file)))
}
for (const a of manifest.assets) {
  if (INLINE.test(a.file)) copyAsset(a.file, join(inline, a.file))
  else if (OG.test(a.file)) copyAsset(a.file, join(docs, 'public/assets', a.file))
  else if (BRAND.test(a.file)) {
    copyAsset(a.file, join(docs, 'public', a.file))
    for (const v of a.variantFiles ?? []) copyAsset(v.file, join(docs, 'public', v.file))
  } else continue
  const { file, kind, pages, slot, alt, theme, pair, width, height, variantFiles } = a
  used.push({ file, kind, pages, slot, alt, theme, pair, width, height, variantFiles })
}
writeFileSync(join(inline, 'pages-manifest.json'), `${JSON.stringify({ assets: used }, null, 2)}\n`)
// Share images by route, small enough for every page's head to import.
const og: Record<string, { file: string; alt: string }> = {}
for (const a of used) if (a.slot === 'og') for (const route of a.pages ?? []) og[route] = { file: a.file, alt: a.alt ?? '' }
writeFileSync(join(inline, 'og.json'), `${JSON.stringify(og, null, 2)}\n`)
process.stdout.write(`Copied ${used.length} asset(s) and wrote src/site/assets/pages-manifest.json.\n`)
