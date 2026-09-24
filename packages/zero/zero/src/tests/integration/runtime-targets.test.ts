/**
 * Real-build tests for per-route runtimes (`export const runtime`), the edge
 * deploy targets (Vercel Edge, Netlify Edge, Deno) and scheduled API routes
 * (`export const schedule`).
 *
 * Each case runs an ACTUAL `vite build` of `fixture-runtime` (a node page, an
 * edge page, a scheduled API route) with the zero plugin chain built from src,
 * then asserts the emitted deploy tree against the adapter output-path
 * constants in `adapters/contract.ts` — and, where the runtime exists on this
 * machine, RUNS the output:
 *   - the Vercel/Netlify edge functions and the Netlify scheduled function are
 *     imported and invoked under Node (they are plain Web-Request handlers);
 *   - the Deno runner is spawned only when `deno` is on PATH (it is not on the
 *     machine this was written on — the spec says so rather than passing).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  DENO_ADAPTER_OUTPUT,
  EDGE_SERVER_SUBDIR,
  NETLIFY_ADAPTER_OUTPUT,
  NODE_ADAPTER_OUTPUT,
  VERCEL_ADAPTER_OUTPUT,
} from '../../adapters/contract'
import { cloudflareAdapter, denoAdapter, netlifyAdapter, nodeAdapter, vercelAdapter } from '../../adapters'
import type { ZeroConfig } from '../../types'
import { zeroPlugin } from '../../vite-plugin'

const FIXTURE = resolve(import.meta.dirname, 'fixture-runtime')
const PLAIN_FIXTURE = resolve(import.meta.dirname, 'fixture-build')
const DIST = join(FIXTURE, 'dist')
const VERCEL = join(FIXTURE, ...VERCEL_ADAPTER_OUTPUT.outputDir.split('/'))

async function buildFixture(zeroConfig: ZeroConfig, root = FIXTURE): Promise<void> {
  await build({
    root,
    configFile: false,
    logLevel: 'error',
    plugins: zeroPlugin(zeroConfig),
    resolve: { conditions: ['bun'] },
    build: { outDir: 'dist', emptyOutDir: true },
  })
}

function jsFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...jsFiles(p))
    else if (/\.m?js$/.test(e)) out.push(p)
  }
  return out
}

/**
 * The edge contract: no `node:*` specifier anywhere in the bundle. The ONLY
 * Node API allowed is `node:async_hooks`, and only in the wrapper's init
 * module, outside the bundle.
 */
