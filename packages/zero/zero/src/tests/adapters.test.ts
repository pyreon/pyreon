import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
      kind: 'ssr',
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
      kind: 'ssr',
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
      kind: 'ssr',
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
      kind: 'ssr',
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
      kind: 'ssr',
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
      kind: 'ssr',
      serverEntry: join(MOCK_SERVER, 'entry-server.js'),
      clientOutDir: MOCK_CLIENT,
      outDir,
      config: {},
    })

    expect(existsSync(join(outDir, 'index.html'))).toBe(true)

    await cleanup()
  })
})

// ─── PR I — Adapter.revalidate ──────────────────────────────────────────────
//
// Build-time ISR — `Adapter.revalidate(path)` triggers platform-specific
// rebuild-on-stale. Per-platform tests assert: (a) the no-op fallback
// when env vars are missing returns `regenerated: false`, (b) the
// happy-path issues the right HTTP request to the platform's
// revalidation endpoint and surfaces `regenerated: res.ok`, (c) errors
// don't propagate (the adapter promises a structural return type).
//
// Test fixture: stub `globalThis.fetch` so we can assert the request
// URL/method/headers without hitting real Vercel/Cloudflare/Netlify
// APIs. Restore the original after each test (vitest's `afterEach`
// implicit when using `it` order is fine for this size).

interface FetchCall {
  url: string
  init?: RequestInit
}

function withStubFetch<T>(
  body: () => Promise<T> | T,
  responder: (call: FetchCall) => Response | Promise<Response>,
): Promise<{ result: T; calls: FetchCall[] }> {
  const calls: FetchCall[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const call: FetchCall = init !== undefined ? { url, init } : { url }
    calls.push(call)
    return responder(call)
  }) as typeof fetch
  return Promise.resolve(body()).then((result) => {
    globalThis.fetch = realFetch
    return { result, calls }
  })
}

describe('staticAdapter.revalidate', () => {
  it('returns regenerated:false (no platform-driven ISR for static hosts)', async () => {
    const adapter = staticAdapter()
    const result = await adapter.revalidate?.('/about')
    expect(result).toEqual({ regenerated: false })
  })
})

describe('nodeAdapter.revalidate', () => {
  it('returns regenerated:false (no platform-driven ISR for self-hosted Node)', async () => {
    const adapter = nodeAdapter()
    const result = await adapter.revalidate?.('/posts/1')
    expect(result).toEqual({ regenerated: false })
  })
})

describe('bunAdapter.revalidate', () => {
  it('returns regenerated:false (no platform-driven ISR for self-hosted Bun)', async () => {
    const adapter = bunAdapter()
    const result = await adapter.revalidate?.('/api/health')
    expect(result).toEqual({ regenerated: false })
  })
})

