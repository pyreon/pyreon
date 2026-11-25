/**
 * `__ZERO_HYDRATE__` — `false` compiles hydration out of an app that is SPA
 * everywhere (measured −6.6 KB gz, −10.6% of kanban's initial JS). A wrong
 * `false` would drop code a server-rendered page needs, so every doubt must
 * answer `true`.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allPagesIslandsOnly, clientFlagsPlugin, isSpaEverywhere, mayDeclareIslandsOnly } from '../client-flags-plugin'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'zero-client-flags-'))
  dirs.push(root)
  for (const [rel, src] of Object.entries(files)) {
    const full = join(root, 'src/routes', rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, src)
  }
  return root
}

const PAGE = 'export default function P() { return null }\n'

describe('isSpaEverywhere', () => {
  it('is true for an spa app whose routes declare no mode', () => {
    const root = project({ 'index.tsx': PAGE, 'board/[id].tsx': PAGE })
    expect(isSpaEverywhere({}, 'spa', join(root, 'src/routes'))).toBe(true)
  })

  it('is false for any server mode', () => {
    const root = project({ 'index.tsx': PAGE })
    for (const mode of ['ssr', 'ssg', 'isr', 'auto']) {
      expect(isSpaEverywhere({}, mode, join(root, 'src/routes'))).toBe(false)
    }
  })

  it('is false when a route file mentions renderMode', () => {
    const root = project({ 'index.tsx': PAGE, 'blog.tsx': `export const renderMode = 'ssg'\n${PAGE}` })
    expect(isSpaEverywhere({}, 'spa', join(root, 'src/routes'))).toBe(false)
  })

  it('is false when a routeRule declares a non-spa mode', () => {
    const root = project({ 'index.tsx': PAGE })
    expect(
      isSpaEverywhere({ routeRules: { '/blog/**': { renderMode: 'ssg' } } }, 'spa', join(root, 'src/routes')),
    ).toBe(false)
  })
  it('is true when the app has no routes directory at all', () => {
    const root = project({})
    expect(isSpaEverywhere({}, 'spa', join(root, 'src/routes'))).toBe(true)
  })

  it('is false for a symlink, whose target it cannot see without a second stat', () => {
    const root = project({ 'index.tsx': PAGE })
    const outside = join(root, 'outside.tsx')
    writeFileSync(outside, `export const renderMode = 'ssr'\n${PAGE}`)
    symlinkSync(outside, join(root, 'src/routes/linked.tsx'))
    expect(isSpaEverywhere({}, 'spa', join(root, 'src/routes'))).toBe(false)
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'is false when a nested directory cannot be read',
    () => {
      const root = project({ 'index.tsx': PAGE, 'locked/page.tsx': PAGE })
      const locked = join(root, 'src/routes/locked')
      chmodSync(locked, 0o000)
      try {
        expect(isSpaEverywhere({}, 'spa', join(root, 'src/routes'))).toBe(false)
      } finally {
        chmodSync(locked, 0o755)
      }
    },
  )
})

describe('isSpaEverywhere — edge inputs', () => {
  it('is true when routeRules only restate spa (or set no mode) and the routes dir is absent', () => {
    expect(
      isSpaEverywhere(
        { routeRules: { '/a/**': { renderMode: 'spa' }, '/b/**': {} } },
        'spa',
        join(tmpdir(), 'zero-client-flags-does-not-exist'),
      ),
    ).toBe(true)
  })

  it('ignores non-script files that mention renderMode', () => {
    const root = project({ 'index.tsx': PAGE, 'notes.md': 'renderMode is documented here' })
    expect(isSpaEverywhere({}, 'spa', join(root, 'src/routes'))).toBe(true)
  })
})

describe('clientFlagsPlugin', () => {
  type ConfigHook = (c: object, e: { command: string; mode: string; isSsrBuild?: boolean }) => Promise<{ define?: Record<string, string>; build?: unknown } | undefined>

  it('defines __ZERO_HYDRATE__ false for an spa-everywhere build, true otherwise', async () => {
    const root = project({ 'index.tsx': PAGE })
    const spa = clientFlagsPlugin({}, 'spa').config as unknown as ConfigHook
    expect((await spa({ root }, { command: 'build', mode: 'production' }))?.define?.__ZERO_HYDRATE__).toBe('false')
    const ssr = clientFlagsPlugin({}, 'ssr').config as unknown as ConfigHook
    expect((await ssr({ root }, { command: 'build', mode: 'production' }))?.define?.__ZERO_HYDRATE__).toBe('true')
  })

  it('never defines it in dev', async () => {
    const root = project({ 'index.tsx': PAGE })
    const spa = clientFlagsPlugin({}, 'spa').config as unknown as ConfigHook
    expect(await spa({ root }, { command: 'serve', mode: 'development' })).toBeUndefined()
  })

  it('falls back to process.cwd() when the vite config has no root', async () => {
    const root = project({ 'index.tsx': PAGE })
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root)
    try {
      const spa = clientFlagsPlugin({}, 'spa').config as unknown as ConfigHook
      expect((await spa({}, { command: 'build', mode: 'production' }))?.define?.__ZERO_HYDRATE__).toBe('false')
      expect(cwd).toHaveBeenCalled()
    } finally {
      cwd.mockRestore()
    }
  })
})

/**
 * `__ZERO_ISLANDS_ONLY__` (#4371) — `false` compiles the islands-only page
 * support out of `startClient`. A wrong `false` would leave a marked page
 * hydrated as an app with no loader data, so every doubt answers `true`.
 */
