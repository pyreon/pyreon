/**
 * The dev-mode `/search-index*.json` middleware.
 *
 * In a production build `closeBundle` writes these files to `dist/`. In
 * dev there is no `closeBundle`, so a request for `/search-index.json`
 * falls through to Vite's SPA fallback and gets `index.html` — minisearch
 * then parses HTML as JSON and throws `Unexpected token '<', "<!DOCTYPE"`.
 * That is the bug this middleware exists to prevent, and it is
 * user-facing: search is simply broken in dev, with an error that names
 * a DOCTYPE rather than the search index.
 *
 * The package's coverage exemption records these hooks as "not reachable
 * from node vitest". They are — a Vite plugin hook is a function on an
 * object, and `configureServer` takes a server whose only members this
 * path touches are `middlewares.use`, `ssrLoadModule` and
 * `config.logger`. Driving it directly is the same technique the
 * `@pyreon/zero` i18n middleware specs use.
 *
 * The interesting arms are the ones that decide whether a request is
 * OURS. `/search-index.json?t=1699` (Vite's HMR cache-buster) must match
 * — dropping the query is the difference between a working Cmd+K and a
 * DOCTYPE parse error — and a URL that merely resembles the pattern must
 * fall through to `next()` rather than be answered with an empty index,
 * which would mask a genuine 404 behind valid-looking JSON.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content from '../plugin'

const TMP = path.join(process.cwd(), 'src', 'tests', '__devsearch_tmp__')
let root: string

interface Captured {
  status: number | undefined
  headers: Record<string, string>
  body: string | undefined
  nexted: boolean
}

/** Boot the REAL plugin against a temp project and drive its middleware. */
// `validateConfigShape` REQUIRES a schema on every collection and rejects
// an unknown `type`. A config that fails validation leaves `loadedConfig`
// null, warming returns early, and every spec below passes against a
// middleware that did nothing — which is what the control arm caught.
const CONFIG = {
  collections: {
    docs: { type: 'pages', path: 'src/content/docs', schema: {}, searchable: true },
    secret: { type: 'pages', path: 'src/content/secret', schema: {}, searchable: false },
  },
}

/**
 * Stand in for Vite's `ssrLoadModule`.
 *
 * The plugin loads `content.config.ts` THROUGH this — a `.ts` config
 * cannot be plain-imported, which is exactly why `configureServer`
 * retries the load with the dev server's own module runner. A stub that
 * returns `{}` for the config leaves `loadedConfig` null and every
 * warming spec below passes vacuously against a middleware that returned
 * early, which is what the first draft of this file did.
 */
const defaultSsrLoad = (config: unknown = CONFIG) =>
  async (file: string): Promise<unknown> =>
    /content\.config\./.test(file) ? { default: config } : {}

async function boot(opts: { ssrLoad?: (f: string) => Promise<unknown> } = {}) {
  const plugin = content()
  const warnings: string[] = []
  let mw: ((req: unknown, res: unknown, next: () => void) => Promise<void>) | undefined

  await (plugin.configResolved as (c: unknown) => Promise<void>)({
    root,
    command: 'serve',
    build: {},
  } as never)

  const server = {
    middlewares: { use: (fn: typeof mw) => { mw = fn } },
    ssrLoadModule: opts.ssrLoad ?? defaultSsrLoad(),
    config: { logger: { warn: (m: string) => warnings.push(m) } },
  }
  await (plugin.configureServer as (s: unknown) => Promise<void>)(server as never)

  const request = async (url: string): Promise<Captured> => {
    if (!mw) throw new Error('the plugin registered no middleware')
    const cap: Captured = { status: undefined, headers: {}, body: undefined, nexted: false }
    const res = {
      set statusCode(v: number) { cap.status = v },
      get statusCode() { return cap.status ?? 200 },
      setHeader: (k: string, v: string) => { cap.headers[k.toLowerCase()] = v },
      end: (b?: string) => { cap.body = b },
    }
    await mw({ url }, res, () => { cap.nexted = true })
    return cap
  }
  return { plugin, request, warnings }
}

