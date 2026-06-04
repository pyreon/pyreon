import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile, rm, mkdir, writeFile } from 'node:fs/promises'
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

    // Verify the SSR module import is HOISTED to module scope, NOT
    // dynamically imported inside the handler. Pre-fix the emitted
    // function called `(await import("./entry-server.js")).default`
    // on every invocation — Node's module cache makes calls after
    // the first one near-free, but the FIRST request on every fresh
    // serverless instance (every cold start) paid the full module
    // evaluation cost inside the request budget. Hoisting it
    // evaluates once at function-init, before the first request.
    const funcSrc = await readFile(
      join(vercelDir, 'functions', 'ssr.func', 'index.js'),
      'utf-8',
    )
    expect(funcSrc).toMatch(/^import\s+handler\s+from\s+["']\.\/entry-server\.js["']/m)
    expect(funcSrc).not.toMatch(/await\s+import\s*\(\s*["']\.\/entry-server\.js["']\s*\)/)

    // Production crashes must surface to Vercel Function logs with a
    // greppable prefix. Pre-fix the handler had no try/catch at all
    // and Vercel's launcher logged generic 500s without context.
    expect(funcSrc).toMatch(/console\.error\([^)]*Pyreon SSR/)

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

    // Production crashes must surface to Cloudflare Tail logs. Pre-fix
    // the `catch (err) { return 500 }` block swallowed `err` entirely
    // and the operator saw a bare "Internal Server Error" with no
    // stack, no message, no path. The `console.error` call is the
    // standard Workers logging surface (lands in `wrangler tail` + the
    // dashboard log stream).
    expect(worker).toMatch(/console\.error\([^)]*Pyreon SSR/)

    // Verify the previously-dead static-asset code block was removed.
    // The pre-fix harness had `const ext = url.pathname.split(".").pop()`
    // followed by an `if (ext && ...)` block with an empty body — pure
    // dead code that consumed an extra LOC budget on every cold start
    // for no behavioral effect. The audit removed it.
    expect(worker).not.toMatch(/const\s+ext\s*=\s*url\.pathname\.split/)

    // Runtime-contract gate: the emitted `_worker.js` runs inside the
    // Cloudflare Worker runtime, which does NOT have Node APIs available
    // by default (only Web standards: fetch, Request, Response, URL,
    // ReadableStream, crypto.subtle, etc.). If the worker template ever
    // grows a `node:` import / `process.env` / `Buffer` / `fs.` / `path.` /
    // `__dirname` / `__filename` / `fileURLToPath`, the deploy will
    // silently 500 in production (or worse, require users to flip the
    // `nodejs_compat` wrangler flag without warning). Locks the
    // Web-standard contract so any future drift fails CI loudly here.
    //
    // The `node:fs/promises` + `node:path` USE in cloudflare.ts itself
    // is fine — they run at BUILD time in Node during `vite build` to
    // emit this file. It's the EMITTED file that must stay Web-standard.
    const forbiddenAtRuntime = [
      /\bnode:[\w/]+/, // node:fs, node:path, node:async_hooks, etc.
      /\bfrom\s+["']fs["']/,
      /\bfrom\s+["']path["']/,
      /\brequire\(["']fs["']\)/,
      /\brequire\(["']path["']\)/,
      /\b__dirname\b/,
      /\b__filename\b/,
      /\bfileURLToPath\b/,
      /\bBuffer\b/,
      // `process.env.X` / `process.env["X"]` — Workers don't expose `process` by default
      /\bprocess\.env\b/,
    ]
    for (const pattern of forbiddenAtRuntime) {
      expect(worker, `emitted _worker.js must not use ${pattern} (Cloudflare Workers default runtime has no Node APIs)`).not.toMatch(pattern)
    }

    await cleanup()
  })

  it('inlines the built SSR template into a global BEFORE dynamic-importing the handler (workerd hydration contract)', async () => {
    // Cloudflare runs in workerd, which has NO filesystem — so the server
    // bundle's `readBuiltTemplate()` can't `readFileSync` the staged
    // `_server/template.html`. Without the template, SSR renders but ships the
    // DEV `entry-client.ts` (no hashed script) → the page never hydrates in
    // production. The adapter must therefore:
    //   1. read the staged template at BUILD time (in Node) and inline it into
    //      `globalThis.__PYREON_SSR_TEMPLATE__`, which `readBuiltTemplate()`
    //      reads FIRST (entry-server.ts);
    //   2. set that global BEFORE the handler module evaluates — which means a
    //      DYNAMIC `await import(...)` (a static, hoisted `import` would run
    //      `createServer → readBuiltTemplate` before the assignment).
    // This locks all three properties against revert. Unlike the node-invoke
    // smoke (verify-modes), a content assertion is NOT masked by Node's fs
    // fallback, so it genuinely regression-catches a revert of cloudflare.ts.
    // Bisect-verify: revert cloudflare.ts to a static `import handler from
    // "./_server/entry-server.js"` with no global → the ordering + global
    // assertions fail.
    await setupMockBuild()
    // Stage a realistic built template next to the server bundle (what
    // ssr-plugin.ts copies as dist/server/template.html — carries the hashed
    // client entry + the injection markers).
    const builtTemplate =
      '<!doctype html><html><head><!--pyreon-head-->' +
      '<script type="module" crossorigin src="/assets/index-Ck3nO5q7.js"></script>' +
      '</head><body><div id="app"><!--pyreon-app--></div><!--pyreon-scripts--></body></html>'
    await writeFile(join(MOCK_SERVER, 'template.html'), builtTemplate)

    const outDir = join(TMP, 'cf-template-out')
    await cloudflareAdapter().build({
      kind: 'ssr',
      serverEntry: join(MOCK_SERVER, 'entry-server.js'),
      clientOutDir: MOCK_CLIENT,
      outDir,
      config: {},
    })

    const worker = await readFile(join(outDir, '_worker.js'), 'utf-8')

    // (1) the template global is set and (2) the handler import is dynamic,
    // with the global assignment STRICTLY BEFORE the import (the ordering is
    // the entire point — a static hoisted import defeats it).
    const globalIdx = worker.indexOf('globalThis.__PYREON_SSR_TEMPLATE__')
    const importIdx = worker.indexOf('await import("./_server/entry-server.js")')
    expect(globalIdx, '_worker.js must set globalThis.__PYREON_SSR_TEMPLATE__').toBeGreaterThanOrEqual(0)
    expect(importIdx, '_worker.js must DYNAMIC-import the handler (await import)').toBeGreaterThanOrEqual(0)
    expect(globalIdx, 'the template global must be set BEFORE the dynamic handler import').toBeLessThan(importIdx)

    // (3) the inlined template carries the hashed PROD entry, not the dev one —
    // this is what makes workerd hydrate.
    expect(worker, 'inlined template must reference the hashed /assets/index-*.js entry').toMatch(
      /\/assets\/index-[\w.-]+\.js/,
    )
    expect(worker, 'inlined template must NOT reference the dev /src/entry-client.ts').not.toContain(
      '/src/entry-client.ts',
    )
    // The injection markers must survive the JSON.stringify round-trip so the
    // handler can replace them at render time.
    expect(worker).toContain('<!--pyreon-app-->')

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

    // Production crashes must surface to Netlify Function logs. Pre-fix
    // the `catch (err) { return 500 }` block swallowed `err` entirely.
    // `console.error` lands in the function's runtime logs panel +
    // `netlify functions:log`.
    expect(func).toMatch(/console\.error\([^)]*Pyreon SSR/)

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

// ─── Bug A regression — clientOutDir === outDir (the real SSR-plugin shape) ──
//
// The zero SSR plugin (`ssr-plugin.ts`) calls every adapter with
// `clientOutDir === outDir === distDir` and the server bundle already at
// `distDir/server/entry-server.js`. A naive `cp(clientOutDir, outDir/<sub>)`
// is then a copy-into-self → `ERR_FS_CP_EINVAL`, which aborts the adapter
// BEFORE it writes its runtime entry — so `node dist/index.js` (etc.) never
// exists and SSR/ISR builds ship a client bundle with no runnable server.
// The pre-existing build tests above use a DISTINCT mock client dir and so
// never exercised this. These assert each adapter stages correctly when the
// client source IS the output dir.

const SAME = join(TMP, 'same-dir-dist')

async function setupSameDirBuild() {
  await rm(TMP, { recursive: true, force: true })
  // Mimic the post-build state: client assets at the dist root + the inner
  // SSR build's output already at dist/server.
  await mkdir(join(SAME, 'assets'), { recursive: true })
  await mkdir(join(SAME, 'server'), { recursive: true })
  await writeFile(join(SAME, 'index.html'), '<html></html>')
  await writeFile(join(SAME, 'assets', 'app.js'), 'console.log(1)')
  await writeFile(join(SAME, 'server', 'entry-server.js'), 'export default () => new Response("ok")')
}

describe('adapter build with clientOutDir === outDir (Bug A regression)', () => {
  it('node: stages client → client/, keeps server/, writes the runtime entry (no EINVAL)', async () => {
    await setupSameDirBuild()
    await nodeAdapter().build({
      kind: 'ssr',
      serverEntry: join(SAME, 'server', 'entry-server.js'),
      clientOutDir: SAME,
      outDir: SAME,
      config: {},
    })
    expect(existsSync(join(SAME, 'client', 'index.html'))).toBe(true)
    expect(existsSync(join(SAME, 'client', 'assets', 'app.js'))).toBe(true)
    expect(existsSync(join(SAME, 'server', 'entry-server.js'))).toBe(true)
    expect(existsSync(join(SAME, 'index.js'))).toBe(true)
    expect(existsSync(join(SAME, 'package.json'))).toBe(true)
    // index.html is copied INTO client/ AND preserved at the root (so a flat
    // `vite preview` on outDir still serves it).
    expect(existsSync(join(SAME, 'index.html'))).toBe(true)
    await cleanup()
  })

  it('bun: stages client → client/, keeps server/, writes the runtime entry (no EINVAL)', async () => {
    await setupSameDirBuild()
    await bunAdapter().build({
      kind: 'ssr',
      serverEntry: join(SAME, 'server', 'entry-server.js'),
      clientOutDir: SAME,
      outDir: SAME,
      config: {},
    })
    expect(existsSync(join(SAME, 'client', 'index.html'))).toBe(true)
    expect(existsSync(join(SAME, 'server', 'entry-server.js'))).toBe(true)
    expect(existsSync(join(SAME, 'index.ts'))).toBe(true)
    await cleanup()
  })

  it('static: leaves the flat client in place (no-op, no EINVAL)', async () => {
    await setupSameDirBuild()
    await staticAdapter().build({
      kind: 'ssr',
      serverEntry: join(SAME, 'server', 'entry-server.js'),
      clientOutDir: SAME,
      outDir: SAME,
      config: {},
    })
    expect(existsSync(join(SAME, 'index.html'))).toBe(true)
    await cleanup()
  })

  it('vercel: stages client → .vercel/output/static, server → functions (no EINVAL)', async () => {
    await setupSameDirBuild()
    await vercelAdapter().build({
      kind: 'ssr',
      serverEntry: join(SAME, 'server', 'entry-server.js'),
      clientOutDir: SAME,
      outDir: SAME,
      config: {},
    })
    const vercelDir = join(SAME, '.vercel', 'output')
    expect(existsSync(join(vercelDir, 'static', 'index.html'))).toBe(true)
    expect(existsSync(join(vercelDir, 'functions', 'ssr.func', 'entry-server.js'))).toBe(true)
    expect(existsSync(join(vercelDir, 'config.json'))).toBe(true)
    await cleanup()
  })

  it('netlify: stages client → publish/, server → functions/_server (no EINVAL)', async () => {
    await setupSameDirBuild()
    await netlifyAdapter().build({
      kind: 'ssr',
      serverEntry: join(SAME, 'server', 'entry-server.js'),
      clientOutDir: SAME,
      outDir: SAME,
      config: {},
    })
    expect(existsSync(join(SAME, 'publish', 'index.html'))).toBe(true)
    expect(existsSync(join(SAME, 'netlify', 'functions', '_server', 'entry-server.js'))).toBe(true)
    expect(existsSync(join(SAME, 'netlify.toml'))).toBe(true)
    await cleanup()
  })

  it('cloudflare: leaves flat client, copies server → _server (no EINVAL)', async () => {
    await setupSameDirBuild()
    await cloudflareAdapter().build({
      kind: 'ssr',
      serverEntry: join(SAME, 'server', 'entry-server.js'),
      clientOutDir: SAME,
      outDir: SAME,
      config: {},
    })
    expect(existsSync(join(SAME, 'index.html'))).toBe(true)
    expect(existsSync(join(SAME, '_server', 'entry-server.js'))).toBe(true)
    expect(existsSync(join(SAME, '_worker.js'))).toBe(true)
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

// ─── Bun adapter — runtime contract (spawn-and-curl) ─────────────────────────
//
// Goal B follow-up: every adapter test up to here asserted the SHAPE of the
// emitted artifacts (files exist, expected substrings present, env-var paths
// return the right structural shape). None of them proved the artifacts
// actually BOOT and serve correctly under a real runtime. That gap was the
// "C-grade adapter coverage" the deep analysis flagged.
//
// This block closes the gap for the Bun adapter — the cheapest first cut
// because bun is already the CI runtime (no `wrangler` / `vercel-cli` /
// `netlify-cli` install required). It builds the adapter against the mock
// fixture, picks a free port, spawns `bun run dist/index.ts`, polls the
// server-ready signal, then drives real HTTP requests via fetch and asserts
// on the responses:
//
//   1. SSR fallback — GET /api/anything returns the mock handler's "ok"
//      (proves the static-file branch doesn't accidentally swallow
//      non-existent paths, which the pre-fix `Bun.resolveSync(...)` call
//      did — it threw on missing modules and 500'd every SSR route).
//   2. Static file — GET /index.html serves the mock client HTML with the
//      cache-control header the harness sets.
//   3. Path traversal — GET /../etc/passwd returns 403 (the security gate
//      still fires after the resolveSync swap).
//   4. Server shuts down cleanly on SIGTERM (no hung subprocess).
//
// Skipped automatically when `Bun` isn't the host runtime (vitest can run
// on Node too) — `typeof Bun !== 'undefined'` gate, surfaced via
// `it.skipIf`. Skipped tests print a reason instead of false-positive
// passing.

describe('bun adapter — runtime contract', () => {
  // Resolves `bun` from PATH so the test works under vitest-on-Node AND
  // vitest-on-Bun. The monorepo runs everything through bun, so PATH
  // having `bun` is a hard pre-condition we can rely on.
  function findBunBin(): string | null {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    try {
      const path = execSync('which bun', { encoding: 'utf-8' }).trim()
      return path || null
    } catch {
      return null
    }
  }
  const BUN_BIN = findBunBin()
  const hasBun = BUN_BIN !== null

  // Find a free port by binding ephemeral, reading the assigned port,
  // closing, then handing the port to the spawned subprocess. There IS
  // a TOCTOU window (another process could grab the port between close
  // and respawn) but it's vanishingly small in practice; the CI uses
  // isolated containers so cross-test collision is also avoided.
  async function pickFreePort(): Promise<number> {
    const { createServer } = await import('node:net')
    return new Promise<number>((resolve, reject) => {
      const srv = createServer()
      srv.unref()
      srv.on('error', reject)
      srv.listen(0, () => {
        const addr = srv.address()
        if (addr && typeof addr === 'object') {
          const port = addr.port
          srv.close(() => resolve(port))
        } else {
          srv.close(() => reject(new Error('Could not pick free port')))
        }
      })
    })
  }

  // Spawn a bun subprocess running the emitted entry, poll for readiness
  // (max ~10s — slower CI machines need slack), return a teardown closure.
  async function startBunServer(entryPath: string, port: number) {
    if (!hasBun) throw new Error('bun binary not found in PATH')
    const { spawn } = await import('node:child_process')
    const proc = spawn(BUN_BIN!, ['run', entryPath], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Capture output so a failure surfaces real diagnostics.
    let stdoutBuf = ''
    let stderrBuf = ''
    proc.stdout?.on('data', (chunk) => {
      stdoutBuf += String(chunk)
    })
    proc.stderr?.on('data', (chunk) => {
      stderrBuf += String(chunk)
    })

    // Poll the server until it responds (or timeout). Avoids parsing the
    // subprocess stdout which is fragile across bun version changes.
    const TIMEOUT_MS = 10000
    const start = Date.now()
    let started = false
    while (Date.now() - start < TIMEOUT_MS) {
      if (proc.exitCode !== null) {
        throw new Error(
          `Bun process exited prematurely with code ${proc.exitCode}\nstdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`,
        )
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/__ping__`, {
          signal: AbortSignal.timeout(200),
        })
        // Any response (even 500 or 404) means the server is up.
        void res
        started = true
        break
      } catch {
        await new Promise((r) => setTimeout(r, 50))
      }
    }
    if (!started) {
      proc.kill('SIGKILL')
      throw new Error(
        `Bun server failed to start within ${TIMEOUT_MS}ms\nstdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`,
      )
    }

    return async function stop() {
      proc.kill('SIGTERM')
      const exited = await Promise.race([
        new Promise<number>((r) => proc.once('exit', (c) => r(c ?? 0))),
        new Promise<number>((r) => setTimeout(() => r(-1), 1000)),
      ])
      if (exited === -1) proc.kill('SIGKILL')
    }
  }

  it.skipIf(!hasBun)(
    'emitted entry boots — SSR fallback returns handler response for non-static paths',
    async () => {
      await setupMockBuild()
      const outDir = join(TMP, 'bun-runtime-ssr')
      const port = await pickFreePort()
      const adapter = bunAdapter()
      await adapter.build({
        kind: 'ssr',
        serverEntry: join(MOCK_SERVER, 'entry-server.js'),
        clientOutDir: MOCK_CLIENT,
        outDir,
        config: { port },
      })

      const stop = await startBunServer(join(outDir, 'index.ts'), port)
      try {
        // /api/anything has no matching static file — must hit the SSR
        // handler, which returns the mock "ok" response. Pre-fix the
        // `Bun.resolveSync` static-file check threw on missing files
        // and the server returned 500 instead of "ok".
        const res = await fetch(`http://127.0.0.1:${port}/api/anything`)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('ok')
      } finally {
        await stop()
        await cleanup()
      }
    },
    20000,
  )

  it.skipIf(!hasBun)(
    'emitted entry boots — /assets/* immutable, non-hashed root .js NOT immutable; GET / SSRs',
    async () => {
      await setupMockBuild()
      const { mkdir } = await import('node:fs/promises')
      // A content-hashed asset under /assets/ — safe to cache forever.
      await mkdir(join(MOCK_CLIENT, 'assets'), { recursive: true })
      await writeFile(join(MOCK_CLIENT, 'assets', 'index-abc123.js'), 'console.log("hashed")')
      // A non-hashed root file (service worker / public config) — must NOT be
      // immutable (the pre-fix handler keyed immutable on the .js extension).
      await writeFile(join(MOCK_CLIENT, 'sw.js'), 'console.log("service worker")')
      const outDir = join(TMP, 'bun-runtime-static')
      const port = await pickFreePort()
      const adapter = bunAdapter()
      await adapter.build({
        kind: 'ssr',
        serverEntry: join(MOCK_SERVER, 'entry-server.js'),
        clientOutDir: MOCK_CLIENT,
        outDir,
        config: { port },
      })

      const stop = await startBunServer(join(outDir, 'index.ts'), port)
      try {
        // Hashed asset under /assets/ → immutable.
        const hashed = await fetch(`http://127.0.0.1:${port}/assets/index-abc123.js`)
        expect(hashed.status).toBe(200)
        expect(await hashed.text()).toBe('console.log("hashed")')
        expect(hashed.headers.get('cache-control')).toContain('immutable')
        // Non-hashed root .js → revalidatable, NEVER immutable (poisoning guard).
        const sw = await fetch(`http://127.0.0.1:${port}/sw.js`)
        expect(sw.status).toBe(200)
        expect(await sw.text()).toBe('console.log("service worker")')
        expect(sw.headers.get('cache-control')).not.toContain('immutable')
        expect(sw.headers.get('cache-control')).toContain('max-age=3600')
        // GET / → SSR handler ("ok"), NOT the static template shell — same
        // SSR-mode contract as the node adapter.
        const root = await fetch(`http://127.0.0.1:${port}/`)
        expect(root.status).toBe(200)
        expect(await root.text()).toBe('ok')
      } finally {
        await stop()
        await cleanup()
      }
    },
    20000,
  )

  // NOTE: An HTTP-level path-traversal test was attempted here but
  // proved structurally impossible. Both `Bun.serve`'s HTTP parser AND
  // the URL spec's mandatory `new Request(url)` normalization collapse
  // `..` segments BEFORE the bytes reach the fetch handler — empirically
  // verified, `GET /../../etc/passwd` arrives as `/etc/passwd` no matter
  // whether the client is fetch, undici, curl, or a raw `node:net` socket.
  // The traversal check in the emitted harness IS still useful
  // defense-in-depth (catches null bytes — explicitly tested in
  // bun.ts — and misbehaving upstream proxies forwarding pre-decoded
  // paths via custom transport), but it can't be exercised through
  // a spec-compliant HTTP path. The SSR-fallback test above already
  // proves the load-bearing fix (resolveSync ENOENT no longer 500s
  // every SSR route).
})

// ─── Node adapter — runtime contract (spawn-and-curl) ────────────────────────
//
// Spawn the emitted entry as a subprocess, drive real HTTP requests, assert
// on responses. Node is already in CI (`node` in PATH), so no extra install.
//
// SSR-mode static-serving contract: the emitted harness serves ONLY real
// static assets (js/css/images/fonts) from clientDir. `/` and any `.html`
// path fall through to the SSR handler so the home route + HTML routes are
// SERVER-RENDERED — in `mode: 'ssr'` clientDir holds the UNFILLED SSR
// template (`<!--pyreon-app-->`), NOT prerendered pages, so static-serving
// index.html at `/` would ship the empty shell and silently defeat SSR for
// the home route. The `mode: 'stream'` test below additionally proves the
// harness pipes the Response body incrementally rather than buffering it via
// `await response.text()` (which would collapse Suspense chunks into one
// ending burst — strictly worse than `mode: 'string'`).
//
// The runtime-contract tests fail against a broken harness, pass against the
// fixed one. Bisect-verified per the testing rule.

describe('node adapter — runtime contract', () => {
  // node is always in PATH inside the monorepo's bun runtime — but bun
  // technically allows spawning without it. We resolve explicitly to
  // surface a clear skip reason if it's missing.
  function findNodeBin(): string | null {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    try {
      const path = execSync('which node', { encoding: 'utf-8' }).trim()
      return path || null
    } catch {
      return null
    }
  }
  const NODE_BIN = findNodeBin()
  const hasNode = NODE_BIN !== null

  async function pickFreePort(): Promise<number> {
    const { createServer } = await import('node:net')
    return new Promise<number>((resolve, reject) => {
      const srv = createServer()
      srv.unref()
      srv.on('error', reject)
      srv.listen(0, () => {
        const addr = srv.address()
        if (addr && typeof addr === 'object') {
          const port = addr.port
          srv.close(() => resolve(port))
        } else {
          srv.close(() => reject(new Error('Could not pick free port')))
        }
      })
    })
  }

  // Spawn `node <entry>` and poll for readiness. Mirrors startBunServer
  // exactly — runtime-agnostic shape (the only difference is the binary).
  async function startNodeServer(entryPath: string, port: number) {
    if (!hasNode) throw new Error('node binary not found in PATH')
    const { spawn } = await import('node:child_process')
    const proc = spawn(NODE_BIN!, [entryPath], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdoutBuf = ''
    let stderrBuf = ''
    proc.stdout?.on('data', (chunk) => {
      stdoutBuf += String(chunk)
    })
    proc.stderr?.on('data', (chunk) => {
      stderrBuf += String(chunk)
    })

    const TIMEOUT_MS = 10000
    const start = Date.now()
    let started = false
    while (Date.now() - start < TIMEOUT_MS) {
      if (proc.exitCode !== null) {
        throw new Error(
          `Node process exited prematurely with code ${proc.exitCode}\nstdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`,
        )
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/__ping__`, {
          signal: AbortSignal.timeout(200),
        })
        void res
        started = true
        break
      } catch {
        await new Promise((r) => setTimeout(r, 50))
      }
    }
    if (!started) {
      proc.kill('SIGKILL')
      throw new Error(
        `Node server failed to start within ${TIMEOUT_MS}ms\nstdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`,
      )
    }

    return async function stop() {
      proc.kill('SIGTERM')
      const exited = await Promise.race([
        new Promise<number>((r) => proc.once('exit', (c) => r(c ?? 0))),
        new Promise<number>((r) => setTimeout(() => r(-1), 1000)),
      ])
      if (exited === -1) proc.kill('SIGKILL')
    }
  }

  it.skipIf(!hasNode)(
    'emitted entry boots — SSR fallback returns handler response for non-static paths',
    async () => {
      await setupMockBuild()
      const outDir = join(TMP, 'node-runtime-ssr')
      const port = await pickFreePort()
      const adapter = nodeAdapter()
      await adapter.build({
        kind: 'ssr',
        serverEntry: join(MOCK_SERVER, 'entry-server.js'),
        clientOutDir: MOCK_CLIENT,
        outDir,
        config: { port },
      })

      const stop = await startNodeServer(join(outDir, 'index.js'), port)
      try {
        // /api/anything has no matching static file → SSR handler returns "ok".
        // Mirrors the bun gate's load-bearing assertion: non-existent paths
        // must reach the SSR handler, not crash with a file-system error.
        const res = await fetch(`http://127.0.0.1:${port}/api/anything`)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('ok')
      } finally {
        await stop()
        await cleanup()
      }
    },
    20000,
  )

  it.skipIf(!hasNode)(
    'emitted entry boots — /assets/* is immutable-cached, a non-hashed root .js is NOT (deploy-poisoning guard)',
    async () => {
      await setupMockBuild()
      const { writeFile, mkdir } = await import('node:fs/promises')
      // A content-hashed asset under /assets/ — safe to cache forever.
      await mkdir(join(MOCK_CLIENT, 'assets'), { recursive: true })
      await writeFile(
        join(MOCK_CLIENT, 'assets', 'index-abc123.js'),
        'console.log("hashed")',
      )
      // A non-hashed root file (e.g. a service worker / public config) — must
      // NEVER be immutable-cached, or a stale copy is unevictable for a year.
      // The pre-fix handler keyed immutable on the .js EXTENSION, so this WAS
      // cached for a year (the bug).
      await writeFile(join(MOCK_CLIENT, 'sw.js'), 'console.log("service worker")')

      const outDir = join(TMP, 'node-runtime-js')
      const port = await pickFreePort()
      await nodeAdapter().build({
        kind: 'ssr',
        serverEntry: join(MOCK_SERVER, 'entry-server.js'),
        clientOutDir: MOCK_CLIENT,
        outDir,
        config: { port },
      })

      const stop = await startNodeServer(join(outDir, 'index.js'), port)
      try {
        const hashed = await fetch(`http://127.0.0.1:${port}/assets/index-abc123.js`)
        expect(hashed.status).toBe(200)
        expect(hashed.headers.get('content-type')).toContain('javascript')
        expect(hashed.headers.get('cache-control')).toContain('immutable')

        const sw = await fetch(`http://127.0.0.1:${port}/sw.js`)
        expect(sw.status).toBe(200)
        expect(await sw.text()).toBe('console.log("service worker")')
        expect(sw.headers.get('cache-control')).not.toContain('immutable')
        expect(sw.headers.get('cache-control')).toContain('max-age=3600')
      } finally {
        await stop()
        await cleanup()
      }
    },
    20000,
  )

  it.skipIf(!hasNode)(
    'emitted entry boots — a static public .html asset IS served (not 404ed to SSR)',
    async () => {
      // Regression guard: the static-serve branch must NOT blanket-exclude
      // .html — a legit public asset like /legal.html would then fall through
      // to the SSR handler (no route → 404). Only "/" (which has no index.html
      // mapping) should server-render; existing files of any extension serve.
      await setupMockBuild()
      const { writeFile } = await import('node:fs/promises')
      await writeFile(join(MOCK_CLIENT, 'legal.html'), '<html><body>LEGAL</body></html>')

      const outDir = join(TMP, 'node-runtime-html')
      const port = await pickFreePort()
      await nodeAdapter().build({
        kind: 'ssr',
        serverEntry: join(MOCK_SERVER, 'entry-server.js'),
        clientOutDir: MOCK_CLIENT,
        outDir,
        config: { port },
      })

      const stop = await startNodeServer(join(outDir, 'index.js'), port)
      try {
        // The static .html asset is served verbatim ...
        const asset = await fetch(`http://127.0.0.1:${port}/legal.html`)
        expect(asset.status).toBe(200)
        expect(await asset.text()).toContain('LEGAL')
        expect(asset.headers.get('content-type')).toContain('html')
        // ... while "/" still falls through to SSR (the mock handler's "ok").
        const root = await fetch(`http://127.0.0.1:${port}/`)
        expect(await root.text()).toBe('ok')
      } finally {
        await stop()
        await cleanup()
      }
    },
    20000,
  )

  it.skipIf(!hasNode)(
    'emitted entry boots — GET / is SERVER-RENDERED, not the static template shell',
    async () => {
      // SSR-mode contract (the Bug C fix): in `mode: 'ssr'` the client build
      // emits the UNFILLED SSR template at index.html
      // (`<div id="app"><!--pyreon-app--></div>`), NOT a prerendered page.
      // The emitted harness must therefore NOT static-serve index.html at `/`
      // — doing so ships the empty shell and the home route is never
      // server-rendered. `/` (and any .html path) falls through to the SSR
      // handler, which renders the route. Real assets (js/css/…) are still
      // served statically (proven by the asset test above). A static SPA
      // shell at `/` is what `mode: 'spa'` / the static adapter are for.
      await setupMockBuild()
      // Even with an index.html present in clientDir, GET / must SSR it.
      await writeFile(
        join(MOCK_CLIENT, 'index.html'),
        '<html><body><div id="app"><!--pyreon-app--></div></body></html>',
      )

      const outDir = join(TMP, 'node-runtime-root')
      const port = await pickFreePort()
      const adapter = nodeAdapter()
      await adapter.build({
        kind: 'ssr',
        serverEntry: join(MOCK_SERVER, 'entry-server.js'),
        clientOutDir: MOCK_CLIENT,
        outDir,
        config: { port },
      })

      const stop = await startNodeServer(join(outDir, 'index.js'), port)
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`)
        expect(res.status).toBe(200)
        const body = await res.text()
        // The SSR handler's output ("ok"), NOT the static template shell.
        expect(body).toBe('ok')
        // The unfilled template placeholder must NEVER reach the client.
        expect(body).not.toContain('<!--pyreon-app-->')
      } finally {
        await stop()
        await cleanup()
      }
    },
    20000,
  )

  it.skipIf(!hasNode)(
    'emitted entry boots — streamed SSR responses are NOT buffered (mode: "stream" stays streamed)',
    async () => {
      // BUG B: pre-fix the harness called `await response.text()` which
      // drained the entire Response body into a string BEFORE writing it
      // to the client. For mode: 'stream' SSR (Suspense out-of-order
      // streaming) this collapsed every chunk into one ending burst —
      // strictly worse than mode: 'string' because the buffering happens
      // twice (once renderToStream collects chunks, once .text() drains
      // them).
      //
      // This test uses a mock SSR entry that returns a ReadableStream
      // emitting 3 chunks with a 150ms delay between each. With the fix
      // (piping the stream directly to res), the client sees the first
      // chunk well BEFORE the third chunk's delay timer fires —
      // proving incremental delivery. Pre-fix the client gets nothing
      // until all 3 timers have fired.
      await setupMockBuild()
      const { writeFile } = await import('node:fs/promises')
      await writeFile(
        join(MOCK_SERVER, 'entry-server.js'),
        `export default async (req) => {
          const encoder = new TextEncoder()
          const stream = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode("CHUNK-1\\n"))
              await new Promise((r) => setTimeout(r, 150))
              controller.enqueue(encoder.encode("CHUNK-2\\n"))
              await new Promise((r) => setTimeout(r, 150))
              controller.enqueue(encoder.encode("CHUNK-3\\n"))
              controller.close()
            }
          })
          return new Response(stream, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" }
          })
        }`,
      )

      const outDir = join(TMP, 'node-runtime-stream')
      const port = await pickFreePort()
      const adapter = nodeAdapter()
      await adapter.build({
        kind: 'ssr',
        serverEntry: join(MOCK_SERVER, 'entry-server.js'),
        clientOutDir: MOCK_CLIENT,
        outDir,
        config: { port },
      })

      const stop = await startNodeServer(join(outDir, 'index.js'), port)
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/stream`)
        expect(res.status).toBe(200)
        expect(res.body).toBeTruthy()

        // Drain chunk-by-chunk and timestamp each arrival. With the fix
        // applied, CHUNK-1 arrives near t=0 and CHUNK-3 arrives near
        // t=300ms. Pre-fix all 3 chunks arrive together near t=300ms
        // because the harness buffered the whole body before writing.
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        const arrivals: Array<{ chunk: string; tMs: number }> = []
        const start = Date.now()
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) {
            const text = decoder.decode(value, { stream: true })
            arrivals.push({ chunk: text, tMs: Date.now() - start })
          }
        }

        // All 3 chunks landed eventually.
        const allText = arrivals.map((a) => a.chunk).join('')
        expect(allText).toContain('CHUNK-1')
        expect(allText).toContain('CHUNK-2')
        expect(allText).toContain('CHUNK-3')

        // Find the timestamp when CHUNK-1 arrived (first occurrence).
        const chunk1Time = arrivals.find((a) => a.chunk.includes('CHUNK-1'))?.tMs ?? -1
        const chunk3Time = arrivals.find((a) => a.chunk.includes('CHUNK-3'))?.tMs ?? -1
        expect(chunk1Time).toBeGreaterThanOrEqual(0)
        expect(chunk3Time).toBeGreaterThanOrEqual(0)

        // Load-bearing assertion: CHUNK-1 arrives well before CHUNK-3.
        // Pre-fix (buffered): both arrive ~300ms after request start
        // and the delta is ~0ms. Post-fix: CHUNK-1 arrives near t=0
        // and CHUNK-3 near t=300ms, so the delta is ~300ms. Use
        // 100ms as a robust floor that's well above buffered-mode
        // noise but well below the actual delta.
        expect(chunk3Time - chunk1Time).toBeGreaterThan(100)
      } finally {
        await stop()
        await cleanup()
      }
    },
    20000,
  )

  it.skipIf(!hasNode)(
    'emitted entry boots — SSR response headers + status code are forwarded correctly',
    async () => {
      // Defensive regression check — the harness builds its own
      // responseHeaders object via response.headers.forEach. A bug that
      // dropped or rewrote headers / status here would be invisible to
      // the existing shape-only tests. The mock handler returns 200 +
      // text/plain; if the harness ever started overwriting these
      // (e.g. always-200 short-circuit, hard-coded content-type) this
      // assertion catches it.
      await setupMockBuild()
      const { writeFile } = await import('node:fs/promises')
      // Replace the default mock entry with one that returns a
      // distinctive status + headers so the test can prove forwarding.
      await writeFile(
        join(MOCK_SERVER, 'entry-server.js'),
        `export default async (req) => new Response("HEADER TEST", {
          status: 201,
          headers: { "x-custom-header": "preserved", "content-type": "text/plain" }
        })`,
      )

      const outDir = join(TMP, 'node-runtime-headers')
      const port = await pickFreePort()
      const adapter = nodeAdapter()
      await adapter.build({
        kind: 'ssr',
        serverEntry: join(MOCK_SERVER, 'entry-server.js'),
        clientOutDir: MOCK_CLIENT,
        outDir,
        config: { port },
      })

      const stop = await startNodeServer(join(outDir, 'index.js'), port)
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/anything`)
        expect(res.status).toBe(201)
        expect(res.headers.get('x-custom-header')).toBe('preserved')
        expect(await res.text()).toBe('HEADER TEST')
      } finally {
        await stop()
        await cleanup()
      }
    },
    20000,
  )
})
