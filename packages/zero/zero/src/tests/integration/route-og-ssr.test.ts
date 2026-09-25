/**
 * Real-build test for the RUNTIME half of route OG images: `mode: 'ssr'`
 * builds `fixture-og`, then drives the BUILT `dist/server/entry-server.js`
 * handler (the shipped entry, not the exported function):
 *   - a page whose route exports `og` carries an ABSOLUTE og:image pointing
 *     at `/_zero/og/<path>.png` on the request origin,
 *   - that endpoint answers a valid PNG of the configured size, rendered
 *     from the per-request loader data, with CDN-revalidatable caching,
 *   - a route without `og` gets no meta and its endpoint 404s.
 */
import { cpSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import pyreon from '@pyreon/vite-plugin'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { zeroPlugin } from '../../vite-plugin'

// Each suite builds a PRIVATE copy of fixture-og: the three og/pwa suites
// run in parallel, and zero materializes its SSR/SSG entry inside the root,
// so a shared root lets one suite's cleanup delete another's entry.
const FIXTURE = resolve(import.meta.dirname, '.tmp-fixture-ogssr')
cpSync(resolve(import.meta.dirname, 'fixture-og'), FIXTURE, { recursive: true })
const DIST = join(FIXTURE, 'dist-ssr')
let handler: (req: Request) => Promise<Response>

beforeAll(async () => {
  await rm(DIST, { recursive: true, force: true })
  await build({
    root: FIXTURE,
    configFile: false,
    logLevel: 'error',
    plugins: [pyreon(), ...zeroPlugin({ mode: 'ssr', routeOg: { width: 400, height: 210 } })],
    resolve: { conditions: ['bun'] },
    build: { outDir: 'dist-ssr', emptyOutDir: true },
  })
  // The test process already loaded @pyreon/* from src (for the build);
  // the built bundle carries its own copy. Silence the dedup sentinel for
  // this deliberately-separate instance.
  process.env.PYREON_SINGLE_INSTANCE = 'silent'
  const mod = (await import(pathToFileURL(join(DIST, 'server', 'entry-server.js')).href)) as {
    default: (req: Request) => Promise<Response>
  }
  handler = mod.default
}, 180_000)

afterAll(async () => {
  await rm(FIXTURE, { recursive: true, force: true })
})

describe('route og export — SSR runtime', () => {
  it('page HTML carries an absolute og:image for the runtime endpoint', async () => {
    const res = await handler(new Request('https://site.test/posts/hello'))
    const html = await res.text()
    expect(html).toContain('<meta property="og:image" content="https://site.test/_zero/og/posts/hello.png">')
    expect(html).toContain('<meta property="og:image:width" content="400">')
  })

  it('the endpoint serves a valid PNG of the configured size from loader data', async () => {
    const res = await handler(new Request('https://site.test/_zero/og/posts/hello.png'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('s-maxage=')
    const buf = Buffer.from(await res.arrayBuffer())
    const meta = await sharp(buf).metadata()
    expect(meta.format).toBe('png')
    expect([meta.width, meta.height]).toEqual([400, 210])
    const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
    expect([data[0], data[1], data[2]]).toEqual([255, 0, 0])
  })

  it('a route without og: no meta, endpoint 404', async () => {
    const html = await (await handler(new Request('https://site.test/about'))).text()
    expect(html).not.toContain('og:image')
    const res = await handler(new Request('https://site.test/_zero/og/about.png'))
    expect(res.status).toBe(404)
  })
})