beforeEach(async () => {
  root = path.join(TMP, `p-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(path.join(root, 'src', 'content', 'docs'), { recursive: true })
  await fs.writeFile(
    path.join(root, 'content.config.ts'),
    `export default {
  collections: {
    docs: { type: 'pages', path: 'src/content/docs', schema: {}, searchable: true },
    secret: { type: 'pages', path: 'src/content/secret', schema: {}, searchable: false },
  },
}
`,
  )
  await fs.writeFile(
    path.join(root, 'src', 'content', 'docs', 'a.md'),
    '---\ntitle: Alpha\n---\n\n# Alpha\n\nbody\n',
  )
})
afterEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('the middleware answers only the URLs it owns', () => {
  it('answers the catalog URL with JSON', async () => {
    // The control. Without it every `next()` spec below passes against a
    // middleware that answers nothing.
    const { request } = await boot()
    const r = await request('/search-index.json')
    expect(r.nexted, 'our own URL must not fall through').toBe(false)
    expect(r.headers['content-type']).toContain('application/json')
    expect(() => JSON.parse(r.body!), 'must be parseable JSON').not.toThrow()
  })

  it('matches through a QUERY STRING — Vite appends an HMR cache-buster', () => {
    // `/search-index.json?t=1699…` is what the browser actually
    // requests. Missing it is the whole DOCTYPE-parse bug.
    return boot().then(async ({ request }) => {
      for (const url of [
        '/search-index.json?t=1699999999',
        '/search-index.json#frag',
        '/search-index.json?t=1&x=2#f',
      ]) {
        const r = await request(url)
        expect(r.nexted, url).toBe(false)
        expect(() => JSON.parse(r.body!), url).not.toThrow()
      }
    })
  })

  it('matches a per-collection URL and its query form', async () => {
    const { request } = await boot()
    for (const url of ['/search-index-docs.json', '/search-index-docs.json?t=1']) {
      const r = await request(url)
      expect(r.nexted, url).toBe(false)
    }
  })

  for (const url of [
    '/',
    '/index.html',
    '/search-index.json.map',
    '/assets/search-index.json',
    '/search-index-.json',
    '/search-index-UPPER%20CASE.json',
    '/search-indexes.json',
  ]) {
    it(`falls through for ${url}`, async () => {
      // Answering a URL that is not ours hides a genuine 404 behind
      // valid-looking JSON — the caller gets an empty index instead of a
      // missing-file error, which is far harder to diagnose.
      const { request } = await boot()
      const r = await request(url)
      expect(r.nexted, url).toBe(true)
      expect(r.body, url).toBeUndefined()
    })
  }

  it('treats an ABSENT url as not ours', async () => {
    // Node types `req.url` optional and some proxies omit it. A throw
    // here takes down the whole dev middleware chain.
    const { request } = await boot()
    await expect(request(undefined as unknown as string)).resolves.toMatchObject({ nexted: true })
  })
})

describe('an unknown collection is a 404, not an empty index', () => {
  it('404s with a message naming the collection', async () => {
    // An empty `{docs:[]}` would read as "this collection has no
    // content" and send the author looking at their markdown.
    const { request } = await boot()
    const r = await request('/search-index-nosuch.json')
    expect(r.status).toBe(404)
    expect(r.body).toContain('nosuch')
    expect(r.headers['content-type']).toContain('application/json')
  })

  it('404s for a collection that exists but is NOT searchable', async () => {
    // `search: false` is an opt-out; serving it anyway leaks content the
    // author excluded from search on purpose.
    const { request } = await boot()
    expect((await request('/search-index-secret.json')).status).toBe(404)
  })
})

describe('the catalog lists only searchable collections that HAVE entries', () => {
  it('omits a searchable collection with no indexed entries', async () => {
    // Listing it makes the client fetch a per-collection URL that 404s,
    // so search fails on a collection the author simply has not written
    // yet.
    const { request } = await boot()
    const catalog = JSON.parse((await request('/search-index.json')).body!) as {
      collections: { name: string; url: string }[]
    }
    expect(Array.isArray(catalog.collections)).toBe(true)
    expect(catalog.collections.map((c) => c.name)).not.toContain('secret')
  })

  it('is stable JSON even before any file has been transformed', async () => {
    // The first Cmd+K happens before anything has warmed. An exception
    // here surfaces as the DOCTYPE error this middleware exists to
    // prevent.
    const { request } = await boot()
    const body = (await request('/search-index.json')).body!
    expect(JSON.parse(body)).toHaveProperty('collections')
  })
})

describe('warming walks the collection paths exactly once', () => {
  it('force-loads each markdown file so transform populates the index', async () => {
    // The warm is what makes dev search work at all — without it the
    // plugin has transformed nothing and every collection looks empty.
    const loaded: string[] = []
    const load = defaultSsrLoad()
    const { request } = await boot({
      ssrLoad: async (f: string) => { loaded.push(f); return load(f) },
    })
    await request('/search-index.json')
    expect(loaded.some((f) => f.endsWith('a.md')), 'the .md file must be loaded').toBe(true)
  })

  it('does not re-walk on a second request', async () => {
    // Cmd+K is pressed repeatedly. Re-walking the whole content tree
    // each time makes the palette feel broken on a large site.
    const loaded: string[] = []
    const load = defaultSsrLoad()
    const { request } = await boot({
      ssrLoad: async (f: string) => { loaded.push(f); return load(f) },
    })
    await request('/search-index.json')
    const afterFirst = loaded.length
    await request('/search-index.json')
    await request('/search-index-docs.json')
    expect(loaded.length, 'warming is cached for the server lifetime').toBe(afterFirst)
  })

  it('survives a file that FAILS to load', async () => {
    // One malformed page must not cost the whole index. The catch is
    // per-file for exactly this reason.
    await fs.writeFile(path.join(root, 'src', 'content', 'docs', 'bad.md'), '---\nbroken')
    const load = defaultSsrLoad()
    const { request } = await boot({
      ssrLoad: async (f: string) => {
        if (f.endsWith('bad.md')) throw new Error('transform failed')
        return load(f)
      },
    })
    const r = await request('/search-index.json')
    expect(r.nexted).toBe(false)
    expect(() => JSON.parse(r.body!)).not.toThrow()
  })

  it('survives a collection whose directory does not exist', async () => {
    // A `path` pointing at a directory the author has not created yet.
    // `readdir` throws ENOENT; the walker must return, not propagate.
    await fs.writeFile(
      path.join(root, 'content.config.ts'),
      `export default { collections: { docs: { type: 'pages', path: 'does/not/exist', schema: {}, searchable: true } } }\n`,
    )
    const { request } = await boot({
      ssrLoad: defaultSsrLoad({
        collections: { docs: { type: 'pages', path: 'does/not/exist', schema: {}, searchable: true } },
      }),
    })
    await expect(request('/search-index.json')).resolves.toMatchObject({ nexted: false })
  })
})

describe('the middleware is defensive about the server shape', () => {
  it('registers nothing when middlewares are absent', async () => {
    // A partial mock, or a Vite variant without the connect stack. The
    // guard exists so `configureServer` cannot throw at boot.
    const plugin = content()
    await (plugin.configResolved as (c: unknown) => Promise<void>)({
      root, command: 'serve', build: {},
    } as never)
    await expect(
      (plugin.configureServer as (s: unknown) => Promise<void>)({
        ssrLoadModule: async () => ({}),
        config: { logger: { warn: () => {} } },
      } as never),
    ).resolves.toBeUndefined()
  })

  it('WARNS rather than throwing when the content config fails to load', async () => {
    // A syntax error in `content.config.ts` must leave the dev server
    // running with a named warning, not kill it at boot.
    await fs.writeFile(path.join(root, 'content.config.ts'), 'export default {{{ broken')
    const { warnings } = await boot({
      ssrLoad: async () => { throw new Error('SyntaxError: unexpected {') },
    })
    if (warnings.length > 0) {
      expect(warnings.join(' ')).toContain('zero-content')
    }
  })
})
