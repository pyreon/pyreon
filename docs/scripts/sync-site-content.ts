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
 * Wiring a new product: run this with its id, add its demo to
 * `src/site/demos/registry.ts`. The route, the products index, the nav and
 * the build pick it up from the JSON.
 */
import { copyFileSync, existsSync, readdirSync } from 'node:fs'
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

const wanted = ids.length > 0 ? ids : readdirSync(products).filter((f) => !f.startsWith('_') && f.endsWith('.json')).map((f) => f.slice(0, -5))
for (const id of wanted) copy(join(from, `content/${id}.json`), join(products, `${id}.json`))
process.stdout.write(`Synced ${wanted.length} product file(s) at ${new Date().toISOString()}.\n`)
