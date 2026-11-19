/**
 * Print the template-bail census: how many DOM elements the client compile
 * still leaves to runtime `jsx()` calls, bucketed by why (see
 * `src/tests/_template-bail-census.ts`). Compiles exactly as `@pyreon/vite-plugin`
 * does (`templatizeComponentChildren` on), through the native backend when it
 * is built.
 *
 *   bun packages/core/compiler/scripts/template-bail-census.ts            # examples/ + packages/
 *   bun packages/core/compiler/scripts/template-bail-census.ts examples   # one root
 *
 * The example-corpus number is locked by `template-hole-walk.test.ts`.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { transformJSX } from '../src/jsx'
import { collectTsx, templateBailCensus } from '../src/tests/_template-bail-census'

const REPO = join(import.meta.dir, '..', '..', '..', '..')
const roots = process.argv.slice(2)
const targets = roots.length > 0 ? roots : ['examples', 'packages']

const transform = (code: string, file: string) =>
  transformJSX(code, file, { templatizeComponentChildren: true }).code

for (const root of targets) {
  // Library packages: their `src/` trees only (tests, fixtures and build output are skipped).
  const files =
    root === 'packages'
      ? readdirSync(join(REPO, 'packages')).flatMap((group) => {
          let pkgs: string[]
          try {
            pkgs = readdirSync(join(REPO, 'packages', group))
          } catch {
            return []
          }

          return pkgs.flatMap((pkg) => collectTsx(join(REPO, 'packages', group, pkg, 'src')))
        })
      : collectTsx(join(REPO, root))
  const r = templateBailCensus(files, transform)
  console.log(`\n${root}: ${r.total} DOM elements left to jsx() in ${r.compiled}/${r.files} files`)
  for (const [bucket, n] of Object.entries(r.buckets).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bucket.padEnd(20)} ${n}`)
  }
}
