/**
 * Unit-level build contracts for the edge / scheduled-route adapter paths.
 *
 * `integration/runtime-targets.test.ts` drives these adapters through a real
 * Vite build, which always uses the defaults (no custom assetsDir or port, the
 * edge bundle always present). These specs pin what that suite cannot reach:
 * the named errors when an edge function is requested without an edge bundle,
 * the default-edge split for routes that declare `runtime = 'nodejs'`, the
 * Deno runner's configurable parts, and the opt-in Bun scheduler.
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bunAdapter } from '../adapters/bun'
import {
  BUN_ADAPTER_OUTPUT,
  DENO_ADAPTER_OUTPUT,
  NETLIFY_ADAPTER_OUTPUT,
  VERCEL_ADAPTER_OUTPUT,
} from '../adapters/contract'
import { parseCron } from '../adapters/cron'
import { denoAdapter } from '../adapters/deno'
import type { DeployTargets } from '../adapters/deploy-targets'
import { netlifyAdapter } from '../adapters/netlify'
import { vercelAdapter } from '../adapters/vercel'

let root: string
let client: string
let server: string
let edge: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'zero-edge-adapters-'))
  client = join(root, 'client')
  server = join(root, 'server')
  edge = join(root, 'server-edge')
  for (const d of [client, server, edge]) await mkdir(d, { recursive: true })
  await writeFile(join(client, 'index.html'), '<html></html>')
  await writeFile(join(server, 'entry-server.js'), 'export default () => new Response("node")')
  await writeFile(join(edge, 'entry-server.js'), 'export default () => new Response("edge")')
  await writeFile(join(edge, 'template.html'), '<!--pyreon-app-->')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})

const schedule = (path: string, expr: string) => ({ path, schedule: expr, cron: parseCron(expr), file: `${path}.ts` })

function deploy(partial: Partial<DeployTargets>): DeployTargets {
  return { edgeRoutes: [], nodeRoutes: [], schedules: [], ...partial }
}

function ssr(outDir: string, extra: Record<string, unknown> = {}) {
  return {
    kind: 'ssr' as const,
    serverEntry: join(server, 'entry-server.js'),
    clientOutDir: client,
    outDir,
    projectRoot: outDir,
    config: {},
    ...extra,
  }
}

describe('denoAdapter build', () => {
  it('SSG builds are a no-op — the prerendered dist is already servable', async () => {
    const outDir = join(root, 'deno-ssg')
    await denoAdapter().build({ kind: 'ssg', outDir, projectRoot: outDir, config: {} })
    expect(existsSync(outDir)).toBe(false)
  })

  it('refuses an SSR build with no edge bundle, naming the fix', async () => {
    await expect(denoAdapter().build(ssr(join(root, 'deno-noedge')))).rejects.toThrow(
      /\[Pyreon\] denoAdapter: the edge server bundle was not built/,
    )
  })

  it('bakes the configured assetsDir and port into the runner and registers schedules with Deno.cron', async () => {
    const outDir = join(root, 'deno-out')
    await denoAdapter().build(
      ssr(outDir, {
        edgeServerEntry: join(edge, 'entry-server.js'),
        assetsDir: 'static',
        config: { port: 9123 },
        deploy: deploy({ schedules: [schedule('/api/sync', '*/5 * * * *')] }),
      }),
    )
    const runner = await readFile(join(outDir, DENO_ADAPTER_OUTPUT.runnerEntry), 'utf-8')
    expect(runner).toContain('path.startsWith("/static/")')
    expect(runner).toContain('Number(Deno.env.get("PORT") || 9123)')
    const jobs = /const JOBS = (\[.*\])/.exec(runner)
    expect(JSON.parse(jobs![1]!)).toEqual([{ path: '/api/sync', schedule: '*/5 * * * *' }])
    expect(runner).toContain('typeof Deno.cron !== "function"')
    // The edge bundle (not the node one) is what the runner imports.
    const staged = join(outDir, DENO_ADAPTER_OUTPUT.serverDir)
    expect(await readFile(join(staged, 'entry-server.js'), 'utf-8')).toContain('"edge"')
    expect(existsSync(join(staged, '_pyreon-edge-init.js'))).toBe(true)
  })

  it('defaults to /assets/ and port 8000, and emits no cron block without schedules', async () => {
    const outDir = join(root, 'deno-default')
    await denoAdapter().build(ssr(outDir, { edgeServerEntry: join(edge, 'entry-server.js') }))
    const runner = await readFile(join(outDir, DENO_ADAPTER_OUTPUT.runnerEntry), 'utf-8')
    expect(runner).toContain('path.startsWith("/assets/")')
    expect(runner).toContain('Deno.env.get("PORT") || 8000')
    expect(runner).not.toContain('JOBS')
    expect(runner).not.toContain('Deno.cron')
  })

  it('revalidate is a no-op that warns in development and stays silent in production', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await denoAdapter().revalidate!('/x')).toEqual({ regenerated: false })
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\[Pyreon\] denoAdapter\.revalidate\(\) is a no-op/))
    warn.mockClear()
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(await denoAdapter().revalidate!('/x')).toEqual({ regenerated: false })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe("vercelAdapter({ runtime: 'edge' })", () => {
  it('refuses to build when no edge bundle exists', async () => {
    const outDir = join(root, 'vercel-noedge')
    await expect(vercelAdapter({ runtime: 'edge' }).build(ssr(outDir))).rejects.toThrow(
      /\[Pyreon\] vercelAdapter: an edge function was requested but no edge server bundle was built/,
    )
  })

  it("splits routes declaring runtime = 'nodejs' into a Node function routed before the catch-all", async () => {
    const outDir = join(root, 'vercel-split')
    await vercelAdapter({ runtime: 'edge', nodeRuntime: 'nodejs20.x' }).build(
      ssr(outDir, {
        edgeServerEntry: join(edge, 'entry-server.js'),
        deploy: deploy({ nodeRoutes: [{ pattern: '/legacy', file: 'legacy.tsx' }] }),
      }),
    )
    const out = join(outDir, ...VERCEL_ADAPTER_OUTPUT.outputDir.split('/'))
    const fn = (name: string) => join(out, 'functions', `${name}.func`)
    expect(JSON.parse(await readFile(join(fn(VERCEL_ADAPTER_OUTPUT.functionName), '.vc-config.json'), 'utf-8')))
      .toEqual({ runtime: 'edge', entrypoint: 'index.js' })
    expect(JSON.parse(await readFile(join(fn(VERCEL_ADAPTER_OUTPUT.nodeFunctionName), '.vc-config.json'), 'utf-8')))
      .toEqual({ runtime: 'nodejs20.x', handler: 'index.js', launcherType: 'Nodejs' })
    // The split function carries the NODE bundle.
    expect(await readFile(join(fn(VERCEL_ADAPTER_OUTPUT.nodeFunctionName), 'entry-server.js'), 'utf-8'))
      .toContain('"node"')

    const config = JSON.parse(await readFile(join(out, 'config.json'), 'utf-8')) as {
      routes: { src: string; dest?: string }[]
    }
    const dests = config.routes.filter((r) => r.dest).map((r) => r.dest)
    const nodeIdx = dests.indexOf(`/${VERCEL_ADAPTER_OUTPUT.nodeFunctionName}`)
    const catchAllIdx = dests.indexOf(`/${VERCEL_ADAPTER_OUTPUT.functionName}`)
    expect(nodeIdx).toBeGreaterThan(-1)
    expect(nodeIdx).toBeLessThan(catchAllIdx)
  })
})

