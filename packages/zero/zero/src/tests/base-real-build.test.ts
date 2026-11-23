/**
 * Real `vite build`s of `examples/fixtures/ssr-showcase` under each kind of
 * base (#4269). zero has TWO bases (see `routeBaseOf` in config.ts): the ROUTE
 * base (router links, `__ZERO_BASE__`, the server's routing) and the ASSET
 * base (Vite's resolved base: chunks, preloads, CSS). A review found that
 * using Vite's raw base for both turned a CDN base into
 * `href="/https://cdn.example.com/x/about"` and a `./` base into a route base
 * of `/.`. These builds pin what each base must produce in the emitted HTML
 * and the rendered SSR response.
 *
 * Client navigation, `vite preview` and hydration under a base are covered in
 * real Chromium by `e2e/ssg-subpath.spec.ts` and `e2e/ssg-cdn-base.spec.ts`.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import pyreon from '@pyreon/vite-plugin'
import { build, createServer } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import type { ZeroConfig } from '../types'
import { zeroPlugin } from '../vite-plugin'

const SHOWCASE = resolve(import.meta.dirname, '../../../../../examples/fixtures/ssr-showcase')
const CDN = 'https://cdn.example.com/x/'
const outDirs: string[] = []

afterAll(() => {
  for (const d of outDirs) rmSync(d, { recursive: true, force: true })
})

async function buildShowcase(viteBase: string | undefined, zero: ZeroConfig): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), 'pyreon-base-build-'))
  outDirs.push(outDir)
  await build({
    root: SHOWCASE,
    configFile: false,
    logLevel: 'silent',
    ...(viteBase !== undefined ? { base: viteBase } : {}),
    plugins: [pyreon(), zeroPlugin({ ssg: { paths: ['/', '/about'] }, ...zero })],
    build: { outDir, emptyOutDir: true },
  })

  return outDir
}

/**
 * Render one URL through the BUILT server entry in a separate Node process —
 * the test process already holds its own @pyreon/runtime-server, and two
 * instances in one process is exactly what the runtime refuses.
 */
function renderBuilt(dist: string, url: string): { status: number; html: string } {
  const entry = pathToFileURL(join(dist, 'server', 'entry-server.js')).href
  const script = `const h = (await import(${JSON.stringify(entry)})).default
const r = await h(new Request(${JSON.stringify(url)}))
process.stdout.write(JSON.stringify({ status: r.status, html: await r.text() }))`
  const out = execFileSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8', cwd: dist })

  return JSON.parse(out) as { status: number; html: string }
}

const attrs = (html: string, name: 'href' | 'src'): string[] =>
  [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) => m[1] as string)

const anchorHrefs = (html: string): string[] =>
  [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1] as string)

