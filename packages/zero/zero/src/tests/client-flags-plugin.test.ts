/**
 * `__ZERO_HYDRATE__` — `false` compiles hydration out of an app that is SPA
 * everywhere (measured −6.6 KB gz, −10.6% of kanban's initial JS). A wrong
 * `false` would drop code a server-rendered page needs, so every doubt must
 * answer `true`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientFlagsPlugin, isSpaEverywhere } from '../client-flags-plugin'

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
  type ConfigHook = (c: object, e: { command: string; mode: string }) => { define?: Record<string, string> } | undefined

  it('defines __ZERO_HYDRATE__ false for an spa-everywhere build, true otherwise', () => {
    const root = project({ 'index.tsx': PAGE })
    const spa = clientFlagsPlugin({}, 'spa').config as unknown as ConfigHook
    expect(spa({ root }, { command: 'build', mode: 'production' })?.define?.__ZERO_HYDRATE__).toBe('false')
    const ssr = clientFlagsPlugin({}, 'ssr').config as unknown as ConfigHook
    expect(ssr({ root }, { command: 'build', mode: 'production' })?.define?.__ZERO_HYDRATE__).toBe('true')
  })

  it('never defines it in dev', () => {
    const root = project({ 'index.tsx': PAGE })
    const spa = clientFlagsPlugin({}, 'spa').config as unknown as ConfigHook
    expect(spa({ root }, { command: 'serve', mode: 'development' })).toBeUndefined()
  })

  it('falls back to process.cwd() when the vite config has no root', () => {
    const root = project({ 'index.tsx': PAGE })
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root)
    try {
      const spa = clientFlagsPlugin({}, 'spa').config as unknown as ConfigHook
      expect(spa({}, { command: 'build', mode: 'production' })?.define?.__ZERO_HYDRATE__).toBe('false')
      expect(cwd).toHaveBeenCalled()
    } finally {
      cwd.mockRestore()
    }
  })
})
