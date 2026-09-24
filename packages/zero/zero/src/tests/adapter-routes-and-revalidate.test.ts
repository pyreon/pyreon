/**
 * Two deploy-artifact contracts that fail silently in production.
 *
 * **`_routes.json` excludes.** Cloudflare Pages reads this file to decide
 * which URLs bypass the worker. The adapter fills it from the SSG pass's
 * `_pyreon-ssg-paths.json`, so a prerendered page is served straight off
 * the static layer. Get the parse wrong and the deploy still *works* —
 * every request just invokes the worker and re-renders a page that was
 * already on disk, which is a latency and a billing regression nobody
 * gets an error about. Get it wrong the other way — trusting a
 * non-string or a relative entry — and Cloudflare rejects the file, so a
 * malformed manifest from a partial build must degrade to "no excludes"
 * rather than to a broken config.
 *
 * **`revalidate()`.** This is called from a production webhook: a CMS
 * publishes, the adapter purges. Every failure mode is a stale page that
 * nobody notices for hours. The env-var guard is the common one — a
 * forgotten token returns `regenerated: false` and the author is left
 * wondering why publishing does nothing — and the URL join is the
 * subtle one, because a doubled or missing slash purges a URL that does
 * not exist and reports success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cloudflareAdapter } from '../adapters/cloudflare'
import { vercelAdapter } from '../adapters/vercel'
import { CLOUDFLARE_ADAPTER_OUTPUT } from '../adapters/contract'

const ENV_KEYS = [
  'CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_SITE_URL',
  'VERCEL_DEPLOYMENT_URL', 'VERCEL_URL', 'VERCEL_REVALIDATE_TOKEN',
] as const

let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.restoreAllMocks()
})

// ─────────────────────────────── _routes.json ───────────────────────────────

/** Run the REAL cloudflare SSR build over a temp tree and read back the config. */
async function buildAndReadRoutes(ssgManifest?: unknown): Promise<{
  version: number
  include: string[]
  exclude: string[]
}> {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-cf-'))
  const outDir = join(root, 'dist')
  const clientOutDir = join(root, 'client')
  mkdirSync(outDir, { recursive: true })
  mkdirSync(clientOutDir, { recursive: true })
  writeFileSync(join(clientOutDir, 'index.html'), '<html></html>')
  const serverEntry = join(root, 'entry-server.js')
  writeFileSync(serverEntry, 'export default {}')
  if (ssgManifest !== undefined) {
    writeFileSync(
      join(outDir, '_pyreon-ssg-paths.json'),
      typeof ssgManifest === 'string' ? ssgManifest : JSON.stringify(ssgManifest),
    )
  }

  await cloudflareAdapter().build!({
    kind: 'ssr',
    serverEntry,
    clientOutDir,
    outDir,
    projectRoot: root,
    config: {} as never,
  } as never)

  return JSON.parse(
    readFileSync(join(outDir, CLOUDFLARE_ADAPTER_OUTPUT.routesFile), 'utf8'),
  ) as never
}

