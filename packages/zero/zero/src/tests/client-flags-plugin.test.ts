/**
 * `__ZERO_HYDRATE__` — `false` compiles hydration out of an app that is SPA
 * everywhere (measured −6.6 KB gz, −10.6% of kanban's initial JS). A wrong
 * `false` would drop code a server-rendered page needs, so every doubt must
 * answer `true`.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
})