describe('vercelAdapter.revalidate', () => {
  it('returns regenerated:false when VERCEL_DEPLOYMENT_URL/VERCEL_REVALIDATE_TOKEN are missing', async () => {
    // Wipe env vars to simulate no-credential setup.
    const before = {
      url: process.env.VERCEL_DEPLOYMENT_URL,
      vurl: process.env.VERCEL_URL,
      token: process.env.VERCEL_REVALIDATE_TOKEN,
    }
    delete process.env.VERCEL_DEPLOYMENT_URL
    delete process.env.VERCEL_URL
    delete process.env.VERCEL_REVALIDATE_TOKEN
    try {
      const adapter = vercelAdapter()
      const result = await adapter.revalidate?.('/posts/1')
      expect(result).toEqual({ regenerated: false })
    } finally {
      if (before.url) process.env.VERCEL_DEPLOYMENT_URL = before.url
      if (before.vurl) process.env.VERCEL_URL = before.vurl
      if (before.token) process.env.VERCEL_REVALIDATE_TOKEN = before.token
    }
  })

  it('issues POST to /api/_pyreon-revalidate when env vars are set, returns regenerated:true on 200', async () => {
    const before = {
      url: process.env.VERCEL_DEPLOYMENT_URL,
      token: process.env.VERCEL_REVALIDATE_TOKEN,
    }
    process.env.VERCEL_DEPLOYMENT_URL = 'my-app.vercel.app'
    process.env.VERCEL_REVALIDATE_TOKEN = 'secret-token-123'
    try {
      const adapter = vercelAdapter()
      const { result, calls } = await withStubFetch(
        () => adapter.revalidate!('/posts/42'),
        () => new Response('OK', { status: 200 }),
      )
      expect(result).toEqual({ regenerated: true })
      expect(calls).toHaveLength(1)
      // URL must (a) include https:// auto-prefix, (b) URL-encode the
      // path arg, (c) include the secret token. Asserting all three in
      // one URL match keeps the assertion bisect-load-bearing for
      // every part of the URL builder.
      expect(calls[0]?.url).toBe(
        'https://my-app.vercel.app/api/_pyreon-revalidate?path=%2Fposts%2F42&secret=secret-token-123',
      )
      expect(calls[0]?.init?.method).toBe('POST')
    } finally {
      if (before.url !== undefined) process.env.VERCEL_DEPLOYMENT_URL = before.url
      else delete process.env.VERCEL_DEPLOYMENT_URL
      if (before.token !== undefined) process.env.VERCEL_REVALIDATE_TOKEN = before.token
      else delete process.env.VERCEL_REVALIDATE_TOKEN
    }
  })

  it('returns regenerated:false on platform 4xx/5xx (Vercel rejected)', async () => {
    const before = {
      url: process.env.VERCEL_DEPLOYMENT_URL,
      token: process.env.VERCEL_REVALIDATE_TOKEN,
    }
    process.env.VERCEL_DEPLOYMENT_URL = 'my-app.vercel.app'
    process.env.VERCEL_REVALIDATE_TOKEN = 'wrong-token'
    try {
      const adapter = vercelAdapter()
      const { result } = await withStubFetch(
        () => adapter.revalidate!('/posts/42'),
        () => new Response('Forbidden', { status: 403 }),
      )
      expect(result).toEqual({ regenerated: false })
    } finally {
      if (before.url !== undefined) process.env.VERCEL_DEPLOYMENT_URL = before.url
      else delete process.env.VERCEL_DEPLOYMENT_URL
      if (before.token !== undefined) process.env.VERCEL_REVALIDATE_TOKEN = before.token
      else delete process.env.VERCEL_REVALIDATE_TOKEN
    }
  })
})

describe('cloudflareAdapter.revalidate', () => {
  it('returns regenerated:false when env vars are missing', async () => {
    const before = {
      zone: process.env.CLOUDFLARE_ZONE_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
      site: process.env.CLOUDFLARE_SITE_URL,
    }
    delete process.env.CLOUDFLARE_ZONE_ID
    delete process.env.CLOUDFLARE_API_TOKEN
    delete process.env.CLOUDFLARE_SITE_URL
    try {
      const adapter = cloudflareAdapter()
      const result = await adapter.revalidate?.('/about')
      expect(result).toEqual({ regenerated: false })
    } finally {
      if (before.zone) process.env.CLOUDFLARE_ZONE_ID = before.zone
      if (before.token) process.env.CLOUDFLARE_API_TOKEN = before.token
      if (before.site) process.env.CLOUDFLARE_SITE_URL = before.site
    }
  })

  it('POSTs to Cloudflare zone purge_cache endpoint with the full URL', async () => {
    const before = {
      zone: process.env.CLOUDFLARE_ZONE_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
      site: process.env.CLOUDFLARE_SITE_URL,
    }
    process.env.CLOUDFLARE_ZONE_ID = 'zone-abc-123'
    process.env.CLOUDFLARE_API_TOKEN = 'cf-token-xyz'
    process.env.CLOUDFLARE_SITE_URL = 'https://my-site.example.com'
    try {
      const adapter = cloudflareAdapter()
      const { result, calls } = await withStubFetch(
        () => adapter.revalidate!('/blog/welcome'),
        () => new Response('{"success":true}', { status: 200 }),
      )
      expect(result).toEqual({ regenerated: true })
      expect(calls).toHaveLength(1)
      // URL must hit the zone-specific purge_cache endpoint.
      expect(calls[0]?.url).toBe(
        'https://api.cloudflare.com/client/v4/zones/zone-abc-123/purge_cache',
      )
      expect(calls[0]?.init?.method).toBe('POST')
      const headers = calls[0]?.init?.headers as Record<string, string>
      expect(headers?.Authorization).toBe('Bearer cf-token-xyz')
      expect(headers?.['Content-Type']).toBe('application/json')
      // Body must include the full URL (origin + path) — Cloudflare's
      // purge_cache API requires absolute URLs.
      const body = JSON.parse(calls[0]?.init?.body as string) as { files: string[] }
      expect(body.files).toEqual(['https://my-site.example.com/blog/welcome'])
    } finally {
      if (before.zone !== undefined) process.env.CLOUDFLARE_ZONE_ID = before.zone
      else delete process.env.CLOUDFLARE_ZONE_ID
      if (before.token !== undefined) process.env.CLOUDFLARE_API_TOKEN = before.token
      else delete process.env.CLOUDFLARE_API_TOKEN
      if (before.site !== undefined) process.env.CLOUDFLARE_SITE_URL = before.site
      else delete process.env.CLOUDFLARE_SITE_URL
    }
  })
})

