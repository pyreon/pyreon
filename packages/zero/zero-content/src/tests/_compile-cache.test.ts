/**
 * PR-A audit C2 — kill the 2× markdown pipeline pass.
 *
 * Pre-fix the markdown pipeline ran TWICE per SSG build (once for the
 * outer client build, once for the inner SSR sub-build). Both
 * invocations share the same Node process, so a module-level cache
 * keyed on `(id, content-hash, opts-hash)` lets the second transform
 * skip remark + Shiki + esbuild entirely.
 *
 * These specs lock the cache contract via the public test helper +
 * the compile-key shape. Bisect-verified: removing the cache HIT
 * branch in `plugin.ts:transform` makes the cache-hit assertions fail
 * (the compile actually runs twice).
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { _resetCompileCacheForTesting } from '../plugin'
import { compileMarkdown } from '../pipeline/parse'

// Sanity — the public reset helper exists so test suites can isolate
// each other. Pre-fix there was no cache at all.
describe('PR-A C2 — compile cache test helper', () => {
  beforeEach(() => {
    _resetCompileCacheForTesting()
  })

  it('exports `_resetCompileCacheForTesting` for cross-suite isolation', () => {
    expect(typeof _resetCompileCacheForTesting).toBe('function')
    expect(() => _resetCompileCacheForTesting()).not.toThrow()
  })
})

describe('PR-A C2 — plugin transform memoises identical input', () => {
  beforeEach(() => {
    _resetCompileCacheForTesting()
  })

  it('skips the remark pipeline on a repeat transform of identical input', async () => {
    // Spy on `compileMarkdown` to count how many times the heavy
    // pipeline runs. The cache HIT path returns from the cache without
    // calling it.
    const parseMod = await import('../pipeline/parse')
    const spy = vi.spyOn(parseMod, 'compileMarkdown')
    const contentMod = await import('../plugin')
    const plugin = contentMod.default({ highlight: false, compileJsx: false })
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => Promise<unknown>

    const md = '## Title\n\nbody\n'
    const id = '/abs/p/src/content/docs/x.md'
    await transform.call({} as never, md, id)
    const callsAfterFirst = spy.mock.calls.length
    await transform.call({} as never, md, id)
    const callsAfterSecond = spy.mock.calls.length
    // SAME content → cache HIT → no extra compileMarkdown invocation.
    expect(callsAfterSecond).toBe(callsAfterFirst)

    spy.mockRestore()
  })

  it('cache MISS on changed content (HMR / different file content)', async () => {
    const parseMod = await import('../pipeline/parse')
    const spy = vi.spyOn(parseMod, 'compileMarkdown')
    const contentMod = await import('../plugin')
    const plugin = contentMod.default({ highlight: false, compileJsx: false })
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => Promise<unknown>

    const id = '/abs/p/src/content/docs/x.md'
    await transform.call({} as never, '## A\n', id)
    const callsAfterFirst = spy.mock.calls.length
    await transform.call({} as never, '## B\n', id)
    const callsAfterSecond = spy.mock.calls.length
    // DIFFERENT content → cache MISS → compileMarkdown ran again.
    expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst)

    spy.mockRestore()
  })
})

describe('PR-A C2 — cross-instance sharing (the SSG 2× build scenario)', () => {
  beforeEach(() => {
    _resetCompileCacheForTesting()
  })

  it('cache survives across plugin instantiations (proxies the outer→inner SSR sub-build)', async () => {
    // SSG: the outer client build instantiates the plugin once; the
    // inner SSR sub-build instantiates it AGAIN. Both calls share
    // the SAME Node process, so a module-level cache bridges them.
    // We simulate by calling `content()` twice and verifying the
    // second instance hits the cache populated by the first.
    const parseMod = await import('../pipeline/parse')
    const spy = vi.spyOn(parseMod, 'compileMarkdown')
    const contentMod = await import('../plugin')

    const md = '## Title\n\nbody\n'
    const id = '/abs/p/src/content/docs/x.md'

    const pluginA = contentMod.default({ highlight: false, compileJsx: false })
    const transformA = pluginA.transform as (
      code: string,
      id: string,
    ) => Promise<unknown>
    await transformA.call({} as never, md, id)
    const afterFirstInstance = spy.mock.calls.length
    expect(afterFirstInstance).toBeGreaterThan(0)

    // Spawn a SECOND plugin instance (mimics the inner SSR sub-build).
    const pluginB = contentMod.default({ highlight: false, compileJsx: false })
    const transformB = pluginB.transform as (
      code: string,
      id: string,
    ) => Promise<unknown>
    await transformB.call({} as never, md, id)
    const afterSecondInstance = spy.mock.calls.length

    // The module-level cache was populated by pluginA → pluginB hits it.
    expect(afterSecondInstance).toBe(afterFirstInstance)

    spy.mockRestore()
  })

  it('opts difference invalidates the cache (highlight on/off → different output)', async () => {
    const parseMod = await import('../pipeline/parse')
    const spy = vi.spyOn(parseMod, 'compileMarkdown')
    const contentMod = await import('../plugin')

    const md = '```ts\nconst x = 1\n```'
    const id = '/abs/p/src/content/docs/x.md'

    const pluginNoHl = contentMod.default({
      highlight: false,
      compileJsx: false,
    })
    const transformNo = pluginNoHl.transform as (
      code: string,
      id: string,
    ) => Promise<unknown>
    await transformNo.call({} as never, md, id)
    const afterNo = spy.mock.calls.length

    // Same content, DIFFERENT opts → MUST recompile.
    const pluginHl = contentMod.default({ highlight: true, compileJsx: false })
    const transformHl = pluginHl.transform as (
      code: string,
      id: string,
    ) => Promise<unknown>
    await transformHl.call({} as never, md, id)
    const afterHl = spy.mock.calls.length

    expect(afterHl).toBeGreaterThan(afterNo)

    spy.mockRestore()
  })
})

describe('PR-A C2 — pipeline is idempotent on identical input', () => {
  // The cache lives in the Vite plugin layer (we can't drive Vite's
  // transform hook in unit tests easily). What we CAN lock here is
  // the contract `compileMarkdown` carries downstream:
  //
  //   - identical (source, id, opts) → identical compiled output;
  //   - different opts → different output;
  //   - this gives the cache something safe to memoise.
  //
  // Without idempotency the cache would be wrong.

  it('returns byte-identical output for repeat compiles of the same source', async () => {
    const md = '# Title\n\nSome **bold** text and `code`.\n'
    const a = await compileMarkdown(md, '/abs/p/src/content/docs/x.md', {
      highlight: false,
    })
    const b = await compileMarkdown(md, '/abs/p/src/content/docs/x.md', {
      highlight: false,
    })
    expect(b.code).toBe(a.code)
    expect(b.slug).toBe(a.slug)
    expect(b.headings).toEqual(a.headings)
    expect(b.frontmatter).toEqual(a.frontmatter)
    expect(b.componentRefs).toEqual(a.componentRefs)
    expect(b.hoistedEsm).toEqual(a.hoistedEsm)
  })

  it('produces a different result when the source body changes (cache key must differ)', async () => {
    // emit-jsx only captures h2 / h3 headings (see audit H3 — h1
    // captured separately). Use h2 so we can assert on the
    // `headings` extract too.
    const a = await compileMarkdown(
      '## Alpha\n',
      '/abs/p/src/content/docs/x.md',
      { highlight: false },
    )
    const b = await compileMarkdown(
      '## Beta\n',
      '/abs/p/src/content/docs/x.md',
      { highlight: false },
    )
    expect(b.code).not.toBe(a.code)
    expect(b.headings).not.toEqual(a.headings)
  })

  it('produces a different result when the slug-source id changes (cache key must include id)', async () => {
    const md = '# Title\n'
    const a = await compileMarkdown(md, '/abs/p/src/content/docs/x.md', {
      highlight: false,
    })
    const b = await compileMarkdown(md, '/abs/p/src/content/docs/y.md', {
      highlight: false,
    })
    // Bodies are identical; only the slug differs.
    expect(b.slug).not.toBe(a.slug)
  })
})
