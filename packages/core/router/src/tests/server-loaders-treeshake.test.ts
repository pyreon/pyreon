/**
 * Server-only loader passes — TREE-SHAKE lock (LIB-level).
 *
 * `preloadRoute` (the SSR loader pass) and `runServerLoaders` (the single-fetch
 * data endpoint's worker) run only on the server. As METHODS of the router
 * object they shipped in every client bundle, because a method on an object
 * literal is retained whether or not anything calls it. As free functions they
 * are dropped from a bundle that never imports them. This spec bundles the
 * BUILT lib (`lib/`; CI test cells run post-bootstrap, locally run
 * `bun scripts/bootstrap.ts` first) twice: a `createRouter`-only entry (the
 * client's shape) must not contain `runServerLoaders`' `{ kind: "notFound" }`
 * result, and the entry that imports both functions must (the positive
 * control, so a renamed marker cannot pass the first check vacuously).
 *
 * BISECT: move `runServerLoaders` back onto the router object in `router.ts`
 * (as the `runServerLoaders(path, request)` method) → rebuild the lib → the
 * first test fails with the marker present; restore + rebuild → passes.
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

const MARKER = '"notFound"'

describe('server-only loader passes stay out of client bundles', () => {
  it('lib/ is present (a skipped suite must never masquerade as coverage)', () => {
    expect(existsSync(ROUTER_LIB)).toBe(true)
  })

  it('a createRouter-only bundle carries neither preloadRoute nor runServerLoaders', async () => {
    const code = await bundle(
      `import { createRouter } from ${JSON.stringify(ROUTER_LIB)}\nexport const r = createRouter([])`,
    )
    expect(code.includes(MARKER)).toBe(false)
  })

  it('positive control: importing them brings their code in', async () => {
    const code = await bundle(
      `import { createRouter, preloadRoute, runServerLoaders } from ${JSON.stringify(ROUTER_LIB)}\nexport const r = [createRouter([]), preloadRoute, runServerLoaders]`,
    )
    expect(code.includes(MARKER)).toBe(true)
  })
})