describe('netlifyAdapter.revalidate', () => {
  it('returns regenerated:false when NETLIFY_BUILD_HOOK_URL is missing', async () => {
    const before = process.env.NETLIFY_BUILD_HOOK_URL
    delete process.env.NETLIFY_BUILD_HOOK_URL
    try {
      const adapter = netlifyAdapter()
      const result = await adapter.revalidate?.('/posts/42')
      expect(result).toEqual({ regenerated: false })
    } finally {
      if (before) process.env.NETLIFY_BUILD_HOOK_URL = before
    }
  })

  it('POSTs to the build hook URL with trigger_title=revalidate:<path>', async () => {
    const before = process.env.NETLIFY_BUILD_HOOK_URL
    process.env.NETLIFY_BUILD_HOOK_URL = 'https://api.netlify.com/build_hooks/abc123'
    try {
      const adapter = netlifyAdapter()
      const { result, calls } = await withStubFetch(
        () => adapter.revalidate!('/posts/42'),
        () => new Response(null, { status: 200 }),
      )
      expect(result).toEqual({ regenerated: true })
      expect(calls).toHaveLength(1)
      // Must (a) hit the configured hook URL, (b) URL-encode the path
      // inside the trigger_title query param so deploy-log entries
      // round-trip cleanly.
      expect(calls[0]?.url).toBe(
        'https://api.netlify.com/build_hooks/abc123?trigger_title=revalidate%3A%2Fposts%2F42',
      )
      expect(calls[0]?.init?.method).toBe('POST')
    } finally {
      if (before !== undefined) process.env.NETLIFY_BUILD_HOOK_URL = before
      else delete process.env.NETLIFY_BUILD_HOOK_URL
    }
  })
})

// ─── SSG-mode adapter.build() tests (PR J) ──────────────────────────────────
//
// Pre-PR-J adapter.build() was implemented but never invoked from any
// real build pipeline + had no SSG branch (it always assumed serverEntry
// existed). PR J added a discriminated `kind: 'ssr' | 'ssg'` to
// AdapterBuildOptions so SSG callers can invoke build() without faking
// a serverEntry. These tests assert each adapter's SSG branch produces
// the right platform routing config (or correctly no-ops for adapters
// that don't add SSG-specific files).

async function setupSsgDist() {
  await rm(TMP, { recursive: true, force: true })
  const ssgDist = join(TMP, 'ssg-dist')
  await mkdir(ssgDist, { recursive: true })
  const { writeFile } = await import('node:fs/promises')
  // Mock prerendered output the SSG plugin would have produced.
  await writeFile(join(ssgDist, 'index.html'), '<html><body>home</body></html>')
  await mkdir(join(ssgDist, 'about'), { recursive: true })
  await writeFile(join(ssgDist, 'about', 'index.html'), '<html><body>about</body></html>')
  await mkdir(join(ssgDist, 'assets'), { recursive: true })
  await writeFile(join(ssgDist, 'assets', 'index-abc.js'), '/* mock */')
  return ssgDist
}

describe('vercel adapter — SSG mode (PR J)', () => {
  it('emits .vercel/output/config.json without functions', async () => {
    const ssgDist = await setupSsgDist()
    const adapter = vercelAdapter()
    await adapter.build({ kind: 'ssg', outDir: ssgDist, config: {} })

    const configPath = join(ssgDist, '.vercel', 'output', 'config.json')
    expect(existsSync(configPath)).toBe(true)
    const cfg = JSON.parse(await readFile(configPath, 'utf-8'))
    expect(cfg.version).toBe(3)
    // SSG variant: no functions (every page is prerendered).
    expect(cfg.functions).toBeUndefined()
    // Long-cache header for /assets/* mirrors the SSR variant.
    expect(cfg.routes.some((r: { src: string }) => r.src === '/assets/(.*)')).toBe(true)
    await cleanup()
  })

  it('does NOT copy dist files into static/ subdir (preserves user post-build steps)', async () => {
    // Vercel's CLI deploy flow detects the dist root automatically;
    // adapters that move files break user post-build steps (sourcemap
    // upload, perf scripts, custom asset handling). Verify dist content
    // STAYS at outDir, not copied into .vercel/output/static/.
    const ssgDist = await setupSsgDist()
    const adapter = vercelAdapter()
    await adapter.build({ kind: 'ssg', outDir: ssgDist, config: {} })

    expect(existsSync(join(ssgDist, 'index.html'))).toBe(true)
    expect(existsSync(join(ssgDist, '.vercel', 'output', 'static'))).toBe(false)
    await cleanup()
  })
})

