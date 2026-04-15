import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveAdapter } from '../adapters'
import { vercelAdapter } from '../adapters/vercel'
import { cloudflareAdapter } from '../adapters/cloudflare'
import { netlifyAdapter } from '../adapters/netlify'
import { nodeAdapter } from '../adapters/node'
import { bunAdapter } from '../adapters/bun'
import { staticAdapter } from '../adapters/static'

describe('resolveAdapter', () => {
  it('returns node adapter by default', () => {
    const adapter = resolveAdapter({})
    expect(adapter.name).toBe('node')
  })

  it('returns node adapter when specified', () => {
    const adapter = resolveAdapter({ adapter: 'node' })
    expect(adapter.name).toBe('node')
  })

  it('returns bun adapter', () => {
    const adapter = resolveAdapter({ adapter: 'bun' })
    expect(adapter.name).toBe('bun')
  })

  it('returns static adapter', () => {
    const adapter = resolveAdapter({ adapter: 'static' })
    expect(adapter.name).toBe('static')
  })

  it('returns vercel adapter', () => {
    const adapter = resolveAdapter({ adapter: 'vercel' })
    expect(adapter.name).toBe('vercel')
  })

  it('returns cloudflare adapter', () => {
    const adapter = resolveAdapter({ adapter: 'cloudflare' })
    expect(adapter.name).toBe('cloudflare')
  })

  it('returns netlify adapter', () => {
    const adapter = resolveAdapter({ adapter: 'netlify' })
    expect(adapter.name).toBe('netlify')
  })

  it('throws for unknown adapter', () => {
    expect(() =>
      // @ts-expect-error testing invalid input
      resolveAdapter({ adapter: 'unknown-platform' }),
    ).toThrow('[Pyreon] Unknown adapter: "unknown-platform"')
  })
})

// ─── Build output tests ─────────────────────────────────────────────────────
// These tests verify that each adapter produces the correct file structure.

const TMP = join(import.meta.dirname ?? __dirname, '..', '..', '.test-adapter-output')
const MOCK_CLIENT = join(TMP, 'mock-client')
const MOCK_SERVER = join(TMP, 'mock-server')

async function setupMockBuild() {
  await rm(TMP, { recursive: true, force: true })
  await mkdir(MOCK_CLIENT, { recursive: true })
  await mkdir(MOCK_SERVER, { recursive: true })
  // Minimal mock files
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(MOCK_CLIENT, 'index.html'), '<html></html>')
  await writeFile(join(MOCK_SERVER, 'entry-server.js'), 'export default () => new Response("ok")')
}

async function cleanup() {
  await rm(TMP, { recursive: true, force: true })
}

describe('vercel adapter build', () => {
  it('generates Build Output API v3 structure', async () => {
    await setupMockBuild()
    const outDir = join(TMP, 'vercel-out')
    const adapter = vercelAdapter()
    await adapter.build({
      serverEntry: join(MOCK_SERVER, 'entry-server.js'),
      clientOutDir: MOCK_CLIENT,
      outDir,
      config: {},
    })

    // Verify structure
    const vercelDir = join(outDir, '.vercel', 'output')
    expect(existsSync(join(vercelDir, 'config.json'))).toBe(true)
    expect(existsSync(join(vercelDir, 'static', 'index.html'))).toBe(true)
    expect(existsSync(join(vercelDir, 'functions', 'ssr.func', 'index.js'))).toBe(true)
    expect(existsSync(join(vercelDir, 'functions', 'ssr.func', '.vc-config.json'))).toBe(true)

    // Verify config
    const config = JSON.parse(await readFile(join(vercelDir, 'config.json'), 'utf-8'))
    expect(config.version).toBe(3)
    expect(config.routes.length).toBeGreaterThan(0)

    // Verify function config
    const vcConfig = JSON.parse(await readFile(join(vercelDir, 'functions', 'ssr.func', '.vc-config.json'), 'utf-8'))
    expect(vcConfig.runtime).toMatch(/^nodejs/)

    await cleanup()
  })
})

