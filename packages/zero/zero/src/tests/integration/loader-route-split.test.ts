/**
 * A loader route that exports `loaderKey` keeps its own chunk. `loaderKey`
 * is read synchronously by the router, so it used to be emitted from a
 * static `import * as` of the route — which pulled the route module into
 * the entry chunk and printed INEFFECTIVE_DYNAMIC_IMPORT on every build.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import pyreon from '@pyreon/vite-plugin'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { zeroPlugin } from '../../vite-plugin'

const FIXTURE = resolve(import.meta.dirname, 'fixture-loader-split')
const DIST = join(FIXTURE, 'dist')
const warnings: string[] = []
let chunks: { file: string; code: string }[] = []

beforeAll(async () => {
  await rm(DIST, { recursive: true, force: true })
  await build({
    root: FIXTURE,
    configFile: false,
    plugins: [pyreon(), ...zeroPlugin({ mode: 'spa' })],
    resolve: { conditions: ['bun'] },
    build: { outDir: 'dist', emptyOutDir: true, minify: false },
    customLogger: {
      info() {},
      warn(msg: string) {
        warnings.push(msg)
      },
      warnOnce(msg: string) {
        warnings.push(msg)
      },
      error() {},
      clearScreen() {},
      hasErrorLogged: () => false,
      hasWarned: false,
    },
  })
  const assets = join(DIST, 'assets')
  chunks = readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((file) => ({ file, code: readFileSync(join(assets, file), 'utf-8') }))
}, 180_000)

afterAll(async () => {
  await rm(DIST, { recursive: true, force: true })
})

describe('loaderKey route code splitting (real build)', () => {
  it('the client output carries no absolute path of the checkout it was built in', () => {
    // The generated route module tagged every lazy route with
    // `hmrId: "<absolute path of the route file>"` in every build. The id is
    // read by the dev HMR coordinator and by the server's modulepreload
    // lookup, never by a production client — where it was a plain string, so
    // it shipped: the build machine's directory layout in public JS, and a
    // bundle whose bytes depend on where the repository is checked out.
    const roots = [...new Set([FIXTURE, realpathSync(FIXTURE)])]
    const files = [
      ...chunks,
      { file: 'index.html', code: readFileSync(join(DIST, 'index.html'), 'utf-8') },
    ]
    // Vacuous-pass guard: the scan saw the route chunks, not an empty build.
    expect(chunks.length).toBeGreaterThan(1)
    expect(files.filter((f) => roots.some((root) => f.code.includes(root))).map((f) => f.file)).toEqual([])
  })

  it('the route module lives in its own chunk, not the entry', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf-8')
    const entryFile = /assets\/([^"]+\.js)/.exec(html)?.[1]
    expect(entryFile).toBeTruthy()
    const holders = chunks.filter((c) => c.code.includes('POSTS_ROUTE_MODULE_MARKER'))
    expect(holders.map((c) => c.file)).toHaveLength(1)
    expect(holders[0]!.file).not.toBe(entryFile)
  })

  it('no INEFFECTIVE_DYNAMIC_IMPORT warning', () => {
    expect(warnings.join('\n')).not.toContain('INEFFECTIVE_DYNAMIC_IMPORT')
  })
})