describe('_routes.json excludes the pages the SSG pass already rendered', () => {
  it('lists every prerendered path', async () => {
    // The control. Without it, "malformed manifest yields no excludes"
    // passes against an adapter that never reads the manifest at all.
    const cfg = await buildAndReadRoutes({ paths: ['/', '/about', '/blog/one'] })
    expect(cfg.exclude).toContain('/about')
    expect(cfg.exclude).toContain('/blog/one')
    expect(cfg.include, 'the worker still handles everything else').toEqual(['/*'])
  })

  it('always excludes the static asset prefix and the well-known files', async () => {
    // These are static regardless of prerendering; invoking a worker for
    // `robots.txt` is pure waste on every crawl.
    const cfg = await buildAndReadRoutes()
    for (const path of ['/favicon.*', '/robots.txt', '/sitemap.xml', '/site.webmanifest']) {
      expect(cfg.exclude, path).toContain(path)
    }
  })

  it('DROPS an entry that is not an absolute path', async () => {
    // Cloudflare requires leading-slash globs. A relative entry makes it
    // reject the whole file, which silently un-excludes every genuinely
    // prerendered page too.
    const cfg = await buildAndReadRoutes({ paths: ['/good', 'relative', './also-bad'] })
    expect(cfg.exclude).toContain('/good')
    expect(cfg.exclude).not.toContain('relative')
    expect(cfg.exclude).not.toContain('./also-bad')
  })

  it('DROPS a non-string entry', async () => {
    // What a hand-edited or partially-written manifest looks like.
    const cfg = await buildAndReadRoutes({ paths: ['/good', 42, null, { path: '/x' }, ['/y']] })
    expect(cfg.exclude).toContain('/good')
    expect(cfg.exclude.filter((e) => e.startsWith('/'))).toEqual(
      expect.arrayContaining(['/good']),
    )
    expect(JSON.stringify(cfg.exclude)).not.toContain('42')
  })

  for (const [label, manifest] of [
    ['absent', undefined],
    ['not JSON', '{ truncated'],
    ['missing the paths key', {}],
    ['paths not an array', { paths: 'all' }],
    ['paths null', { paths: null }],
  ] as Array<[string, unknown]>) {
    it(`degrades to no excludes when the manifest is ${label}`, async () => {
      // Every path then hits the worker, which still RENDERS correctly —
      // slower, but never broken. Throwing here would fail the deploy.
      const cfg = await buildAndReadRoutes(manifest)
      expect(cfg.version).toBe(1)
      expect(cfg.exclude.some((e) => e === '/about'), label).toBe(false)
      expect(cfg.exclude.length, 'the static defaults survive').toBeGreaterThan(0)
    })
  }
})

// ─────────────────────────────── revalidate ────────────────────────────────

describe('cloudflare revalidate', () => {
  const cf = cloudflareAdapter()

  it('refuses and names EVERY missing variable', async () => {
    // The author has to know which one to set. "Something is missing" on
    // a webhook that silently does nothing is the worst version of this.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await cf.revalidate!('/p')
    expect(out.regenerated).toBe(false)
    const msg = warn.mock.calls.flat().join(' ')
    for (const k of ['CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_SITE_URL']) {
      expect(msg, k).toContain(k)
    }
  })

  it('names only the one that is missing', async () => {
    process.env.CLOUDFLARE_ZONE_ID = 'z'
    process.env.CLOUDFLARE_API_TOKEN = 't'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await cf.revalidate!('/p')
    const msg = warn.mock.calls.flat().join(' ')
    expect(msg).toContain('CLOUDFLARE_SITE_URL')
    expect(msg).not.toContain('CLOUDFLARE_ZONE_ID')
  })

  it('purges exactly one well-formed URL', async () => {
    // A doubled or missing slash purges a URL that does not exist, and
    // the API returns 200 for it — success reported, page still stale.
    process.env.CLOUDFLARE_ZONE_ID = 'zone1'
    process.env.CLOUDFLARE_API_TOKEN = 'tok'
    process.env.CLOUDFLARE_SITE_URL = 'https://site.com/'
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    expect((await cf.revalidate!('/blog/a')).regenerated).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone1/purge_cache')
    expect(JSON.parse(String(init.body))).toEqual({ files: ['https://site.com/blog/a'] })
    expect(String(init.headers ? (init.headers as Record<string, string>).Authorization : '')).toBe(
      'Bearer tok',
    )
    vi.unstubAllGlobals()
  })

  it('normalises a path given WITHOUT a leading slash', async () => {
    // Callers pass both forms; `site.comblog/a` is a plausible-looking
    // URL that purges nothing.
    process.env.CLOUDFLARE_ZONE_ID = 'z'
    process.env.CLOUDFLARE_API_TOKEN = 't'
    process.env.CLOUDFLARE_SITE_URL = 'https://site.com'
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await cf.revalidate!('blog/a')
    expect(JSON.parse(String((fetchMock.mock.calls[0] as never as [string, RequestInit])[1].body)))
      .toEqual({ files: ['https://site.com/blog/a'] })
    vi.unstubAllGlobals()
  })

  it('reports failure on a non-ok response rather than claiming success', async () => {
    // A 403 from a revoked token must not read as "page regenerated".
    process.env.CLOUDFLARE_ZONE_ID = 'z'
    process.env.CLOUDFLARE_API_TOKEN = 't'
    process.env.CLOUDFLARE_SITE_URL = 'https://site.com'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response))
    expect((await cf.revalidate!('/p')).regenerated).toBe(false)
    vi.unstubAllGlobals()
  })

  it('survives a network THROW and says which path failed', async () => {
    // A webhook handler that throws takes the CMS's request down with
    // it; the path in the message is what makes the log actionable.
    process.env.CLOUDFLARE_ZONE_ID = 'z'
    process.env.CLOUDFLARE_API_TOKEN = 't'
    process.env.CLOUDFLARE_SITE_URL = 'https://site.com'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await cf.revalidate!('/blog/a')).regenerated).toBe(false)
    expect(warn.mock.calls.flat().join(' ')).toContain('/blog/a')
    vi.unstubAllGlobals()
  })

  it('survives a non-Error rejection', async () => {
    // `err instanceof Error` is false for a thrown string; without the
    // String() arm the message reads `undefined`.
    process.env.CLOUDFLARE_ZONE_ID = 'z'
    process.env.CLOUDFLARE_API_TOKEN = 't'
    process.env.CLOUDFLARE_SITE_URL = 'https://site.com'
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'plain string' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await cf.revalidate!('/p')).regenerated).toBe(false)
    expect(warn.mock.calls.flat().join(' ')).toContain('plain string')
    vi.unstubAllGlobals()
  })
})

