import { describe, expect, it, vi } from 'vitest'
import { compose } from '../chain'
import { createHttp } from '../client'
import { AbortError, HttpError } from '../errors'
import { bearer, dedupe, logger, refresh, retry } from '../middleware'
import { createMock } from '../mock'
import { toHttpResponse } from '../transport'
import type { HttpMiddleware, HttpRequest, Transport } from '../types'

const req = (overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'GET',
  url: '/x',
  headers: new Headers(),
  body: null,
  signal: undefined,
  credentials: undefined,
  meta: {},
  ...overrides,
})

const ok = (): Transport => (request) =>
  Promise.resolve(toHttpResponse(new Response('{}', { status: 200 }), request))

describe('compose', () => {
  it('runs middleware outermost-first and unwinds in reverse', async () => {
    const order: string[] = []
    const tag = (name: string): HttpMiddleware => async (request, next) => {
      order.push(`>${name}`)
      const response = await next(request)
      order.push(`<${name}`)
      return response
    }

    await compose([tag('a'), tag('b')], ok())(req())

    expect(order).toEqual(['>a', '>b', '<b', '<a'])
  })

  it('lets a middleware SHORT-CIRCUIT without calling next', async () => {
    const transport = vi.fn(ok())
    const short: HttpMiddleware = (request) =>
      Promise.resolve(toHttpResponse(new Response('cached'), request))

    const response = await compose([short], transport)(req())

    expect(await response.raw.text()).toBe('cached')
    expect(transport).not.toHaveBeenCalled()
  })

  it('allows next() MORE THAN ONCE — the property retry depends on', async () => {
    const transport = vi.fn(ok())
    const twice: HttpMiddleware = async (request, next) => {
      await next(request)
      return next(request)
    }

    await compose([twice], transport)(req())

    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('reuses the current request when next() is called with no argument', async () => {
    const seen: string[] = []
    const rewrite: HttpMiddleware = (request, next) => next({ ...request, url: '/rewritten' })
    const observe: HttpMiddleware = (request, next) => {
      seen.push(request.url)
      return next()
    }

    await compose([rewrite, observe], ok())(req())

    expect(seen).toEqual(['/rewritten'])
  })

  it('returns the transport unchanged when there is no middleware', () => {
    const transport = ok()
    expect(compose([], transport)).toBe(transport)
  })
})

describe('retry', () => {
  it('replays a retryable status and returns the eventual success', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(
        toHttpResponse(new Response('{}', { status: calls < 3 ? 503 : 200 }), request),
      )
    }
    const api = createHttp({ transport, use: [retry({ limit: 3, backoff: () => 0 })] })

    expect((await api.get('/x')).status).toBe(200)
    expect(calls).toBe(3)
  })

  it('gives up after `limit` retries and surfaces the last failure', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(toHttpResponse(new Response('{}', { status: 500 }), request))
    }
    const api = createHttp({ transport, use: [retry({ limit: 2, backoff: () => 0 })] })

    await expect(api.get('/x')).rejects.toBeInstanceOf(HttpError)
    expect(calls).toBe(3) // 1 initial + 2 retries
  })

  it('does NOT replay a non-idempotent POST by default', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(toHttpResponse(new Response('{}', { status: 500 }), request))
    }
    const api = createHttp({ transport, use: [retry({ limit: 3, backoff: () => 0 })] })

    await expect(api.post('/x')).rejects.toBeInstanceOf(HttpError)
    expect(calls).toBe(1)
  })

  it('does not touch a status outside the retryable set', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(toHttpResponse(new Response('{}', { status: 404 }), request))
    }
    const api = createHttp({ transport, use: [retry({ limit: 3, backoff: () => 0 })] })

    await expect(api.get('/x')).rejects.toBeInstanceOf(HttpError)
    expect(calls).toBe(1)
  })

  it('honours Retry-After given in seconds', async () => {
    const delays: number[] = []
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(
        toHttpResponse(
          new Response('{}', {
            status: calls === 1 ? 429 : 200,
            headers: { 'retry-after': '0' },
          }),
          request,
        ),
      )
    }
    const api = createHttp({
      transport,
      use: [
        retry({
          limit: 1,
          backoff: (attempt) => {
            delays.push(attempt)
            return 5000 // would stall the test if Retry-After were ignored
          },
        }),
      ],
    })

    expect((await api.get('/x')).status).toBe(200)
    expect(delays).toEqual([]) // Retry-After won, backoff was never consulted
  })

  it('retries a transport failure when `network` is on', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      if (calls === 1) return Promise.reject(new Error('offline'))
      return Promise.resolve(toHttpResponse(new Response('{}'), request))
    }
    const api = createHttp({ transport, use: [retry({ limit: 2, backoff: () => 0 })] })

    expect((await api.get('/x')).status).toBe(200)
    expect(calls).toBe(2)
  })

  it('never replays a cancellation', async () => {
    let calls = 0
    const api = createHttp({
      use: [
        retry({ limit: 3, backoff: () => 0 }),
        createMock([{ path: '/slow', delay: 100, json: {} }]).middleware,
      ],
      transport: (request) => {
        calls += 1
        return Promise.resolve(toHttpResponse(new Response('{}'), request))
      },
    })
    const controller = new AbortController()
    const promise = api.get('/slow', { signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(AbortError)
    expect(calls).toBe(0)
  })

  it('accepts Retry-After as an HTTP date', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(
        toHttpResponse(
          new Response('{}', {
            status: calls === 1 ? 503 : 200,
            // Already in the past → clamped to a 0ms wait.
            headers: { 'retry-after': new Date(Date.now() - 1000).toUTCString() },
          }),
          request,
        ),
      )
    }
    const api = createHttp({ transport, use: [retry({ limit: 1, backoff: () => 5000 })] })
    expect((await api.get('/x')).status).toBe(200)
    expect(calls).toBe(2)
  })

  it('falls back to backoff when Retry-After is unparseable', async () => {
    let calls = 0
    const backoff = vi.fn(() => 0)
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(
        toHttpResponse(
          new Response('{}', {
            status: calls === 1 ? 503 : 200,
            headers: { 'retry-after': 'not-a-date' },
          }),
          request,
        ),
      )
    }
    const api = createHttp({ transport, use: [retry({ limit: 1, backoff })] })

    expect((await api.get('/x')).status).toBe(200)
    expect(backoff).toHaveBeenCalledOnce()
  })

  it('ignores Retry-After when respectRetryAfter is off', async () => {
    let calls = 0
    const backoff = vi.fn(() => 0)
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(
        toHttpResponse(
          new Response('{}', {
            status: calls === 1 ? 503 : 200,
            headers: { 'retry-after': '99999' },
          }),
          request,
        ),
      )
    }
    const api = createHttp({
      transport,
      use: [retry({ limit: 1, backoff, respectRetryAfter: false })],
    })

    expect((await api.get('/x')).status).toBe(200)
    expect(backoff).toHaveBeenCalledOnce()
  })

  it('stops replaying when the caller aborts DURING the backoff window', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(toHttpResponse(new Response('{}', { status: 503 }), request))
    }
    const api = createHttp({
      transport,
      throwHttpErrors: false,
      use: [retry({ limit: 5, backoff: () => 50 })],
    })

    const controller = new AbortController()
    const promise = api.get('/x', { signal: controller.signal })
    // Let the first attempt land, then cancel mid-backoff.
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()

    await promise.catch(() => undefined)
    // Without the in-backoff abort check this would keep replaying to 6.
    expect(calls).toBeLessThanOrEqual(2)
  })

  it('stops replaying a NETWORK failure once the caller aborts', async () => {
    let calls = 0
    const transport: Transport = () => {
      calls += 1
      return Promise.reject(new Error('offline'))
    }
    const api = createHttp({ transport, use: [retry({ limit: 5, backoff: () => 50 })] })

    const controller = new AbortController()
    const promise = api.get('/x', { signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()

    await promise.catch(() => undefined)
    expect(calls).toBeLessThanOrEqual(2)
  })

  it('clamps a huge backoff to maxDelay', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(
        toHttpResponse(new Response('{}', { status: calls === 1 ? 503 : 200 }), request),
      )
    }
    const started = Date.now()
    const api = createHttp({
      transport,
      use: [retry({ limit: 1, backoff: () => 60_000, maxDelay: 5 })],
    })

    expect((await api.get('/x')).status).toBe(200)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('uses the built-in exponential backoff when none is supplied', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(
        toHttpResponse(new Response('{}', { status: calls === 1 ? 503 : 200 }), request),
      )
    }
    const api = createHttp({ transport, use: [retry({ limit: 1, maxDelay: 5 })] })
    expect((await api.get('/x')).status).toBe(200)
    expect(calls).toBe(2)
  })

  it('is a no-op when limit is 0', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(toHttpResponse(new Response('{}', { status: 500 }), request))
    }
    const api = createHttp({ transport, use: [retry({ limit: 0 })] })
    await expect(api.get('/x')).rejects.toBeInstanceOf(HttpError)
    expect(calls).toBe(1)
  })
})

