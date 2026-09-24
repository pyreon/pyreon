import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import pyreon, { isPyreonPackageFile } from '../index'

// Production SSR builds fold `process.env.NODE_ENV` to "production" inside
// `@pyreon/*` package files. Under Node every `process.env` read is a native
// getenv round trip, and the framework's dev gates sit on hot paths (6 reads
// per signal create+read+write) — Vite leaves those reads live in the SSR
// bundle. See the comment on the fold in index.ts for the measurements.

const REPO = resolve(__dirname, '../../../../..')
const PYREON_LIB_FILE = join(REPO, 'packages/core/reactivity/lib/index.js')
const PYREON_SRC_FILE = join(REPO, 'packages/core/reactivity/src/signal.ts')

type Plugin = ReturnType<typeof pyreon>
type TransformResult = { code: string } | undefined | null

function makePlugin(opts: { command: 'build' | 'serve'; isProduction: boolean }): Plugin {
  const plugin = pyreon()
  ;(plugin.config as unknown as (u: Record<string, unknown>, e: { command: string; mode: string }) => void)(
    { root: REPO },
    { command: opts.command, mode: opts.isProduction ? 'production' : 'development' },
  )
  ;(plugin.configResolved as unknown as (c: { command: string; isProduction: boolean }) => void)({
    command: opts.command,
    isProduction: opts.isProduction,
  })
  return plugin
}

async function transform(plugin: Plugin, code: string, id: string, ssr: boolean): Promise<TransformResult> {
  const ctx = { warn: () => {}, info: () => {}, resolve: async () => null }
  return (
    plugin.transform as unknown as (
      this: typeof ctx,
      code: string,
      id: string,
      o: { ssr: boolean },
    ) => Promise<TransformResult>
  ).call(ctx, code, id, { ssr })
}

const SRC = `export function f() {\n  if (process.env.NODE_ENV !== 'production') console.warn('dev')\n  return process.env.NODE_ENV\n}\n`

describe('isPyreonPackageFile', () => {
  it('recognises an npm-installed @pyreon package', () => {
    expect(isPyreonPackageFile('/app/node_modules/@pyreon/core/lib/index.js')).toBe(true)
  })
  it('recognises a workspace @pyreon package by its package.json name', () => {
    expect(isPyreonPackageFile(PYREON_LIB_FILE)).toBe(true)
    expect(isPyreonPackageFile(`${PYREON_SRC_FILE}?v=123`)).toBe(true)
  })
  it('rejects a user project file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-user-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'my-app' }))
    mkdirSync(join(dir, 'src'))
    expect(isPyreonPackageFile(join(dir, 'src/entry-server.ts'))).toBe(false)
  })
  it('rejects virtual and relative ids', () => {
    expect(isPyreonPackageFile('\0virtual:zero/routes')).toBe(false)
    expect(isPyreonPackageFile('src/x.ts')).toBe(false)
  })
})

describe('production SSR NODE_ENV fold', () => {
  it('folds every read in a @pyreon lib file, preserving length', async () => {
    const out = await transform(makePlugin({ command: 'build', isProduction: true }), SRC, PYREON_LIB_FILE, true)
    expect(out?.code).toBeDefined()
    expect(out!.code).not.toContain('process.env.NODE_ENV')
    expect(out!.code.match(/"production"/g)).toHaveLength(2)
    // Same length and same line structure → every position is unchanged.
    expect(out!.code.length).toBe(SRC.length)
    expect(out!.code.split('\n').map((l) => l.length)).toEqual(SRC.split('\n').map((l) => l.length))
    // The folded source still means the same thing in production.
    expect(new Function(`${out!.code.replace('export ', '')}; return f()`)()).toBe('production')
  })

  it('folds a @pyreon .ts source file that no other stage rewrites', async () => {
    const out = await transform(makePlugin({ command: 'build', isProduction: true }), SRC, PYREON_SRC_FILE, true)
    expect(out?.code).toBeDefined()
    expect(out!.code).not.toContain('process.env.NODE_ENV')
  })

  it('leaves user code alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-user-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'my-app' }))
    const out = await transform(makePlugin({ command: 'build', isProduction: true }), SRC, join(dir, 'server.ts'), true)
    expect(out?.code ?? SRC).toContain('process.env.NODE_ENV')
  })

  it('leaves the CLIENT graph to Vite (which already replaces it)', async () => {
    const out = await transform(makePlugin({ command: 'build', isProduction: true }), SRC, PYREON_LIB_FILE, false)
    expect(out?.code ?? SRC).toContain('process.env.NODE_ENV')
  })

  it('does not fold in dev or in a non-production build', async () => {
    const dev = await transform(makePlugin({ command: 'serve', isProduction: false }), SRC, PYREON_LIB_FILE, true)
    expect(dev?.code ?? SRC).toContain('process.env.NODE_ENV')
    const devBuild = await transform(makePlugin({ command: 'build', isProduction: false }), SRC, PYREON_LIB_FILE, true)
    expect(devBuild?.code ?? SRC).toContain('process.env.NODE_ENV')
  })
})
