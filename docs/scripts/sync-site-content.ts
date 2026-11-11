/**
 * Copy the marketing-site content set into the app.
 *
 *   bun scripts/sync-site-content.ts <path-to-09-site> [id ...]
 *
 * Copies the schema files (`types.ts`, `types-site.ts`) and the site-level
 * files the app reads (`content/_index.json`, `content/_nav.json`), then every
 * product file the app already has (or the ids given). The content set is
 * written elsewhere and re-synced; nothing here edits it. App-side additions
 * live outside the copied files (`src/site/content/model.ts`,
 * `src/site/content/extra-sections.ts`), so a sync is a plain overwrite.
 *
 * The story, compare, migrate, benchmarks and project families
 * (`content/_why.json`, `_compare.json`, `_migrate.json`, `_project.json`,
 * `_benchmarks.json`) are split into ONE JSON FILE PER PAGE under
 * `src/site/content/pages/<family>/`, so a page's chunk carries that page
 * only. The split is mechanical: nothing is edited, and the fields shared by
 * a family go into `<family>/_meta.json`.
 *
 * Assets are synced separately: `scripts/sync-site-assets.ts`.
 *
 * Wiring a new product: run this with its id, add its demo to
 * `src/site/demos/registry.ts`. The route, the products index, the nav and
 * the build pick it up from the JSON.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [source, ...ids] = process.argv.slice(2)
if (!source) {
  console.error('[Pyreon] usage: bun scripts/sync-site-content.ts <path-to-09-site> [id ...]')
  process.exit(1)
}
const from = resolve(source)
const app = resolve(import.meta.dir, '../src/site/content')
const products = join(app, 'products')

const copy = (src: string, dest: string) => {
  if (!existsSync(src)) throw new Error(`[Pyreon] ${src} does not exist. Is ${from} the 09-site folder?`)
  copyFileSync(src, dest)
  process.stdout.write(`  ${src.replace(`${from}/`, '')} → ${dest.replace(`${resolve(import.meta.dir, '..')}/`, '')}\n`)
}

copy(join(from, 'types.ts'), join(app, 'types.ts'))
copy(join(from, 'types-site.ts'), join(app, 'types-site.ts'))
copy(join(from, 'content/_index.json'), join(products, '_index.json'))
copy(join(from, 'content/_nav.json'), join(app, '_nav.json'))
copy(join(from, 'content/_products.json'), join(app, '_products.json'))

// Site-level pages the app renders: the homepage, the 404 (`_project.json`
// → notFound) and the route list (sitemap test). Each JSON file also gets a
// `<name>.check.ts` twin: the same data as a TypeScript object literal that
// `satisfies` the app's type, so a field the schema does not know (or a
// missing one) fails `bun run typecheck` instead of the page. The twin is
// never imported at runtime; the page reads the JSON.
const CHECKED: readonly { file: string; type: string; from: string }[] = [
  { file: '_home.json', type: 'HomeData', from: './home' },
  { file: '_project.json', type: 'ProjectFile', from: './types-site' },
]
for (const { file, type, from: typeFrom } of CHECKED) {
  copy(join(from, `content/${file}`), join(app, file))
  const data = readFileSync(join(app, file), 'utf8')
  writeFileSync(
    join(app, file.replace(/\.json$/, '.check.ts')),
    `// Written by scripts/sync-site-content.ts from ${file}. Do not edit: re-run the sync.\n` +
      `// Typecheck only (never imported): fails when ${file} does not match ${type}.\n` +
      `import type { ${type} } from '${typeFrom}'\n\n` +
      `export const checked = ${data.trim()} satisfies ${type}\n`,
  )
}
copy(join(from, 'content/_sitemap.json'), join(app, '_sitemap.json'))

const wanted = ids.length > 0 ? ids : readdirSync(products).filter((f) => !f.startsWith('_') && f.endsWith('.json')).map((f) => f.slice(0, -5))
for (const id of wanted) copy(join(from, `content/${id}.json`), join(products, `${id}.json`))
process.stdout.write(`Synced ${wanted.length} product file(s) at ${new Date().toISOString()}.\n`)

// ─── Page families → one file per page ─────────────────────────────────────

const out = join(app, 'pages')
type Json = Record<string, unknown>
const read = (file: string): Json => {
  const path = join(from, 'content', file)
  if (!existsSync(path)) throw new Error(`[Pyreon] ${path} does not exist. Is ${from} the 09-site folder?`)
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
write('why/_meta.json', { order: (why.pages as Json[]).map((p) => ({ id: p.id, title: p.title })) })

const compare = read('_compare.json')
pagesById('compare', compare.pages as Json[])
write('compare/_meta.json', { record: compare.record, caveat: compare.caveat, order: compare.order })

const migrate = read('_migrate.json')
pagesById('migrate', migrate.layers as Json[])
write('migrate/_landing.json', migrate.landing)
write('migrate/_guides.json', migrate.guides)
write('migrate/_meta.json', { productHref: (migrate.landing as Json).productHref, order: (migrate.layers as Json[]).map((p) => ({ id: p.id, name: p.name, package: p.package })) })

const project = read('_project.json')
reset('project')
for (const id of ['status', 'releases', 'community', 'brand']) write(`project/${id}.json`, project[id])

write('benchmarks.json', read('_benchmarks.json'))
write('_sitemap.json', read('_sitemap.json'))

process.stdout.write(`Synced ${written} page file(s) under src/site/content/pages/.\n`)


// ─── The docs: sidebar, overview slots, the /docs home ────────────────────

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