describe('dedupe', () => {
  it('shares ONE in-flight request between concurrent callers', async () => {
    let calls = 0
    const transport: Transport = async (request) => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 10))
      return toHttpResponse(new Response(JSON.stringify({ n: calls })), request)
    }
    const api = createHttp({ transport, use: [dedupe()] })

    const [a, b] = await Promise.all([api.get('/x').json(), api.get('/x').json()])

    expect(calls).toBe(1)
    // BOTH callers can read the body — each gets its own clone. Sharing one
    // Response would make the second `.json()` throw "body already read".
    expect(a).toEqual({ n: 1 })
    expect(b).toEqual({ n: 1 })
  })

  it('releases the key so a later identical request goes out again', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(toHttpResponse(new Response('{}'), request))
    }
    const api = createHttp({ transport, use: [dedupe()] })

    await api.get('/x')
    await api.get('/x')

    expect(calls).toBe(2)
  })

  it('releases the key after a FAILURE too (leak class C)', async () => {
    let calls = 0
    const transport: Transport = () => {
      calls += 1
      return Promise.reject(new Error('boom'))
    }
    const api = createHttp({ transport, use: [dedupe()] })

    await expect(api.get('/x')).rejects.toThrow('boom')
    await expect(api.get('/x')).rejects.toThrow('boom')
    expect(calls).toBe(2)
  })

  it('does not share non-idempotent methods', async () => {
    let calls = 0
    const transport: Transport = async (request) => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 10))
      return toHttpResponse(new Response('{}'), request)
    }
    const api = createHttp({ transport, use: [dedupe()] })

    await Promise.all([api.post('/x'), api.post('/x')])
    expect(calls).toBe(2)
  })
})

