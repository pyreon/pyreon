/**
 * The dev-server SSR handler, and the LPIH cache write.
 *
 * `_handleSsrRequest` is what renders a page in `vite dev`. It builds a
 * WHATWG `Request` from a node `IncomingMessage`, and every field it
 * defaults is one an app's handler will read: a lost `Host` means a
 * router computing absolute URLs points at the wrong origin, a lost
 * method turns a POST into a GET, and a dropped header loses the cookie
 * an auth loader needs. None of that throws — the page renders, signed
 * out or pointing somewhere else.
 *
 * `transformIndexHtml` is the load-bearing step: without it the response
 * ships without Vite's HMR client, so the page renders once and never
 * updates, and the author blames their own code.
 *
 * The cache endpoint accepts a POST from the browser bridge. It writes
 * to the project root, so the size cap is a real defence rather than
 * tidiness — and a failed write must warn and 500 rather than crash the
 * dev server, because the bridge retries on an interval and would take
 * the server down with it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _handleSsrRequest, writeLpihCacheFile } from '../index'

interface Captured {
  status?: number
  headers: Record<string, string>
  body?: string
  nexted: boolean
}

function harness(opts: {
  handler?: unknown
  transform?: (url: string, html: string) => Promise<string>
} = {}) {
  const seen: { request?: Request; transformedUrl?: string } = {}
  const cap: Captured = { headers: {}, nexted: false }

  const server = {
    ssrLoadModule: async () => ({
      handler: opts.handler ?? (async (request: Request) => {
        seen.request = request
        return new Response('<html><body>hi</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html', 'x-custom': 'v' },
        })
      }),
    }),
    transformIndexHtml: opts.transform ?? (async (url: string, html: string) => {
      seen.transformedUrl = url
      return `${html}<!--transformed-->`
    }),
  }

  const res = {
    set statusCode(v: number) { cap.status = v },
    get statusCode() { return cap.status ?? 200 },
    setHeader: (k: string, v: string) => { cap.headers[k.toLowerCase()] = v },
    // Assigning only when defined: under exactOptionalPropertyTypes an
    // explicit `undefined` is not the same as an absent key, and the
    // specs below distinguish "responded with nothing" from "fell
    // through without responding".
    end: (b?: string) => { if (b !== undefined) cap.body = b },
  }

  const run = (
    url: string,
    req: Record<string, unknown> = {},
  ) => _handleSsrRequest(
    server as never,
    '/entry-server.ts',
    url,
    { method: 'GET', headers: {}, ...req } as never,
    res as never,
    () => { cap.nexted = true },
  )

  return { run, cap, seen }
}

afterEach(() => { vi.restoreAllMocks() })

describe('the dev handler renders and transforms', () => {
  it('renders the page and runs it through transformIndexHtml', async () => {
    // Without the transform the response ships with no HMR client: the
    // page renders once and never updates, and the author blames their
    // own code.
    const h = harness()
    await h.run('/about')
    expect(h.cap.body).toContain('hi')
    expect(h.cap.body, 'the HMR transform must run').toContain('<!--transformed-->')
    expect(h.seen.transformedUrl, 'and be told which URL').toBe('/about')
  })

  it('forwards the status and every response header', async () => {
    const h = harness({
      handler: async () => new Response('x', { status: 404, headers: { 'x-a': '1', 'x-b': '2' } }),
    })
    await h.run('/missing')
    expect(h.cap.status).toBe(404)
    expect(h.cap.headers['x-a']).toBe('1')
    expect(h.cap.headers['x-b']).toBe('2')
  })

  it('falls through when the entry exports NO handler', async () => {
    // A half-written entry, or one exporting a differently-named symbol.
    // Rendering nothing would blank the page; `next()` lets Vite serve
    // its own 404, which at least says what happened.
    const h = harness({ handler: undefined })
    const server = { ssrLoadModule: async () => ({}), transformIndexHtml: async (_: string, s: string) => s }
    const cap = { nexted: false }
    await _handleSsrRequest(
      server as never, '/e.ts', '/', { method: 'GET', headers: {} } as never,
      { setHeader: () => {}, end: () => {} } as never,
      () => { cap.nexted = true },
    )
    expect(cap.nexted).toBe(true)
    expect(h.cap.body).toBeUndefined()
  })
})

describe('the Request is built faithfully from the node message', () => {
  it('carries the method', async () => {
    // A POST arriving as a GET means an action handler never runs and
    // the page renders as if nothing was submitted.
    const h = harness()
    await h.run('/submit', { method: 'POST' })
    expect(h.seen.request?.method).toBe('POST')
  })

  it('defaults a MISSING method to GET rather than crashing', async () => {
    // Node types it optional, and some proxies omit it.
    const h = harness()
    await h.run('/', { method: undefined })
    expect(h.seen.request?.method).toBe('GET')
  })

  it('uses the Host header as the origin', async () => {
    // A router computing absolute URLs — canonical links, redirects —
    // points at the wrong host otherwise, and only on the deployed
    // preview where the host is not localhost.
    const h = harness()
    await h.run('/a', { headers: { host: 'preview.example.com:3000' } })
    expect(h.seen.request?.url).toContain('preview.example.com:3000')
  })

  it('falls back to localhost when there is NO Host header', async () => {
    // `new URL('/a', 'http://undefined')` throws, which would 500 the
    // dev server on a request from a client that omits it.
    const h = harness()
    await h.run('/a', { headers: {} })
    expect(h.seen.request?.url).toContain('localhost')
  })

  it('forwards headers, joining a repeated one', async () => {
    // A cookie lost here signs the user out in dev only, which reads as
    // an auth bug in their app.
    const h = harness()
    await h.run('/', {
      headers: { cookie: 'session=abc', 'x-multi': ['a', 'b'], 'x-empty': undefined },
    })
    expect(h.seen.request?.headers.get('cookie')).toBe('session=abc')
    expect(h.seen.request?.headers.get('x-multi')).toBe('a, b')
    expect(h.seen.request?.headers.has('x-empty'), 'an undefined value is dropped').toBe(false)
  })

  it('preserves the query string', async () => {
    const h = harness()
    await h.run('/search?q=hello&page=2')
    const u = new URL(h.seen.request!.url)
    expect(u.searchParams.get('q')).toBe('hello')
    expect(u.searchParams.get('page')).toBe('2')
  })
})

describe('the LPIH cache write validates before it touches disk', () => {
  const tmpFile = (name = 'c.json') =>
    join(mkdtempSync(join(tmpdir(), 'pyreon-lpih-')), name)

  it('writes a well-formed payload, RE-SERIALIZED', () => {
    // Re-serializing is what makes the on-disk format stable regardless
    // of how the browser bridge encoded it — the LSP reads this file.
    const path = tmpFile('.pyreon-lpih.json')
    return writeLpihCacheFile(path, '{ "fires" : [ 1 ] }').then(() => {
      expect(readFileSync(path, 'utf8')).toBe('{"fires":[1]}')
    })
  })

  for (const [label, body] of [
    ['not JSON at all', '{ truncated'],
    ['a bare array', '[]'],
    ['null', 'null'],
    ['a number', '42'],
    ['an object with no fires', '{"other":1}'],
    ['fires that is not an array', '{"fires":{}}'],
  ] as Array<[string, string]>) {
    it(`REFUSES ${label}`, async () => {
      // The body is posted by the browser. Writing whatever arrives into
      // the project root would leave the LSP parsing garbage — and it
      // reads this file to answer inlay hints, so the failure surfaces
      // as the editor going quiet rather than as a bad write.
      await expect(writeLpihCacheFile(tmpFile(), body), label).rejects.toThrow(/LPIH/)
    })
  }

  it('names WHICH problem it found', () => {
    // Two different fixes: a serializer bug versus a payload shape.
    return Promise.all([
      writeLpihCacheFile(tmpFile(), '{ bad').catch((e: Error) => e.message),
      writeLpihCacheFile(tmpFile(), '{"other":1}').catch((e: Error) => e.message),
    ]).then(([a, b]) => {
      expect(a).toContain('not valid JSON')
      expect(b).toContain('fires')
    })
  })

  it('REJECTS rather than throwing synchronously on an unwritable path', async () => {
    // The caller attaches a `.catch` that warns and 500s. A synchronous
    // throw would escape it and take the dev server down — and the
    // browser bridge retries on an interval, so it would happen again.
    await expect(
      writeLpihCacheFile(join(tmpdir(), 'no', 'such', 'dir', 'f.json'), '{"fires":[]}'),
    ).rejects.toBeTruthy()
  })

  it('leaves NO temp file behind when the write fails', () => {
    // The tmp name carries a pid+seq so it never collides — which also
    // means a leaked one accumulates forever rather than being
    // overwritten.
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-lpih-'))
    return writeLpihCacheFile(join(dir, 'no', 'f.json'), '{"fires":[]}')
      .catch(() => {})
      .then(async () => {
        const { readdirSync } = await import('node:fs')
        expect(readdirSync(dir)).toEqual([])
      })
  })

  it('overwrites an existing cache rather than appending', () => {
    // The bridge posts a full snapshot each interval; appending would
    // grow the file without bound and produce invalid JSON.
    const path = tmpFile()
    return writeLpihCacheFile(path, '{"fires":[1]}')
      .then(() => writeLpihCacheFile(path, '{"fires":[2]}'))
      .then(() => {
        expect(readFileSync(path, 'utf8')).toBe('{"fires":[2]}')
      })
  })
})
