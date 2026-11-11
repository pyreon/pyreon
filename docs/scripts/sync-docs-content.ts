/**
 * Copy the docs-facing content files into the app.
 *
 *   bun scripts/sync-docs-content.ts <path-to-09-site>
 *
 * `content/_docs.json` (the docs sidebar, badges and the per-product overview
 * slots) and `content/_docs-home.json` (the `/docs` home) are written in the
 * content set and re-synced here; nothing in the app edits them. Kept apart
 * from `sync-site-content.ts` so the marketing and docs slices each own one
 * script. Run both after the content set changes.
 *
 * It also copies the docs share images (`assets/og/docs.png`,
 * `assets/og/docs/*.png`) into `public/assets/og/` and writes
 * `src/site/content/_docs-og.json`: route → image path and alt text, read
 * from the asset manifest, so a docs page's `og:image` and its alt come from
 * the manifest without the manifest shipping to the browser.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const [source] = process.argv.slice(2)
if (!source) {
  console.error('[Pyreon] usage: bun scripts/sync-docs-content.ts <path-to-09-site>')
  process.exit(1)
}
const from = resolve(source)
const app = resolve(import.meta.dir, '../src/site/content')

for (const name of ['_docs.json', '_docs-home.json']) {
  const src = join(from, 'content', name)
  if (!existsSync(src)) throw new Error(`[Pyreon] ${src} does not exist. Is ${from} the 09-site folder?`)
  copyFileSync(src, join(app, name))
  process.stdout.write(`  content/${name} → src/site/content/${name}\n`)
}

// The two parts of _docs.json the app reads, as their own files: the bundler
// cannot split one JSON module between chunks, so the sidebar (on every docs
// page) and the overview slots (loaded on demand) must not share a file with
// each other or with the audit lists. `docs-content.test.ts` keeps them equal
// to _docs.json.
const docs = JSON.parse(readFileSync(join(app, '_docs.json'), 'utf8')) as {
  sidebar: unknown
  overviews: { productId: string; docsPage: string | null; docsHref: string; crossSell: string[] }[]
}
writeFileSync(join(app, '_docs-sidebar.json'), `${JSON.stringify(docs.sidebar)}\n`)
writeFileSync(join(app, '_docs-overviews.json'), `${JSON.stringify(docs.overviews)}\n`)
// What every page needs from the overviews, small: which pages are a product's
// overview, and each product's first cross-sell (the right rail's card).
const index = {
  overviewPages: Object.fromEntries(docs.overviews.filter((o) => o.docsPage !== null).map((o) => [o.docsHref, o.productId])),
  rail: Object.fromEntries(docs.overviews.filter((o) => o.crossSell[0]).map((o) => [o.productId, o.crossSell[0]])),
}
writeFileSync(join(app, '_docs-index.json'), `${JSON.stringify(index)}\n`)
process.stdout.write('  _docs.json → _docs-sidebar.json, _docs-overviews.json, _docs-index.json\n')

interface ManifestAsset { file: string; slot?: string; pages?: string[]; alt?: string }
const manifest = JSON.parse(readFileSync(join(from, 'assets/manifest.json'), 'utf8')) as { assets: ManifestAsset[] }
const publicDir = resolve(import.meta.dir, '../public/assets')
// `pages` is a route, or a description of the pages a group card stands in for:
// '/docs/** (pages in the sidebar group "Build" without their own card)'.
const og: { pages: Record<string, { image: string; alt: string }>; groups: Record<string, { image: string; alt: string }> } = { pages: {}, groups: {} }
for (const a of manifest.assets) {
  if (a.slot !== 'og' || !(a.file === 'og/docs.png' || a.file.startsWith('og/docs/'))) continue
  const dest = join(publicDir, a.file)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(join(from, 'assets', a.file), dest)
  const card = { image: `/assets/${a.file}`, alt: a.alt ?? '' }
  for (const page of a.pages ?? []) {
    const group = /sidebar group "([^"]+)"/.exec(page)?.[1]
    if (group) og.groups[group] = card
    else if (page.startsWith('/docs')) og.pages[page] = card
  }
}
const sortKeys = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)))
writeFileSync(join(app, '_docs-og.json'), `${JSON.stringify({ pages: sortKeys(og.pages), groups: sortKeys(og.groups) }, null, 2)}\n`)
process.stdout.write(`  ${Object.keys(og.pages).length} page and ${Object.keys(og.groups).length} group share images → public/assets/og/, src/site/content/_docs-og.json\n`)
