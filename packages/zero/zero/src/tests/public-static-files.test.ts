/**
 * `public/` files must be served AS FILES by every serverless / edge deploy.
 *
 * The adapters used to carve out only a hardcoded list (`/favicon.*`,
 * `/robots.txt`, `/sitemap.xml`, `/site.webmanifest`); any other public file
 * reached the SSR function and came back as a server-rendered HTML page. On
 * Netlify Edge — which runs BEFORE static files — even `robots.txt` did.
 * Found by running the artifacts in their real runtimes
 * (`e2e/edge-runtimes.spec.ts`); these specs pin the emitted routing so the
 * class is also caught without a runtime.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cloudflareAdapter } from '../adapters/cloudflare'
import { CLOUDFLARE_ADAPTER_OUTPUT, NETLIFY_ADAPTER_OUTPUT, VERCEL_ADAPTER_OUTPUT } from '../adapters/contract'
import { denoAdapter } from '../adapters/deno'
import { STATIC_MIME_TYPES } from '../adapters/mime'
import { netlifyAdapter } from '../adapters/netlify'
import { nodeAdapter } from '../adapters/node'
import { listStaticFiles } from '../adapters/static-files'
import { vercelAdapter } from '../adapters/vercel'

let root: string
let client: string
let server: string
let edge: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'zero-public-files-'))
  client = join(root, 'client')
  server = join(root, 'server')
  edge = join(root, 'server-edge')
  for (const d of [client, server, edge, join(client, 'assets'), join(client, 'icons'), join(client, '.vite'), join(client, '.well-known')]) {
    await mkdir(d, { recursive: true })
  }
  await writeFile(join(client, 'index.html'), '<!--pyreon-app-->')
  await writeFile(join(client, 'robots.txt'), 'User-agent: *')
  await writeFile(join(client, 'humans.txt'), 'humans')
  await writeFile(join(client, 'icons', 'a+b.png'), 'png')
  await writeFile(join(client, '.well-known', 'security.txt'), 'sec')
  await writeFile(join(client, '.vite', 'manifest.json'), '{}')
  await writeFile(join(client, 'assets', 'index-abc.js'), '')
  await writeFile(join(client, '_headers'), '')
  await writeFile(join(server, 'entry-server.js'), 'export default () => new Response("node")')
  await writeFile(join(server, 'template.html'), '<!--pyreon-app-->')
  await writeFile(join(edge, 'entry-server.js'), 'export default () => new Response("edge")')
  await writeFile(join(edge, 'template.html'), '<!--pyreon-app-->')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function ssr(outDir: string) {
  return {
    kind: 'ssr' as const,
    serverEntry: join(server, 'entry-server.js'),
    edgeServerEntry: join(edge, 'entry-server.js'),
    clientOutDir: client,
    outDir,
    projectRoot: outDir,
    config: {},
  }
}

const PUBLIC = ['/.well-known/security.txt', '/humans.txt', '/icons/a+b.png', '/robots.txt']

describe('listStaticFiles', () => {
  it('lists public files — not HTML, hashed assets, build metadata, platform config or named dirs', async () => {
    expect(await listStaticFiles(client, { assetsDir: 'assets' })).toEqual(PUBLIC)
    expect(await listStaticFiles(client, { assetsDir: 'assets', skip: ['icons'] })).toEqual([
      '/.well-known/security.txt',
      '/humans.txt',
      '/robots.txt',
    ])
  })

  it('honours a custom (nested) assetsDir', async () => {
    await mkdir(join(client, 'static', 'js'), { recursive: true })
    await writeFile(join(client, 'static', 'js', 'x.js'), '')
    expect(await listStaticFiles(client, { assetsDir: 'static/js' })).toContain('/assets/index-abc.js')
    expect(await listStaticFiles(client, { assetsDir: 'static/js' })).not.toContain('/static/js/x.js')
  })
})

describe('adapters route public files to the static layer', () => {
  it('netlify edge: every public file is excluded from the edge function', async () => {
    const outDir = join(root, 'netlify')
    await netlifyAdapter({ edge: true }).build(ssr(outDir))
    const name = NETLIFY_ADAPTER_OUTPUT.edgeFunctionName
    const src = await readFile(join(outDir, NETLIFY_ADAPTER_OUTPUT.edgeFunctionsDir, name, `${name}.js`), 'utf-8')
    const config = JSON.parse(src.slice(src.indexOf('export const config = ') + 'export const config = '.length)) as {
      pattern: string[]
      excludedPattern: string[]
    }
    const excluded = (path: string) => config.excludedPattern.some((re) => new RegExp(re).test(path))
    for (const path of PUBLIC) expect(excluded(path), path).toBe(true)
    // Exact matches only — pages that merely share a prefix still render.
    for (const path of ['/', '/humans', '/humans.txt/x', '/robotsXtxt']) expect(excluded(path), path).toBe(false)
  })

  it('vercel: public files are routed to static/ before the SSR catch-all', async () => {
    const outDir = join(root, 'vercel')
    await vercelAdapter({ runtime: 'edge' }).build(ssr(outDir))
    const config = JSON.parse(
      await readFile(join(outDir, VERCEL_ADAPTER_OUTPUT.outputDir, 'config.json'), 'utf-8'),
    ) as { routes: { src?: string; dest?: string }[] }
    // Vercel anchors `src`; resolve the FIRST route that matches, like the platform does.
    const destFor = (path: string) => {
      for (const r of config.routes) {
        const m = r.src === undefined ? null : new RegExp(`^${r.src}$`).exec(path)
        if (m) return r.dest?.replace(/\$(\d+)/g, (_, i: string) => m[Number(i)] ?? '')
      }
      return undefined
    }
    for (const path of PUBLIC) expect(destFor(path), path).toBe(path)
    expect(destFor('/humans')).toBe(`/${VERCEL_ADAPTER_OUTPUT.functionName}`)
  })

  it('cloudflare: public files bypass the worker, and the worker serves any it does receive from ASSETS', async () => {
    const outDir = join(root, 'cf')
    await cloudflareAdapter().build(ssr(outDir))
    const routes = JSON.parse(await readFile(join(outDir, CLOUDFLARE_ADAPTER_OUTPUT.routesFile), 'utf-8')) as {
      exclude: string[]
    }
    for (const path of PUBLIC) expect(routes.exclude, path).toContain(path)
    // The staged server bundle and platform files are NOT public.
    expect(routes.exclude.some((p) => p.includes('entry-server') || p.startsWith('/_'))).toBe(false)
    const worker = await readFile(join(outDir, CLOUDFLARE_ADAPTER_OUTPUT.workerFile), 'utf-8')
    expect(worker).toContain(`const STATIC_FILES = new Set(${JSON.stringify(PUBLIC)})`)
    expect(worker).toContain('return env.ASSETS.fetch(request)')
  })

  it('cloudflare: stays within the 100-rule _routes.json limit, leaving the overflow to the worker', async () => {
    for (let i = 0; i < 150; i++) await writeFile(join(client, `f${String(i).padStart(3, '0')}.txt`), '')
    const outDir = join(root, 'cf-many')
    await cloudflareAdapter().build(ssr(outDir))
    const routes = JSON.parse(await readFile(join(outDir, CLOUDFLARE_ADAPTER_OUTPUT.routesFile), 'utf-8')) as {
      include: string[]
      exclude: string[]
    }
    expect(routes.include.length + routes.exclude.length).toBe(100)
    const worker = await readFile(join(outDir, CLOUDFLARE_ADAPTER_OUTPUT.workerFile), 'utf-8')
    // Past the limit the file is not excluded — but the worker still knows it.
    expect(routes.exclude).not.toContain('/f149.txt')
    expect(worker).toContain('"/f149.txt"')
  })
})

describe('standalone runners serve public text files with a real content type', () => {
  it('the shared table covers the common public/ types', () => {
    for (const ext of ['.txt', '.xml', '.webmanifest', '.webp', '.avif', '.gif', '.map']) {
      expect(STATIC_MIME_TYPES[ext], ext).toBeDefined()
    }
  })

  it('deno + node runners embed the shared table', async () => {
    const denoOut = join(root, 'deno')
    await denoAdapter().build(ssr(denoOut))
    const nodeOut = join(root, 'node')
    await nodeAdapter().build({ ...ssr(nodeOut), edgeServerEntry: undefined })
    for (const runner of [join(denoOut, 'main.js'), join(nodeOut, 'index.js')]) {
      expect(await readFile(runner, 'utf-8'), runner).toContain(`const MIME_TYPES = ${JSON.stringify(STATIC_MIME_TYPES)}`)
    }
  })
})
