/**
 * @vitest-environment node
 *
 * SSR behaviour, against a REAL server, with REAL concurrency.
 *
 * The headline test is `does NOT leak between concurrent requests`. That is
 * the property a module-level `let currentRequest` silently fails — and it
 * fails in the worst possible way, by forwarding one user's session cookie
 * onto another user's render. It cannot be caught by a sequential test, so
 * this file interleaves two in-flight renders with a deliberate await
 * between the two halves of each.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import { forwardHeaders } from '../middleware'
import { getAmbientRequest, resolveAgainstAmbientOrigin } from '../request-context'
import { getRequest, runWithRequest } from '../server'

let server: Server
let origin: string

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/api/whoami') {
      setTimeout(
        () => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              cookie: req.headers.cookie ?? null,
              auth: req.headers.authorization ?? null,
              host: req.headers.host ?? null,
            }),
          )
        },
        // A real gap between request and response, so concurrent renders
        // genuinely interleave rather than completing in arrival order.
        Number(url.searchParams.get('delay') ?? 0),
      )
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

const inbound = (cookie: string, path = '/page'): { url: string; headers: Headers } => ({
  url: `${origin}${path}`,
  headers: new Headers({ cookie, authorization: `Bearer ${cookie}` }),
})

describe('origin resolution', () => {
  it('resolves a root-relative URL against the inbound origin', async () => {
    // Without this, `fetch('/api/whoami')` on the server rejects outright.
    const api = createHttp({ baseUrl: '/api' })

    const result = await runWithRequest(inbound('a=1'), () =>
      api.get('/whoami').json<{ host: string }>(),
    )

    expect(result.host).toBe(new URL(origin).host)
  })

  it('leaves an absolute URL untouched', () => {
    runWithRequest(inbound('a=1'), () => {
      expect(resolveAgainstAmbientOrigin('https://elsewhere.test/x')).toBe(
        'https://elsewhere.test/x',
      )
    })
  })

  it('is a no-op with no ambient request — the browser case', () => {
    expect(getAmbientRequest()).toBeUndefined()
    expect(resolveAgainstAmbientOrigin('/api/x')).toBe('/api/x')
  })

  it('degrades instead of throwing on an unparseable inbound URL', () => {
    runWithRequest({ url: 'not a url', headers: new Headers() }, () => {
      expect(resolveAgainstAmbientOrigin('/api/x')).toBe('/api/x')
    })
  })
})

describe('forwardHeaders', () => {
  it('forwards only the named headers', async () => {
    const api = createHttp({ baseUrl: '/api', use: [forwardHeaders(['cookie'])] })

    const result = await runWithRequest(inbound('session=abc'), () =>
      api.get('/whoami').json<{ cookie: string; auth: string | null }>(),
    )

    expect(result.cookie).toBe('session=abc')
    // `authorization` was present inbound but NOT named — it must not travel.
    expect(result.auth).toBeNull()
  })

  it('does not overwrite a header the caller set explicitly', async () => {
    const api = createHttp({ baseUrl: '/api', use: [forwardHeaders(['authorization'])] })

    const result = await runWithRequest(inbound('session=abc'), () =>
      api
        .get('/whoami', { headers: { authorization: 'Bearer explicit' } })
        .json<{ auth: string }>(),
    )

    expect(result.auth).toBe('Bearer explicit')
  })

  it('overwrites when asked', async () => {
    const api = createHttp({
      baseUrl: '/api',
      use: [forwardHeaders(['authorization'], { overwrite: true })],
    })

    const result = await runWithRequest(inbound('session=abc'), () =>
      api.get('/whoami', { headers: { authorization: 'Bearer explicit' } }).json<{ auth: string }>(),
    )

    expect(result.auth).toBe('Bearer session=abc')
  })

  it('STOPS at the origin boundary by default', async () => {
    // The SSRF-adjacent case: a client pointed at a third party must not
    // carry the user's cookie there just because a config value changed.
    const api = createHttp({ baseUrl: origin, use: [forwardHeaders(['cookie'])] })

    const result = await runWithRequest(
      { url: 'https://my-app.test/page', headers: new Headers({ cookie: 'session=secret' }) },
      () => api.get('/api/whoami').json<{ cookie: string | null }>(),
    )

    expect(result.cookie).toBeNull()
  })

  it('crosses the boundary only when explicitly allowed', async () => {
    const api = createHttp({
      baseUrl: origin,
      use: [forwardHeaders(['cookie'], { crossOrigin: true })],
    })

    const result = await runWithRequest(
      { url: 'https://my-app.test/page', headers: new Headers({ cookie: 'session=secret' }) },
      () => api.get('/api/whoami').json<{ cookie: string }>(),
    )

    expect(result.cookie).toBe('session=secret')
  })

  it('is a no-op outside runWithRequest', async () => {
    const api = createHttp({ baseUrl: `${origin}/api`, use: [forwardHeaders(['cookie'])] })
    const result = await api.get('/whoami').json<{ cookie: string | null }>()
    expect(result.cookie).toBeNull()
  })
})

describe('per-request isolation', () => {
  it('does NOT leak between CONCURRENT requests', async () => {
    // The property a module-level `let currentRequest` fails. Each render
    // awaits in the middle, so the two are genuinely interleaved: with a
    // shared slot, whichever ran second would win for BOTH.
    const api = createHttp({ baseUrl: '/api', use: [forwardHeaders(['cookie'])] })

    const render = (who: string, delay: number): Promise<string | null> =>
      runWithRequest(inbound(`session=${who}`), async () => {
        await new Promise((resolve) => setTimeout(resolve, delay))
        const first = await api
          .get('/whoami', { query: { delay: 30 } })
          .json<{ cookie: string | null }>()
        // Yield again AFTER the request, then re-read — the ambient value
        // must still be ours.
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(getRequest()?.headers.get('cookie')).toBe(`session=${who}`)
        return first.cookie
      })

    const [alice, bob] = await Promise.all([render('alice', 0), render('bob', 5)])

    expect(alice).toBe('session=alice')
    expect(bob).toBe('session=bob')
  })

  it('keeps 20 interleaved requests each on their own identity', async () => {
    const api = createHttp({ baseUrl: '/api', use: [forwardHeaders(['cookie'])] })

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        runWithRequest(inbound(`session=user${i}`), async () => {
          await new Promise((resolve) => setTimeout(resolve, (i % 5) * 3))
          return api.get('/whoami', { query: { delay: 10 } }).json<{ cookie: string }>()
        }),
      ),
    )

    expect(results.map((r) => r.cookie)).toEqual(
      Array.from({ length: 20 }, (_, i) => `session=user${i}`),
    )
  })

  it('nests, with the inner request shadowing only its own subtree', async () => {
    await runWithRequest(inbound('session=outer'), async () => {
      expect(getRequest()?.headers.get('cookie')).toBe('session=outer')

      await runWithRequest(inbound('session=inner'), async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        expect(getRequest()?.headers.get('cookie')).toBe('session=inner')
      })

      expect(getRequest()?.headers.get('cookie')).toBe('session=outer')
    })
  })

  it('exposes nothing after the scope exits', () => {
    runWithRequest(inbound('session=x'), () => undefined)
    expect(getRequest()).toBeUndefined()
  })
})