describe('mayDeclareIslandsOnly', () => {
  it('is false when no route exports hydrate, even when islands mention it', () => {
    const root = project({
      'index.tsx': PAGE,
      'demo.tsx': `${PAGE}const C = island(() => import('./C'), { name: 'C', hydrate: 'load' })\n`,
    })
    expect(mayDeclareIslandsOnly(join(root, 'src/routes'))).toBe(false)
  })

  it('is true for a page or a layout that exports hydrate, at any depth', () => {
    expect(mayDeclareIslandsOnly(join(project({ 'a/b/page.tsx': `${PAGE}export const hydrate = 'islands'\n` }), 'src/routes'))).toBe(true)
    expect(
      mayDeclareIslandsOnly(join(project({ '_layout.tsx': `export function layout() { return null }\nexport const hydrate = 'app'\n` }), 'src/routes')),
    ).toBe(true)
  })

  it('is false with no routes directory, true when the tree cannot be read', () => {
    const root = project({})
    expect(mayDeclareIslandsOnly(join(root, 'src/routes-missing'))).toBe(false)
    const file = join(root, 'not-a-dir')
    writeFileSync(file, '')
    expect(mayDeclareIslandsOnly(file)).toBe(true)
  })

  it('a symlink answers true (its target is not read)', () => {
    const root = project({ 'index.tsx': PAGE })
    symlinkSync(join(root, 'src/routes/index.tsx'), join(root, 'src/routes/link.tsx'))
    expect(mayDeclareIslandsOnly(join(root, 'src/routes'))).toBe(true)
  })

  it('the plugin defines it per build, never in dev', async () => {
    type ConfigHook = (c: object, e: { command: string; mode: string; isSsrBuild?: boolean }) => Promise<{ define?: Record<string, string>; build?: unknown } | undefined>
    const none = project({ 'index.tsx': PAGE })
    const some = project({ 'index.tsx': `${PAGE}export const hydrate = 'islands'\n` })
    const hook = clientFlagsPlugin({}, 'ssg').config as unknown as ConfigHook
    expect((await hook({ root: none }, { command: 'build', mode: 'production' }))?.define?.__ZERO_ISLANDS_ONLY__).toBe('false')
    expect((await hook({ root: some }, { command: 'build', mode: 'production' }))?.define?.__ZERO_ISLANDS_ONLY__).toBe('true')
    expect(await hook({ root: some }, { command: 'serve', mode: 'development' })).toBeUndefined()
  })
})

/**
 * `__ZERO_APP_PAGES__` (#4371) — `false` when EVERY page is islands-only:
 * `startClientLazy`'s app path (and the router) compiles out of the client
 * build, and the client routes module is empty. A wrong `false` would leave
 * an app page with no app, so every doubt answers `true`. With any
 * islands-only page, the client build groups the islands runtime into one
 * chunk.
 */
