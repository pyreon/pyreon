/**
 * The Netlify NODE function (not the edge one) shipped two ways of serving a
 * page that never hydrates. Both were reproduced under `netlify dev` against a
 * real zero build before this fix:
 *
 * 1. `/` served the UNRENDERED template. The function is `preferStatic: true`,
 *    and Netlify then lets an existing static file win over the function.
 *    `publish/index.html` is the client build's `index.html`, which IS the SSR
 *    template with `<!--pyreon-app-->` still empty. So `/` → the empty shell,
 *    while `/about` → SSR.
 * 2. Every SSR page used the DEV client entry. When Netlify bundles the
 *    function into one module (`netlify dev` does; production does with
 *    `node_bundler = "esbuild"`), the server bundle's
 *    `new URL('./template.html', import.meta.url)` no longer sits beside
 *    `template.html`. The read failed, and SSR fell back to the default
 *    template, which references `/src/entry-client.ts`.
 *
 * The second is proven here the way it fails in production: the emitted
 * function is BUNDLED into a different directory with esbuild (what `netlify
 * dev` and `node_bundler = "esbuild"` do), and then invoked.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { parseCron } from '../adapters/cron'
import { dropUnrenderedTemplate, netlifyAdapter } from '../adapters/netlify'

const TMP = join(import.meta.dirname, '..', '..', '.test-netlify-node-function')

// The shape `ssr-plugin` produces: the client `index.html` is the template,
// copied next to the server bundle as `template.html`.
const TEMPLATE = `<!doctype html><html><head><!--pyreon-head--><script type="module" crossorigin src="/assets/index-abc123.js"></script></head><body><div id="app"><!--pyreon-app--></div><!--pyreon-scripts--></body></html>`

// A stand-in for the real `entry-server.js` that fails the same way when its
// sibling template is unreachable: it prefers the injected global, then reads
// `./template.html` relative to ITS OWN module URL, and otherwise falls back to
// a dev-entry template. `entry-server.ts:readBuiltTemplate` has the same order.
const ENTRY_SERVER = `
import { readFileSync } from "node:fs"
function readBuiltTemplate() {
  const injected = globalThis.__PYREON_SSR_TEMPLATE__
  if (typeof injected === "string" && injected.length > 0) return injected
  try { return readFileSync(new URL("./template.html", import.meta.url), "utf-8") } catch { return undefined }
}
const template = readBuiltTemplate() ?? '<script type="module" src="/src/entry-client.ts"></script><!--pyreon-app-->'
export default async function handler() {
  return new Response(template.replace("<!--pyreon-app-->", "<h1>SSR</h1>"), { headers: { "content-type": "text/html" } })
}
`

async function setup(): Promise<{ client: string; server: string; outDir: string }> {
  await rm(TMP, { recursive: true, force: true })
  const client = join(TMP, 'client')
  const server = join(TMP, 'server')
  await mkdir(join(client, 'assets'), { recursive: true })
  await mkdir(server, { recursive: true })
  await writeFile(join(client, 'index.html'), TEMPLATE)
  await writeFile(join(client, 'assets', 'index-abc123.js'), 'console.log(1)')
  await writeFile(join(server, 'entry-server.js'), ENTRY_SERVER)
  await writeFile(join(server, 'template.html'), TEMPLATE)
  return { client, server, outDir: join(TMP, 'out') }
}

async function buildSsr(): Promise<string> {
  const { client, server, outDir } = await setup()
  await netlifyAdapter().build({
    kind: 'ssr',
    serverEntry: join(server, 'entry-server.js'),
    clientOutDir: client,
    outDir,
    projectRoot: outDir,
    config: {},
  })
  return outDir
}

afterEach(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('netlify Node function — `/` is not shadowed by the unrendered template', () => {
  it('does not publish the SSR template as `index.html`', async () => {
    const outDir = await buildSsr()
    expect(existsSync(join(outDir, 'publish', 'index.html'))).toBe(false)
    // Everything else the client built is still published.
    expect(existsSync(join(outDir, 'publish', 'assets', 'index-abc123.js'))).toBe(true)
    // `preferStatic` stays: it is what serves hashed assets, public files and
    // prerendered pages without invoking the function.
    const func = await readFile(join(outDir, 'netlify', 'functions', 'ssr.mjs'), 'utf-8')
    expect(func).toContain('preferStatic: true')
  })

  it('keeps a PRERENDERED `index.html`: its app slot is filled, so it is a real page', async () => {
    const page = join(TMP, 'page', 'index.html')
    await mkdir(join(TMP, 'page'), { recursive: true })
    await writeFile(page, TEMPLATE.replace('<!--pyreon-app-->', '<h1>prerendered</h1>'))
    expect(await dropUnrenderedTemplate(page)).toBe(false)
    expect(existsSync(page)).toBe(true)
  })

  it('tolerates a missing `index.html`', async () => {
    expect(await dropUnrenderedTemplate(join(TMP, 'absent', 'index.html'))).toBe(false)
  })
})

describe('netlify Node function — the built template survives Netlify bundling', () => {
  it('serves the hashed client entry, not the dev one, once the function is bundled', async () => {
    const outDir = await buildSsr()
    const bundled = join(TMP, 'bundled', 'ssr.mjs')
    // A deploy whose package.json declares `sideEffects: false` (common, and
    // what generated code like lathe's emits) lets the bundler drop any
    // side-effect-only import — the shape that must not carry the template.
    await writeFile(join(outDir, 'package.json'), '{ "type": "module", "sideEffects": false }')
    await build({
      entryPoints: [join(outDir, 'netlify', 'functions', 'ssr.mjs')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: bundled,
      logLevel: 'silent',
    })
    const mod = (await import(`${pathToFileURL(bundled).href}?t=${Date.now()}`)) as {
      default: (req: Request, ctx: unknown) => Promise<Response>
    }
    const html = await (await mod.default(new Request('https://site.test/'), {})).text()
    expect(html).toContain('/assets/index-abc123.js')
    expect(html).not.toContain('/src/entry-client.ts')
    expect(html).toContain('<h1>SSR</h1>')
    delete (globalThis as { __PYREON_SSR_TEMPLATE__?: string }).__PYREON_SSR_TEMPLATE__
  })

  it('scheduled functions load the template too', async () => {
    const { client, server, outDir } = await setup()
    await netlifyAdapter().build({
      kind: 'ssr',
      serverEntry: join(server, 'entry-server.js'),
      clientOutDir: client,
      outDir,
      projectRoot: outDir,
      config: {},
      deploy: {
        edgeRoutes: [],
        nodeRoutes: [],
        schedules: [{ path: '/api/cron', schedule: '0 0 * * *', cron: parseCron('0 0 * * *'), file: 'api/cron.ts' }],
      },
    })
    const cron = await readFile(join(outDir, 'netlify', 'functions', 'cron-api-cron.mjs'), 'utf-8')
    const assign = cron.indexOf('globalThis.__PYREON_SSR_TEMPLATE__ =')
    expect(assign).toBeGreaterThanOrEqual(0)
    expect(cron).toContain('/assets/index-abc123.js')
    // Set BEFORE the server bundle is (dynamically) imported.
    expect(assign).toBeLessThan(cron.indexOf('entry-server.js'))
    expect(cron).not.toMatch(/^import .*entry-server\.js/m)
  })
})
