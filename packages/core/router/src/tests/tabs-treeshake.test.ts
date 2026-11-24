/**
 * Per-tab back stacks — TREE-SHAKE lock (LIB-level).
 *
 * The tab engine (stacks, history stamps, tab planning, the tab scope
 * component) is reached only through `routerTabs()`, the value an app passes
 * as `createRouter({ tabs })`. `createRouter` itself never imports it, so a
 * router without tabs, nearly every web app, does not carry it. This spec
 * bundles the BUILT lib (`lib/`; CI test cells run post-bootstrap, locally
 * run `bun scripts/bootstrap.ts` first): a `createRouter`-only entry must not
 * contain the history-stamp key `__pyreonTabStack`, and an entry that calls
 * `routerTabs` must (the positive control, so a renamed key cannot pass the
 * first check vacuously).
 *
 * BISECT: in `router.ts`, import `routerTabs` from `./tabs` and attach
 * `(opts.tabs ?? routerTabs([]))` instead of the optional `opts.tabs` →
 * rebuild the lib → the first test fails with the key present; restore +
 * rebuild → passes.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROUTER_LIB = resolve(HERE, '../../lib/index.js')

async function bundle(entry: string): Promise<string> {
  const result = await build({
    stdin: { contents: entry, resolveDir: resolve(HERE, '../..'), loader: 'ts' },
    bundle: true,
    minify: true,
    treeShaking: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })

  return result.outputFiles[0]!.text
}

const MARKER = '__pyreonTabStack'

describe('the tab engine stays out of bundles that do not use tabs', () => {
  it('lib/ is present (a skipped suite must never masquerade as coverage)', () => {
    expect(existsSync(ROUTER_LIB)).toBe(true)
  })

  it('a createRouter-only bundle (RouterView, RouterLink included) carries no tab engine', async () => {
    const code = await bundle(
      `import { createRouter, RouterLink, RouterProvider, RouterView } from ${JSON.stringify(ROUTER_LIB)}\nexport const r = [createRouter([]), RouterLink, RouterProvider, RouterView]`,
    )
    expect(code.includes(MARKER)).toBe(false)
  })

  it('positive control: routerTabs brings it in', async () => {
    const code = await bundle(
      `import { createRouter, routerTabs } from ${JSON.stringify(ROUTER_LIB)}\nexport const r = createRouter({ routes: [], tabs: routerTabs([{ name: 'a', root: '/a' }]) })`,
    )
    expect(code.includes(MARKER)).toBe(true)
  })
})