const assetUrls = (html: string): string[] =>
  [...attrs(html, 'href'), ...attrs(html, 'src')].filter((u) => /\/assets\//.test(u))

// No skip: the fixture is part of the repo, so a missing one is a failure.
describe('zero base — real builds (#4269)', () => {
  it('SSG with only a Vite path base (CLI --base / inline build({ base })): routes AND assets under it', async () => {
    const dist = await buildShowcase('/sub/', { mode: 'ssg' })
    const about = readFileSync(join(dist, 'about', 'index.html'), 'utf8')
    expect(anchorHrefs(about)).toContain('/sub/about')
    expect(anchorHrefs(about).filter((h) => h.startsWith('/') && !h.startsWith('/sub/'))).toEqual([])
    expect(assetUrls(about).length).toBeGreaterThan(0)
    expect(assetUrls(about).filter((u) => !u.startsWith('/sub/assets/'))).toEqual([])
  }, 120_000)

  it('SSG with a CDN asset base: assets on the CDN, routes stay root-relative', async () => {
    const dist = await buildShowcase(CDN, { mode: 'ssg' })
    const about = readFileSync(join(dist, 'about', 'index.html'), 'utf8')
    expect(anchorHrefs(about)).toContain('/about')
    expect(about).not.toContain('href="/https:')
    expect(assetUrls(about).length).toBeGreaterThan(0)
    expect(assetUrls(about).filter((u) => !u.startsWith(`${CDN}assets/`))).toEqual([])
  }, 120_000)

  it('SSG with a relative ./ base is rejected with the fix, not shipped broken below the root', async () => {
    await expect(buildShowcase('./', { mode: 'ssg' })).rejects.toThrow(
      /\[Pyreon\] A relative base \(`\.\/`\) is not supported with zero mode "ssg"/,
    )
  }, 120_000)

  it('zero({ base }) must be a path: a CDN URL there is rejected and pointed at vite.config.base', async () => {
    await expect(buildShowcase(undefined, { mode: 'ssg', base: CDN })).rejects.toThrow(
      /`base` must be a root-relative path[\s\S]*vite\.config\.ts/,
    )
  }, 120_000)

  it('zero({ base: "/sub" }) without a trailing slash routes and serves under /sub/', async () => {
    const dist = await buildShowcase(undefined, { mode: 'ssg', base: '/sub' })
    const about = readFileSync(join(dist, 'about', 'index.html'), 'utf8')
    expect(anchorHrefs(about)).toContain('/sub/about')
    expect(anchorHrefs(about).filter((h) => h.startsWith('/') && !h.startsWith('/sub/'))).toEqual([])
    expect(assetUrls(about).filter((u) => !u.startsWith('/sub/assets/'))).toEqual([])
  }, 120_000)

  it('SSG i18n locale pages render under a Vite path base (dist/de/about, every URL under /sub/)', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'pyreon-base-build-'))
    outDirs.push(outDir)
    await build({
      root: SHOWCASE,
      configFile: false,
      logLevel: 'silent',
      base: '/sub/',
      plugins: [
        pyreon(),
        zeroPlugin({
          mode: 'ssg',
          i18n: { locales: ['en', 'de'], defaultLocale: 'en', strategy: 'prefix-except-default' },
        }),
      ],
      build: { outDir, emptyOutDir: true },
    })
    const deAbout = readFileSync(join(outDir, 'de', 'about', 'index.html'), 'utf8')
    expect(deAbout).toContain('data-testid="about-page"')
    // The fixture's nav uses plain RouterLinks (`/about`), not locale links,
    // so a locale page links `/sub/about`; what matters is that nothing
    // escapes the base.
    expect(anchorHrefs(deAbout)).toContain('/sub/about')
    expect(anchorHrefs(deAbout).filter((h) => h.startsWith('/') && !h.startsWith('/sub/'))).toEqual([])
    expect(assetUrls(deAbout).filter((u) => !u.startsWith('/sub/assets/'))).toEqual([])
    const enAbout = readFileSync(join(outDir, 'about', 'index.html'), 'utf8')
    expect(anchorHrefs(enAbout)).toContain('/sub/about')
  }, 120_000)

  it('SPA with a relative ./ base builds and keeps its asset URLs relative', async () => {
    const dist = await buildShowcase('./', { mode: 'spa' })
    const index = readFileSync(join(dist, 'index.html'), 'utf8')
    expect(attrs(index, 'src').some((u) => u.startsWith('./assets/'))).toBe(true)
    expect(assetUrls(index).filter((u) => u.startsWith('/assets/'))).toEqual([])
  }, 120_000)

  it('SSR with a CDN asset base: the server routes at / and renders CDN asset URLs', async () => {
    const dist = await buildShowcase(CDN, { mode: 'ssr', adapter: 'node' })
    const { status, html } = renderBuilt(dist, 'http://localhost/about')
    expect(status).toBe(200)
    expect(anchorHrefs(html)).toContain('/about')
    expect(html).not.toContain('href="/https:')
    expect(assetUrls(html).filter((u) => !u.startsWith(`${CDN}assets/`))).toEqual([])
  }, 120_000)

  it('SSR with only a Vite path base: the server routes under it', async () => {
    const dist = await buildShowcase('/sub/', { mode: 'ssr', adapter: 'node' })
    const { status, html } = renderBuilt(dist, 'http://localhost/sub/about')
    expect(status).toBe(200)
    expect(anchorHrefs(html)).toContain('/sub/about')
    expect(assetUrls(html).filter((u) => !u.startsWith('/sub/assets/'))).toEqual([])
  }, 120_000)

  it('dev server under a Vite path base renders the page with base-prefixed links', async () => {
    const server = await createServer({
      root: SHOWCASE,
      configFile: false,
      logLevel: 'silent',
      base: '/blog/',
      plugins: [pyreon(), zeroPlugin({ mode: 'ssr' })],
      server: { port: 0, strictPort: false, hmr: false },
    })
    try {
      await server.listen()
      const address = server.httpServer?.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const res = await fetch(`http://localhost:${port}/blog/about`, { headers: { accept: 'text/html' } })
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('data-testid="about-page"')
      expect(anchorHrefs(html)).toContain('/blog/about')
    } finally {
      await server.close()
    }
  }, 120_000)
})