function expectNoNodeImports(dir: string): void {
  const files = jsFiles(dir)
  expect(files.length).toBeGreaterThan(0)
  for (const f of files) {
    const src = readFileSync(f, 'utf-8')
    const specs = [...src.matchAll(/["'`](node:[\w/]+)["'`]/g)].map((m) => m[1])
    if (f.endsWith('_pyreon-edge-init.js')) expect(specs, f).toEqual(['node:async_hooks'])
    else expect(specs, f).toEqual([])
  }
}

/**
 * Invoke an emitted handler in a FRESH Node process — the bundle registers the
 * framework's singleton sentinels, which would collide with the copies this
 * test process already loaded. Returns `status` + body text.
 */
function callHandler(entry: string, path: string, exportName = 'default'): { status: number; body: string } {
  const script = `const m = await import(${JSON.stringify(pathToFileURL(entry).href)})
const r = await m[${JSON.stringify(exportName)}](new Request("http://localhost${path}"))
process.stdout.write(JSON.stringify({ status: r.status, body: await r.text() }))`
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf-8' })
  return JSON.parse(out) as { status: number; body: string }
}

beforeEach(async () => {
  await rm(DIST, { recursive: true, force: true })
  await rm(join(FIXTURE, '.vercel'), { recursive: true, force: true })
})

afterAll(async () => {
  for (const root of [FIXTURE, PLAIN_FIXTURE]) {
    await rm(join(root, 'dist'), { recursive: true, force: true })
    await rm(join(root, '.vercel'), { recursive: true, force: true })
    await rm(join(root, '__pyreon-zero-ssr-entry.js'), { force: true })
  }
})

const T = 180_000

describe('vercel', () => {
  it('per-route edge: ssr.func stays Node, ssr-edge.func is an edge function routed before the catch-all; schedule → crons', async () => {
    await buildFixture({ mode: 'ssr', adapter: vercelAdapter() })
    const fn = join(VERCEL, 'functions')
    expect(JSON.parse(readFileSync(join(fn, `${VERCEL_ADAPTER_OUTPUT.functionName}.func`, '.vc-config.json'), 'utf-8'))).toEqual({
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
    })
    const edgeDir = join(fn, `${VERCEL_ADAPTER_OUTPUT.edgeFunctionName}.func`)
    expect(JSON.parse(readFileSync(join(edgeDir, '.vc-config.json'), 'utf-8'))).toEqual({
      runtime: 'edge',
      entrypoint: 'index.js',
    })
    expectNoNodeImports(edgeDir)

    const config = JSON.parse(readFileSync(join(VERCEL, 'config.json'), 'utf-8'))
    const routes = config.routes as { src: string; dest?: string }[]
    const edgeIdx = routes.findIndex((r) => r.dest === '/ssr-edge')
    expect(routes[edgeIdx]).toEqual({ src: '^/edge/?$', dest: '/ssr-edge' })
    expect(edgeIdx).toBeLessThan(routes.findIndex((r) => r.src === '/(.*)'))
    expect(config.crons).toEqual([{ path: '/api/cleanup', schedule: '0 3 * * *' }])

    // Run the edge function: its bundle renders the edge page.
    const res = callHandler(join(edgeDir, 'index.js'), '/edge')
    expect(res.status).toBe(200)
    expect(res.body).toContain('edge page')
  }, T)

  it("runtime: 'edge' makes the default function edge; a route declaring 'nodejs' would split out (here: none)", async () => {
    await buildFixture({ mode: 'ssr', adapter: vercelAdapter({ runtime: 'edge' }) })
    const dir = join(VERCEL, 'functions', `${VERCEL_ADAPTER_OUTPUT.functionName}.func`)
    expect(JSON.parse(readFileSync(join(dir, '.vc-config.json'), 'utf-8')).runtime).toBe('edge')
    expectNoNodeImports(dir)
    expect(existsSync(join(VERCEL, 'functions', `${VERCEL_ADAPTER_OUTPUT.edgeFunctionName}.func`))).toBe(false)
    const res = callHandler(join(dir, 'index.js'), '/')
    expect(res.status).toBe(200)
    expect(res.body).toContain('node page')
  }, T)

  it('an app with no declarations emits byte-identical output to before (config.json + .vc-config.json)', async () => {
    await buildFixture({ mode: 'ssr', adapter: vercelAdapter() }, PLAIN_FIXTURE)
    const out = join(PLAIN_FIXTURE, '.vercel', 'output')
    expect(readFileSync(join(out, 'config.json'), 'utf-8')).toBe(
      JSON.stringify(
        {
          version: 3,
          routes: [
            { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
            { src: '/(favicon\\..*|site\\.webmanifest|robots\\.txt|sitemap\\.xml)', dest: '/$1' },
            { src: '/(.*)', dest: '/ssr' },
          ],
        },
        null,
        2,
      ),
    )
    expect(readdirSync(join(out, 'functions'))).toEqual(['ssr.func'])
    expect(existsSync(join(PLAIN_FIXTURE, 'dist', EDGE_SERVER_SUBDIR))).toBe(false)
  }, T)
})

describe('netlify', () => {
  it('per-route edge function + scheduled function; both run', async () => {
    await buildFixture({ mode: 'ssr', adapter: netlifyAdapter() })
    const name = NETLIFY_ADAPTER_OUTPUT.edgeFunctionName
    const edgeDir = join(DIST, ...NETLIFY_ADAPTER_OUTPUT.edgeFunctionsDir.split('/'), name)
    expectNoNodeImports(join(edgeDir))
    const entrySrc = readFileSync(join(edgeDir, `${name}.js`), 'utf-8')
    expect(entrySrc).toContain('"pattern": [\n    "^/edge/?$"\n  ]')
    expect(entrySrc).toContain('"^/assets/.*$"')

    const toml = readFileSync(join(DIST, 'netlify.toml'), 'utf-8')
    expect(toml).toContain(`edge_functions = "${NETLIFY_ADAPTER_OUTPUT.edgeFunctionsDir}"`)

    const edgeRes = callHandler(join(edgeDir, `${name}.js`), '/edge')
    expect(edgeRes.body).toContain('edge page')

    const cron = join(
      DIST,
      ...NETLIFY_ADAPTER_OUTPUT.functionsDir.split('/'),
      `${NETLIFY_ADAPTER_OUTPUT.scheduledFunctionPrefix}api-cleanup.mjs`,
    )
    // Run the scheduled function the way Netlify does (no request argument);
    // it must call the API route in-process without logging a failure.
    const cronRun = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(pathToFileURL(cron).href)})
if (m.config.schedule !== "0 3 * * *") throw new Error("bad schedule " + m.config.schedule)
await m.default()`,
      ],
      { encoding: 'utf-8' },
    )
    expect(cronRun.stderr).toBe('')
    expect(cronRun.status).toBe(0)
  }, T)

  it("edge: true routes everything through the edge function, excluding hashed assets", async () => {
    await buildFixture({ mode: 'ssr', adapter: netlifyAdapter({ edge: true }) })
    const name = NETLIFY_ADAPTER_OUTPUT.edgeFunctionName
    const src = readFileSync(join(DIST, ...NETLIFY_ADAPTER_OUTPUT.edgeFunctionsDir.split('/'), name, `${name}.js`), 'utf-8')
    expect(src).toContain('"^/.*$"')
  }, T)
})

describe('deno', () => {
  it('emits main.js over the edge bundle; runs it when deno is installed', async () => {
    await buildFixture({ mode: 'ssr', adapter: denoAdapter() })
    const runner = join(DIST, DENO_ADAPTER_OUTPUT.runnerEntry)
    expect(existsSync(runner)).toBe(true)
    expect(existsSync(join(DIST, DENO_ADAPTER_OUTPUT.clientDir, 'index.html'))).toBe(true)
    // The Node bundle must not be swept into the public client dir.
    expect(existsSync(join(DIST, DENO_ADAPTER_OUTPUT.clientDir, 'server'))).toBe(false)
    expectNoNodeImports(join(DIST, DENO_ADAPTER_OUTPUT.serverDir))
    expect(readFileSync(runner, 'utf-8')).toContain('Deno.cron("pyreon " + job.path')
    // `node --check` proves the emitted runner is at least valid JavaScript.
    execFileSync(process.execPath, ['--check', runner])

    const hasDeno = spawnSync('deno', ['--version']).status === 0
    if (!hasDeno) {
      console.warn('[runtime-targets] deno is not installed — the Deno runner was NOT executed.')
      return
    }
    const out = execFileSync(
      'deno',
      ['eval', `const m = await import(${JSON.stringify(pathToFileURL(join(DIST, DENO_ADAPTER_OUTPUT.serverDir, 'entry-server.js')).href)}); console.log(await (await m.default(new Request("http://x/edge"))).text())`],
      { encoding: 'utf-8' },
    )
    expect(out).toContain('edge page')
  }, T)
})

describe('capability errors fail the build', () => {
  it('node adapter + an edge route → named error', async () => {
    await expect(buildFixture({ mode: 'ssr', adapter: nodeAdapter({ scheduler: true }) })).rejects.toThrow(
      /\[Pyreon\] The "node" adapter has no edge runtime.*edge\.ts/,
    )
  }, T)

  it('cloudflare + a schedule → named error (Pages has no cron triggers)', async () => {
    await expect(buildFixture({ mode: 'ssr', adapter: cloudflareAdapter() })).rejects.toThrow(
      /\[Pyreon\] The "cloudflare" adapter cannot run `export const schedule` on api\/cleanup\.ts\. Cloudflare Pages has no cron triggers/,
    )
  }, T)
})

describe('node scheduler', () => {
  it('without { scheduler: true } a schedule fails the build; with it the runner embeds the job', async () => {
    // fixture-runtime has an edge route, which node cannot serve — so use a
    // generated routes dir via the plain fixture + the scheduled route.
    const { cp, mkdir } = await import('node:fs/promises')
    const root = join(FIXTURE, '..', 'fixture-runtime-node')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, 'src', 'routes', 'api'), { recursive: true })
    await cp(join(FIXTURE, 'index.html'), join(root, 'index.html'))
    await cp(join(FIXTURE, 'src', 'entry-client.ts'), join(root, 'src', 'entry-client.ts'))
    await cp(join(FIXTURE, 'src', 'routes', 'index.ts'), join(root, 'src', 'routes', 'index.ts'))
    await cp(join(FIXTURE, 'src', 'routes', 'api', 'cleanup.ts'), join(root, 'src', 'routes', 'api', 'cleanup.ts'))
    try {
      await expect(buildFixture({ mode: 'ssr', adapter: nodeAdapter() }, root)).rejects.toThrow(
        /nodeAdapter\(\{ scheduler: true \}\)/,
      )
      await buildFixture({ mode: 'ssr', adapter: nodeAdapter({ scheduler: true }) }, root)
      const runner = readFileSync(join(root, 'dist', NODE_ADAPTER_OUTPUT.runnerEntry), 'utf-8')
      expect(runner).toContain('__pyreonStartScheduler([{"path":"/api/cleanup","minute":[0],"hour":[3]')
      execFileSync(process.execPath, ['--check', join(root, 'dist', NODE_ADAPTER_OUTPUT.runnerEntry)])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, T)
})
