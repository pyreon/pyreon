/**
 * DefaultChromeLayout nativeCompat marker — TREE-SHAKE lock (LIB-level).
 *
 * `components.tsx` registers the synthesized default-chrome layout with
 * `match.ts` via `_setDefaultChromeLayout(...)` at module load, so a
 * layout-less `notFoundComponent` page resolves through a
 * `<main data-pyreon-default-chrome>` wrapper. That wrapper is
 * `nativeCompat`-marked so the compat-mode jsx() runtimes route it through
 * `h()` directly.
 *
 * The trap this locks (found in the 0.48.0 pre-release audit): the marker is
 * applied by the PURE-form `const _X = /* @__PURE__ * / nativeCompat(X)`.
 * If the SIDE-EFFECTING registration call passes the BARE `X` instead of the
 * PURE-call RESULT `_X`, then in a real consumer bundle that imports
 * `RouterProvider` (triggering the setter) but never imports the
 * `DefaultChromeLayout` EXPORT, the `@__PURE__` call is dropped as unused —
 * so the mutation `X[MARKER] = true` never runs and an UNMARKED layout is
 * registered. Invisible in the src unit path (bun condition, no
 * tree-shaking): there the PURE call always runs and `_X === X` (nativeCompat
 * mutates + returns its arg), so `match.test.ts`'s `toBe(DefaultChromeLayout)`
 * passes either way. Only a minified, tree-shaken BUNDLE of the built lib
 * surfaces it — hence this spec.
 *
 * It bundles the BUILT lib (`lib/` — CI test cells run post-bootstrap; run
 * `bun scripts/bootstrap.ts` locally first) with a `RouterProvider`-only
 * entry, evaluates it, resolves a layout-less notFound page, and asserts the
 * REGISTERED chrome layout carries the marker. `isNativeCompat` reads the
 * GLOBAL `Symbol.for('pyreon:native-compat')`, so cross-instance/cross-copy
 * reads agree.
 *
 * BISECT (requires a lib rebuild per the dev-server-bisect recipe): change
 * `_setDefaultChromeLayout(_DefaultChromeLayout)` back to the bare
 * `_setDefaultChromeLayout(DefaultChromeLayout)` in components.tsx →
 * `bun run --filter='@pyreon/router' build` → this spec fails with
 * `marked=false`; restore + rebuild → passes. Verified 2026-07-17.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROUTER_LIB = resolve(HERE, '../../lib/index.js')

// A `RouterProvider`-only entry: imports the component barrel (so the
// `_setDefaultChromeLayout` setter runs) + `resolveRoute` to observe the
// registered layout — but NEVER the `DefaultChromeLayout` export, which is
// exactly the shape that lets the PURE call be dropped.
const ENTRY = `
import { RouterProvider, resolveRoute } from ${JSON.stringify(ROUTER_LIB)}
import { isNativeCompat } from '@pyreon/core'
void RouterProvider
const PageOnly = () => null
const NotFound = () => null
const r = resolveRoute('/unknown', [
  { path: '/', component: PageOnly, notFoundComponent: NotFound },
])
export const RESULT = {
  len: r.matched.length,
  isNotFound: r.isNotFound === true,
  marked: isNativeCompat(r.matched[0]?.component),
}
`

async function bundleAndEval(): Promise<{ len: number; isNotFound: boolean; marked: boolean }> {
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: resolve(HERE, '../..'), loader: 'ts' },
    bundle: true,
    minify: true,
    treeShaking: true,
    write: false,
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const code = result.outputFiles[0]!.text
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  const mod = (await import(/* @vite-ignore */ url)) as {
    RESULT: { len: number; isNotFound: boolean; marked: boolean }
  }
  return mod.RESULT
}

describe('DefaultChromeLayout marker survives tree-shaking (PURE-form registration)', () => {
  it('lib/ is present (a skipped suite must never masquerade as coverage)', () => {
    expect(existsSync(ROUTER_LIB)).toBe(true)
  })

  it('registered chrome layout is nativeCompat-marked in a minified RouterProvider-only bundle', async () => {
    const r = await bundleAndEval()
    // Sanity: the layout-less notFound fallback actually fired.
    expect(r.isNotFound).toBe(true)
    expect(r.len).toBe(2)
    // The load-bearing assertion — false with the bare-fn registration.
    expect(r.marked).toBe(true)
  })
})