describe('cloudflare adapter — SSG mode (PR J)', () => {
  it('emits _routes.json with include:[] + exclude:["/*"]', async () => {
    // The static-only signal: Pages reads _routes.json and skips the
    // function for any URL matching `exclude` patterns. With include
    // empty + exclude='/*', every URL bypasses the worker → pure
    // static deploy.
    const ssgDist = await setupSsgDist()
    const adapter = cloudflareAdapter()
    await adapter.build({ kind: 'ssg', outDir: ssgDist, config: {} })

    const routesPath = join(ssgDist, '_routes.json')
    expect(existsSync(routesPath)).toBe(true)
    const routes = JSON.parse(await readFile(routesPath, 'utf-8'))
    expect(routes.version).toBe(1)
    expect(routes.include).toEqual([])
    expect(routes.exclude).toEqual(['/*'])
    await cleanup()
  })

  it('does NOT emit _worker.js for SSG (zero-function deploy)', async () => {
    const ssgDist = await setupSsgDist()
    const adapter = cloudflareAdapter()
    await adapter.build({ kind: 'ssg', outDir: ssgDist, config: {} })

    expect(existsSync(join(ssgDist, '_worker.js'))).toBe(false)
    await cleanup()
  })
})

describe('netlify adapter — SSG mode (PR J)', () => {
  it('emits netlify.toml with publish="." and asset cache headers, no functions', async () => {
    const ssgDist = await setupSsgDist()
    const adapter = netlifyAdapter()
    await adapter.build({ kind: 'ssg', outDir: ssgDist, config: {} })

    const tomlPath = join(ssgDist, 'netlify.toml')
    expect(existsSync(tomlPath)).toBe(true)
    const toml = await readFile(tomlPath, 'utf-8')
    expect(toml).toContain('publish = "."')
    expect(toml).toContain('Cache-Control = "public, max-age=31536000, immutable"')
    expect(toml).not.toContain('[[redirects]]')
    expect(toml).not.toContain('functions')
    await cleanup()
  })

  it('does NOT emit netlify/functions/ for SSG', async () => {
    const ssgDist = await setupSsgDist()
    const adapter = netlifyAdapter()
    await adapter.build({ kind: 'ssg', outDir: ssgDist, config: {} })

    expect(existsSync(join(ssgDist, 'netlify', 'functions'))).toBe(false)
    await cleanup()
  })
})

describe('static / node / bun adapters — SSG mode no-op (PR J)', () => {
  it('static adapter: no-op (dist is already at outDir)', async () => {
    const ssgDist = await setupSsgDist()
    const adapter = staticAdapter()
    await expect(
      adapter.build({ kind: 'ssg', outDir: ssgDist, config: {} }),
    ).resolves.toBeUndefined()
    // No new platform-specific files emitted.
    expect(existsSync(join(ssgDist, '.vercel'))).toBe(false)
    expect(existsSync(join(ssgDist, '_routes.json'))).toBe(false)
    expect(existsSync(join(ssgDist, 'netlify.toml'))).toBe(false)
    await cleanup()
  })

  it('node adapter: no-op (SSG dist needs no Node runner)', async () => {
    const ssgDist = await setupSsgDist()
    const adapter = nodeAdapter()
    await expect(
      adapter.build({ kind: 'ssg', outDir: ssgDist, config: {} }),
    ).resolves.toBeUndefined()
    expect(existsSync(join(ssgDist, 'index.js'))).toBe(false)
    expect(existsSync(join(ssgDist, 'server'))).toBe(false)
    await cleanup()
  })

  it('bun adapter: no-op (SSG dist needs no Bun runner)', async () => {
    const ssgDist = await setupSsgDist()
    const adapter = bunAdapter()
    await expect(
      adapter.build({ kind: 'ssg', outDir: ssgDist, config: {} }),
    ).resolves.toBeUndefined()
    expect(existsSync(join(ssgDist, 'index.ts'))).toBe(false)
    expect(existsSync(join(ssgDist, 'server'))).toBe(false)
    await cleanup()
  })
})