describe('bearer', () => {
  it('reads the token per request and omits the header when absent', async () => {
    const seen: (string | null)[] = []
    const transport: Transport = (request) => {
      seen.push(request.headers.get('authorization'))
      return Promise.resolve(toHttpResponse(new Response('{}'), request))
    }
    let token: string | null = 'abc'
    const api = createHttp({ transport, use: [bearer(() => token)] })

    await api.get('/x')
    token = null
    await api.get('/x')

    expect(seen).toEqual(['Bearer abc', null])
  })
})

describe('refresh', () => {
  it('refreshes once and replays the request', async () => {
    let calls = 0
    const transport: Transport = (request) => {
      calls += 1
      return Promise.resolve(
        toHttpResponse(new Response('{}', { status: calls === 1 ? 401 : 200 }), request),
      )
    }
    const doRefresh = vi.fn(() => Promise.resolve(true))
    const api = createHttp({ transport, use: [refresh({ refresh: doRefresh })] })

    expect((await api.get('/x')).status).toBe(200)
    expect(doRefresh).toHaveBeenCalledTimes(1)
  })

  it('collapses a concurrent 401 stampede into ONE refresh', async () => {
    let calls = 0
    const transport: Transport = async (request) => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return toHttpResponse(new Response('{}', { status: calls <= 3 ? 401 : 200 }), request)
    }
    const doRefresh = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return true
    })
    const api = createHttp({ transport, use: [refresh({ refresh: doRefresh })] })

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')])

    // Three parallel 401s, ONE refresh — otherwise each refresh invalidates
    // the token the previous one just stored.
    expect(doRefresh).toHaveBeenCalledTimes(1)
  })

  it('gives up when the refresh reports failure', async () => {
    const transport: Transport = (request) =>
      Promise.resolve(toHttpResponse(new Response('{}', { status: 401 }), request))
    const api = createHttp({
      transport,
      throwHttpErrors: false,
      use: [refresh({ refresh: () => Promise.resolve(false) })],
    })

    expect((await api.get('/x')).status).toBe(401)
  })

  it('clears the shared promise after a REJECTED refresh so later calls retry', async () => {
    const transport: Transport = (request) =>
      Promise.resolve(toHttpResponse(new Response('{}', { status: 401 }), request))
    const doRefresh = vi.fn(() => Promise.reject(new Error('refresh failed')))
    const api = createHttp({ transport, use: [refresh({ refresh: doRefresh })] })

    await expect(api.get('/x')).rejects.toThrow('refresh failed')
    await expect(api.get('/x')).rejects.toThrow('refresh failed')
    expect(doRefresh).toHaveBeenCalledTimes(2)
  })
})

describe('logger', () => {
  it('reports the status and stays silent in production', async () => {
    const lines: string[] = []
    const transport: Transport = (request) =>
      Promise.resolve(toHttpResponse(new Response('{}'), request))
    const api = createHttp({ transport, use: [logger({ log: (line) => lines.push(line) })] })

    await api.get('/x')
    expect(lines[0]).toContain('GET /x → 200')

    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    await api.get('/y')
    process.env.NODE_ENV = previous
    expect(lines).toHaveLength(1)
  })

  it('logs and rethrows a failure', async () => {
    const lines: string[] = []
    const api = createHttp({
      transport: () => Promise.reject(new Error('boom')),
      use: [logger({ log: (line) => lines.push(line) })],
    })

    await expect(api.get('/x')).rejects.toThrow('boom')
    expect(lines[0]).toContain('failed')
  })

  it('falls back to console.debug', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const api = createHttp({
      transport: (request) => Promise.resolve(toHttpResponse(new Response('{}'), request)),
      use: [logger()],
    })
    await api.get('/x')
    expect(debug).toHaveBeenCalled()
    debug.mockRestore()
  })
})