describe('netlifyAdapter({ edge: true })', () => {
  it('refuses to build when no edge bundle exists', async () => {
    await expect(netlifyAdapter({ edge: true }).build(ssr(join(root, 'netlify-noedge')))).rejects.toThrow(
      /\[Pyreon\] netlifyAdapter: an edge function was requested but no edge server bundle was built/,
    )
  })

  it("excludes routes declaring runtime = 'nodejs' from the default edge function", async () => {
    const outDir = join(root, 'netlify-split')
    await netlifyAdapter({ edge: true }).build(
      ssr(outDir, {
        edgeServerEntry: join(edge, 'entry-server.js'),
        deploy: deploy({ nodeRoutes: [{ pattern: '/legacy', file: 'legacy.tsx' }] }),
      }),
    )
    const name = NETLIFY_ADAPTER_OUTPUT.edgeFunctionName
    const src = await readFile(
      join(outDir, ...NETLIFY_ADAPTER_OUTPUT.edgeFunctionsDir.split('/'), name, `${name}.js`),
      'utf-8',
    )
    const config = JSON.parse(/export const config = ([\s\S]*)\n$/.exec(src)![1]!) as {
      pattern: string[]
      excludedPattern: string[]
    }
    expect(config.pattern).toEqual(['^/.*$'])
    expect(config.excludedPattern).toHaveLength(2)
    expect(new RegExp(config.excludedPattern[1]!).test('/legacy')).toBe(true)
    expect(new RegExp(config.excludedPattern[1]!).test('/other')).toBe(false)
  })
})

describe('netlifyAdapter({ edge: true }) without deploy targets', () => {
  it('routes every path through the edge function, excluding only hashed assets', async () => {
    const outDir = join(root, 'netlify-all-edge')
    await netlifyAdapter({ edge: true }).build(ssr(outDir, { edgeServerEntry: join(edge, 'entry-server.js') }))
    const name = NETLIFY_ADAPTER_OUTPUT.edgeFunctionName
    const src = await readFile(
      join(outDir, ...NETLIFY_ADAPTER_OUTPUT.edgeFunctionsDir.split('/'), name, `${name}.js`),
      'utf-8',
    )
    const config = JSON.parse(/export const config = ([\s\S]*)\n$/.exec(src)![1]!) as { excludedPattern: string[] }
    expect(config.excludedPattern).toEqual(['^/assets/.*$'])
  })
})

describe('bunAdapter scheduler', () => {
  const jobs = deploy({ schedules: [schedule('/api/cleanup', '0 3 * * *')] })

  it('embeds the in-process scheduler with the declared jobs when { scheduler: true }', async () => {
    const outDir = join(root, 'bun-sched')
    await bunAdapter({ scheduler: true }).build(ssr(outDir, { deploy: jobs }))
    const runner = await readFile(join(outDir, BUN_ADAPTER_OUTPUT.runnerEntry), 'utf-8')
    expect(runner).toContain('__pyreonStartScheduler(')
    expect(runner).toContain('/api/cleanup')
  })

  it('emits no scheduler when opted in but the build found no scheduled routes', async () => {
    const outDir = join(root, 'bun-sched-empty')
    await bunAdapter({ scheduler: true }).build(ssr(outDir))
    const runner = await readFile(join(outDir, BUN_ADAPTER_OUTPUT.runnerEntry), 'utf-8')
    expect(runner).not.toContain('__pyreonStartScheduler(')
  })

  it('emits no scheduler without the opt-in, even when schedules were declared', async () => {
    const outDir = join(root, 'bun-nosched')
    await bunAdapter().build(ssr(outDir, { deploy: jobs }))
    const runner = await readFile(join(outDir, BUN_ADAPTER_OUTPUT.runnerEntry), 'utf-8')
    expect(runner).not.toContain('__pyreonStartScheduler(')
    expect(runner).not.toContain('/api/cleanup')
  })
})
