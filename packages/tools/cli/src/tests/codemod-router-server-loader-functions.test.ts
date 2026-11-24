/**
 * `router-server-loader-functions`: `router.preload` / `router.runServerLoaders`
 * became free functions (`preloadRoute`, `runServerLoaders`) or the
 * components-only `router.preloadComponents`, so client bundles stop carrying
 * the server-only loader passes.
 *
 * Bisect-verified: with the call edits removed from the transform, every
 * rewrite spec returns `null`.
 */
import { describe, expect, it } from 'vitest'
import { CODEMODS, selectCodemods } from '../codemods'
import { routerServerLoaderFunctions } from '../codemods/router-server-loader-functions'

const run = (src: string, path = 'a.ts') => routerServerLoaderFunctions.transform(src, path)
const imp = `import { createRouter } from '@pyreon/router'\n`

describe('router-server-loader-functions', () => {
  it('rewrites a loader-running preload to preloadRoute and extends the router import', () => {
    const src = `${imp}const router = createRouter({ routes, url })\nawait router.preload(url, req)\nawait router.preload(url)\n`
    expect(run(src)).toBe(
      `import { createRouter, preloadRoute } from '@pyreon/router'\nconst router = createRouter({ routes, url })\nawait preloadRoute(router, url, req)\nawait preloadRoute(router, url)\n`,
    )
  })

  it('rewrites a skipLoaders preload to preloadComponents (code only)', () => {
    const src = `${imp}void router.preload(href, undefined, { skipLoaders: true })\n`
    expect(run(src)).toBe(`${imp}void router.preloadComponents(href)\n`)
  })

  it('treats skipLoaders: false as the loader-running form and drops an undefined request', () => {
    const src = `${imp}await app.router.preload('/x', undefined, { skipLoaders: false })\n`
    expect(run(src)).toBe(
      `import { createRouter, preloadRoute } from '@pyreon/router'\nawait preloadRoute(app.router, '/x')\n`,
    )
  })

  it('rewrites runServerLoaders and adds an import when the file has none from @pyreon/router', () => {
    const src = `import { createApp } from '@pyreon/zero'\nconst r = await router.runServerLoaders(path, ctx.req)\n`
    expect(run(src)).toBe(
      `import { createApp } from '@pyreon/zero'\nimport { runServerLoaders } from '@pyreon/router'\nconst r = await runServerLoaders(router, path, ctx.req)\n`,
    )
  })

  it('does not duplicate an import that is already there', () => {
    const src = `import { createRouter, preloadRoute } from '@pyreon/router'\nawait router.preload(p)\n`
    expect(run(src)).toBe(`import { createRouter, preloadRoute } from '@pyreon/router'\nawait preloadRoute(router, p)\n`)
  })

  it('leaves non-router receivers, ambiguous options, files without Pyreon imports and migrated code alone', () => {
    // A lazy component's own preload().
    expect(run(`${imp}Comp.preload()\nchunk.preload(x)\n`)).toBeNull()
    // A non-literal options argument cannot be decided.
    expect(run(`${imp}router.preload(p, req, opts)\n`)).toBeNull()
    // No Pyreon import at all.
    expect(run(`router.preload(p, req)\n`)).toBeNull()
    // Already migrated.
    expect(run(`import { preloadRoute } from '@pyreon/router'\nawait preloadRoute(router, p, req)\nrouter.preloadComponents(p)\n`)).toBeNull()
  })

  it('is idempotent', () => {
    const once = run(`${imp}await router.preload(url, req)\n`)!
    expect(run(once)).toBeNull()
  })

  it('is registered and selected for an upgrade that crosses 0.54.0', () => {
    expect(CODEMODS).toContain(routerServerLoaderFunctions)
    expect(selectCodemods('0.53.0', '0.54.0')).toContain(routerServerLoaderFunctions)
    expect(selectCodemods('0.54.0', '0.55.0')).not.toContain(routerServerLoaderFunctions)
  })
})