describe('vercel revalidate', () => {
  const vc = vercelAdapter()

  it('accepts VERCEL_URL as a fallback for VERCEL_DEPLOYMENT_URL', async () => {
    // `VERCEL_URL` is the one the platform auto-injects; requiring the
    // other would make revalidation fail on every default deploy.
    process.env.VERCEL_URL = 'my-app.vercel.app'
    process.env.VERCEL_REVALIDATE_TOKEN = 'secret'
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    expect((await vc.revalidate!('/p')).regenerated).toBe(true)
    expect(String(fetchMock.mock.calls[0]![0])).toContain('https://my-app.vercel.app/')
    vi.unstubAllGlobals()
  })

  it('does not double the scheme when the env var already carries one', async () => {
    // `https://https://…` fails DNS, and the catch reports it as a
    // network error rather than as a config mistake.
    process.env.VERCEL_DEPLOYMENT_URL = 'https://my-app.vercel.app'
    process.env.VERCEL_REVALIDATE_TOKEN = 'secret'
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await vc.revalidate!('/p')
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url.startsWith('https://my-app.vercel.app/')).toBe(true)
    expect(url).not.toContain('https://https://')
    vi.unstubAllGlobals()
  })

  it('URL-ENCODES the path and the secret', async () => {
    // A path with a query or a token with a `&` would otherwise inject
    // extra parameters into the endpoint — at best it revalidates the
    // wrong page, at worst the secret is truncated and the call 403s.
    process.env.VERCEL_URL = 'app.vercel.app'
    process.env.VERCEL_REVALIDATE_TOKEN = 'a&b=c'
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await vc.revalidate!('/blog/a b?x=1')
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain(`path=${encodeURIComponent('/blog/a b?x=1')}`)
    expect(url).toContain(`secret=${encodeURIComponent('a&b=c')}`)
    vi.unstubAllGlobals()
  })

  it('refuses and names the missing variables', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await vc.revalidate!('/p')).regenerated).toBe(false)
    expect(warn.mock.calls.flat().join(' ')).toContain('VERCEL_REVALIDATE_TOKEN')
  })

  it('survives a network throw', async () => {
    process.env.VERCEL_URL = 'app.vercel.app'
    process.env.VERCEL_REVALIDATE_TOKEN = 't'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ETIMEDOUT') }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await vc.revalidate!('/p')).regenerated).toBe(false)
    expect(warn.mock.calls.flat().join(' ')).toContain('/p')
    vi.unstubAllGlobals()
  })
})