describe('cloudflare adapter build', () => {
  it('generates Pages output structure', async () => {
    await setupMockBuild()
    const outDir = join(TMP, 'cf-out')
    const adapter = cloudflareAdapter()
    await adapter.build({
      serverEntry: join(MOCK_SERVER, 'entry-server.js'),
      clientOutDir: MOCK_CLIENT,
      outDir,
      config: {},
    })

    expect(existsSync(join(outDir, 'index.html'))).toBe(true)
    expect(existsSync(join(outDir, '_worker.js'))).toBe(true)
    expect(existsSync(join(outDir, '_routes.json'))).toBe(true)

    // Verify routes config
    const routes = JSON.parse(await readFile(join(outDir, '_routes.json'), 'utf-8'))
    expect(routes.version).toBe(1)
    expect(routes.include).toContain('/*')
    expect(routes.exclude).toContain('/assets/*')

    // Verify worker imports from _server
    const worker = await readFile(join(outDir, '_worker.js'), 'utf-8')
    expect(worker).toContain('_server/entry-server.js')

    await cleanup()
  })
})

describe('netlify adapter build', () => {
  it('generates Netlify Functions structure', async () => {
    await setupMockBuild()
    const outDir = join(TMP, 'netlify-out')
    const adapter = netlifyAdapter()
    await adapter.build({
      serverEntry: join(MOCK_SERVER, 'entry-server.js'),
      clientOutDir: MOCK_CLIENT,
      outDir,
      config: {},
    })

    expect(existsSync(join(outDir, 'publish', 'index.html'))).toBe(true)
    expect(existsSync(join(outDir, 'netlify', 'functions', 'ssr.mjs'))).toBe(true)
    expect(existsSync(join(outDir, 'netlify.toml'))).toBe(true)

    // Verify netlify.toml
    const toml = await readFile(join(outDir, 'netlify.toml'), 'utf-8')
    expect(toml).toContain('[build]')
    expect(toml).toContain('publish = "publish"')

    // Verify function is ESM with v2 format
    const func = await readFile(join(outDir, 'netlify', 'functions', 'ssr.mjs'), 'utf-8')
    expect(func).toContain('export default')
    expect(func).toContain('export const config')

    await cleanup()
  })
})

describe('node adapter build', () => {
  it('generates standalone server', async () => {
    await setupMockBuild()
    const outDir = join(TMP, 'node-out')
    const adapter = nodeAdapter()
    await adapter.build({
      serverEntry: join(MOCK_SERVER, 'entry-server.js'),
      clientOutDir: MOCK_CLIENT,
      outDir,
      config: {},
    })

    expect(existsSync(join(outDir, 'index.js'))).toBe(true)
    expect(existsSync(join(outDir, 'package.json'))).toBe(true)
    expect(existsSync(join(outDir, 'client', 'index.html'))).toBe(true)

    const entry = await readFile(join(outDir, 'index.js'), 'utf-8')
    expect(entry).toContain('createServer')
    expect(entry).toContain('3000')

    await cleanup()
  })
})

describe('bun adapter build', () => {
  it('generates Bun.serve entry', async () => {
    await setupMockBuild()
    const outDir = join(TMP, 'bun-out')
    const adapter = bunAdapter()
    await adapter.build({
      serverEntry: join(MOCK_SERVER, 'entry-server.js'),
      clientOutDir: MOCK_CLIENT,
      outDir,
      config: {},
    })

    expect(existsSync(join(outDir, 'index.ts'))).toBe(true)
    expect(existsSync(join(outDir, 'client', 'index.html'))).toBe(true)

    const entry = await readFile(join(outDir, 'index.ts'), 'utf-8')
    expect(entry).toContain('Bun.serve')

    await cleanup()
  })
})

describe('static adapter build', () => {
  it('copies client output to outDir', async () => {
    await setupMockBuild()
    const outDir = join(TMP, 'static-out')
    const adapter = staticAdapter()
    await adapter.build({
      serverEntry: join(MOCK_SERVER, 'entry-server.js'),
      clientOutDir: MOCK_CLIENT,
      outDir,
      config: {},
    })

    expect(existsSync(join(outDir, 'index.html'))).toBe(true)

    await cleanup()
  })
})