// ─── M2.4 — adapter env-var warnings in production ──────────────────────────
//
// Pre-M2.4 the env-var-missing warn was DEV-gated, so production silently
// returned `{ regenerated: false }` when a CMS triggered `revalidate(path)`.
// M2.4 makes the warning fire regardless of NODE_ENV, deduped per process
// per `(adapterName + missingVarSet)` combination.
//
// Bisect-load-bearing: re-gate the warn on `process.env.NODE_ENV !==
// 'production'` AND set NODE_ENV=production for the test → "warns even in
// production" spec fails (no console.warn call recorded).

describe('warnMissingEnv (M2.4)', () => {
  let warnCalls: string[] = []
  let originalWarn: typeof console.warn
  let originalNodeEnv: string | undefined

  beforeEach(async () => {
    warnCalls = []
    originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args.map(String).join(' '))
    }
    originalNodeEnv = process.env.NODE_ENV
    // Reset the dedup Set between tests so warn fires on first call each test.
    const mod = await import('../adapters/warn-missing-env')
    mod._resetWarnedKeys()
  })

  afterEach(() => {
    console.warn = originalWarn
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
  })

  it('warns even when NODE_ENV=production (the bug M2.4 fixes)', async () => {
    process.env.NODE_ENV = 'production'
    const before = {
      url: process.env.VERCEL_DEPLOYMENT_URL,
      vurl: process.env.VERCEL_URL,
      token: process.env.VERCEL_REVALIDATE_TOKEN,
    }
    delete process.env.VERCEL_DEPLOYMENT_URL
    delete process.env.VERCEL_URL
    delete process.env.VERCEL_REVALIDATE_TOKEN
    try {
      const adapter = vercelAdapter()
      await adapter.revalidate?.('/posts/1')
      expect(warnCalls.some((c) => c.includes('[Pyreon] vercelAdapter.revalidate()'))).toBe(true)
      expect(warnCalls.some((c) => c.includes('VERCEL_REVALIDATE_TOKEN'))).toBe(true)
    } finally {
      if (before.url) process.env.VERCEL_DEPLOYMENT_URL = before.url
      if (before.vurl) process.env.VERCEL_URL = before.vurl
      if (before.token) process.env.VERCEL_REVALIDATE_TOKEN = before.token
    }
  })

  it('dedupes — multiple calls with the same missing env produce ONE warn', async () => {
    const before = process.env.NETLIFY_BUILD_HOOK_URL
    delete process.env.NETLIFY_BUILD_HOOK_URL
    try {
      const adapter = netlifyAdapter()
      await adapter.revalidate?.('/a')
      await adapter.revalidate?.('/b')
      await adapter.revalidate?.('/c')
      const matchingWarns = warnCalls.filter((c) =>
        c.includes('[Pyreon] netlifyAdapter.revalidate()'),
      )
      expect(matchingWarns).toHaveLength(1)
    } finally {
      if (before) process.env.NETLIFY_BUILD_HOOK_URL = before
    }
  })

  it('warning text names every missing env var (cloudflare case — 3 vars)', async () => {
    const before = {
      zone: process.env.CLOUDFLARE_ZONE_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
      url: process.env.CLOUDFLARE_SITE_URL,
    }
    delete process.env.CLOUDFLARE_ZONE_ID
    delete process.env.CLOUDFLARE_API_TOKEN
    delete process.env.CLOUDFLARE_SITE_URL
    try {
      const adapter = cloudflareAdapter()
      await adapter.revalidate?.('/about')
      const warn = warnCalls.find((c) => c.includes('cloudflareAdapter.revalidate()'))
      expect(warn).toBeDefined()
      expect(warn).toContain('CLOUDFLARE_ZONE_ID')
      expect(warn).toContain('CLOUDFLARE_API_TOKEN')
      expect(warn).toContain('CLOUDFLARE_SITE_URL')
    } finally {
      if (before.zone) process.env.CLOUDFLARE_ZONE_ID = before.zone
      if (before.token) process.env.CLOUDFLARE_API_TOKEN = before.token
      if (before.url) process.env.CLOUDFLARE_SITE_URL = before.url
    }
  })

  it('returns regenerated:false (revalidation cannot succeed without env)', async () => {
    const before = process.env.NETLIFY_BUILD_HOOK_URL
    delete process.env.NETLIFY_BUILD_HOOK_URL
    try {
      const adapter = netlifyAdapter()
      const result = await adapter.revalidate?.('/anything')
      expect(result).toEqual({ regenerated: false })
    } finally {
      if (before) process.env.NETLIFY_BUILD_HOOK_URL = before
    }
  })
})