describe('every page islands-only', () => {
  type Hook = (c: object, e: { command: string; mode: string; isSsrBuild?: boolean }) => Promise<
    { define?: Record<string, string>; build?: { rolldownOptions?: { output?: { codeSplitting?: { groups?: { name: string; test: RegExp }[] } } } } } | undefined
  >
  const build = { command: 'build', mode: 'production' }
  const LAYOUT = 'export function layout() { return null }\n'

  it('true when a root layout declares islands, or a rule covers every page', async () => {
    const byLayout = project({ '_layout.tsx': `${LAYOUT}export const hydrate = 'islands'\n`, 'index.tsx': PAGE, 'a/b.tsx': PAGE, '_404.tsx': PAGE })
    expect(await allPagesIslandsOnly({}, 'ssg', join(byLayout, 'src/routes'))).toBe(true)
    const byRule = project({ 'index.tsx': PAGE, 'a/b.tsx': PAGE })
    expect(await allPagesIslandsOnly({ routeRules: { '/**': { hydrate: 'islands' } } }, 'ssg', join(byRule, 'src/routes'))).toBe(true)
  })

  it('false when one page opts back to app, when a 404 is only covered by a rule, or with no pages', async () => {
    const optOut = project({ '_layout.tsx': `${LAYOUT}export const hydrate = 'islands'\n`, 'index.tsx': PAGE, 'live.tsx': `${PAGE}export const hydrate = 'app'\n` })
    expect(await allPagesIslandsOnly({}, 'ssg', join(optOut, 'src/routes'))).toBe(false)
    const notFound = project({ 'index.tsx': PAGE, '_404.tsx': PAGE })
    expect(await allPagesIslandsOnly({ routeRules: { '/**': { hydrate: 'islands' } } }, 'ssg', join(notFound, 'src/routes'))).toBe(false)
    expect(await allPagesIslandsOnly({}, 'ssg', join(project({}), 'src/routes'))).toBe(false)
  })

  it('the plugin defines __ZERO_APP_PAGES__ and groups the islands runtime in the client build only', async () => {
    const all = project({ '_layout.tsx': `${LAYOUT}export const hydrate = 'islands'\n`, 'index.tsx': PAGE })
    const some = project({ 'index.tsx': PAGE, 'docs.tsx': `${PAGE}export const hydrate = 'islands'\n` })
    const none = project({ 'index.tsx': PAGE })
    const hook = clientFlagsPlugin({}, 'ssg').config as unknown as Hook
    expect((await hook({ root: all }, build))?.define?.__ZERO_APP_PAGES__).toBe('false')
    expect((await hook({ root: some }, build))?.define?.__ZERO_APP_PAGES__).toBe('true')
    expect((await hook({ root: none }, build))?.define?.__ZERO_APP_PAGES__).toBe('true')
    const groups = (await hook({ root: some }, build))?.build?.rolldownOptions?.output?.codeSplitting?.groups ?? []
    const group = groups.find((g) => g.name === 'islands-runtime')
    expect(group?.test).toBeInstanceOf(RegExp)
    for (const id of [
      '/repo/packages/core/server/src/client.ts',
      '/app/node_modules/@pyreon/server/lib/client.js',
      '/repo/packages/zero/zero/src/client-islands.ts',
      '/app/node_modules/@pyreon/zero/lib/_chunks/client-islands-Ab1_c.js',
    ]) expect(group?.test.test(id), id).toBe(true)
    expect(group?.test.test('/repo/packages/zero/zero/src/client.ts')).toBe(false)
    // The server-island marker code is a group of its own, above the runtime
    // (a group takes its modules' dependencies along, and the runtime's barrel
    // imports it), without its own dependencies (the codec, the base).
    const si = groups.find((g) => g.name === 'server-island')
    expect(si?.priority).toBeGreaterThan(group?.priority ?? Infinity)
    expect(si?.includeDependenciesRecursively).toBe(false)
    for (const id of [
      '/repo/packages/core/server/src/server-island.ts',
      '/app/node_modules/@pyreon/server/lib/_chunks/server-island-Dc_g-L3.js',
      '/repo/packages/zero/zero/src/client-server-islands.ts',
      '/app/node_modules/@pyreon/zero/lib/_chunks/client-server-islands-BCLf9JJ3.js',
    ]) expect(si?.test?.test(id), id).toBe(true)
    for (const id of [
      '/repo/packages/core/server/src/server-island-render.ts',
      '/repo/packages/core/server/src/fragment-base.ts',
      '/repo/packages/core/server/src/client.ts',
      '/app/node_modules/@pyreon/server/lib/client.js',
      '/repo/packages/zero/zero/src/client-islands.ts',
    ]) expect(si?.test?.test(id), id).toBe(false)
    expect((await hook({ root: none }, build))?.build).toBeUndefined()
    expect((await hook({ root: some }, { ...build, isSsrBuild: true }))?.build).toBeUndefined()
  })
})
