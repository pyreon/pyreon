/**
 * Security + abort-correctness hardening (2026-09 audit).
 *
 * Each block names the defect it locks. All of them are behavioural: they
 * drive the real `createHttp` client through a hand-written transport, so
 * they observe exactly what an application would.
 */
import { describe, expect, it, vi } from 'vitest'
import { createHttp } from '../client'
import {
  AbortError,
  HttpError,
  NetworkError,
  ParseError,
  ResponseValidationError,
  ServerError,
  TimeoutError,
} from '../errors'
import { bearer, dedupe, logger, refresh, retry } from '../middleware'
import { toHttpResponse } from '../transport'
import type { HttpRequest, Transport } from '../types'

const encoder = new TextEncoder()
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Reject with a DOM-style abort as soon as `signal` aborts (what `fetch` does). */
function onAbort(signal: AbortSignal | undefined, reject: (e: unknown) => void): void {
  if (!signal) return
  const fire = (): void => reject(new DOMException('aborted', 'AbortError'))
  if (signal.aborted) fire()
  else signal.addEventListener('abort', fire, { once: true })
}

/**
 * A body that sends a first chunk and then STALLS until the request signal
 * aborts — the shape of a slow or hung response body.
 */
function stallingBody(signal: AbortSignal | undefined): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"partial":'))
      signal?.addEventListener(
        'abort',
        () => controller.error(new DOMException('aborted', 'AbortError')),
        { once: true },
      )
    },
  })
}

describe('dedupe — credentials are part of the identity (cross-user leak)', () => {
  const echoAuth = (): { transport: Transport; calls: () => number } => {
    let calls = 0
    const transport: Transport = async (request) => {
      calls++
      await tick(5)
      const who = `${request.headers.get('authorization') ?? ''}|${request.headers.get('cookie') ?? ''}`
      return toHttpResponse(new Response(who), request)
    }
    return { transport, calls: () => calls }
  }

  it('does NOT share one response between different Authorization headers', async () => {
    const { transport, calls } = echoAuth()
    const api = createHttp({ transport, use: [dedupe()] })
    const [a, b] = await Promise.all([
      api.get('/me', { headers: { authorization: 'Bearer alice' } }).text(),
      api.get('/me', { headers: { authorization: 'Bearer bob' } }).text(),
    ])
    expect(a).toBe('Bearer alice|')
    expect(b).toBe('Bearer bob|')
    expect(calls()).toBe(2)
  })

  it('does NOT share one response between different cookies', async () => {
    const { transport, calls } = echoAuth()
    const api = createHttp({ transport, use: [dedupe()] })
    const [a, b] = await Promise.all([
      api.get('/me', { headers: { cookie: 'sid=alice' } }).text(),
      api.get('/me', { headers: { cookie: 'sid=bob' } }).text(),
    ])
    expect(a).toBe('|sid=alice')
    expect(b).toBe('|sid=bob')
    expect(calls()).toBe(2)
  })

  it('does NOT share when credentials are attached BELOW dedupe (use: [dedupe(), bearer()])', async () => {
    const { transport } = echoAuth()
    const tokens = ['alice', 'bob']
    let i = 0
    const api = createHttp({ transport, use: [dedupe(), bearer(() => tokens[i++])] })
    const [a, b] = await Promise.all([api.get('/me').text(), api.get('/me').text()])
    expect(new Set([a, b])).toEqual(new Set(['Bearer alice|', 'Bearer bob|']))
  })

  it('still shares identical credentialed requests', async () => {
    const { transport, calls } = echoAuth()
    const api = createHttp({ transport, use: [dedupe()] })
    const h = { authorization: 'Bearer alice' }
    const [a, b] = await Promise.all([
      api.get('/me', { headers: h }).text(),
      api.get('/me', { headers: h }).text(),
    ])
    expect([a, b]).toEqual(['Bearer alice|', 'Bearer alice|'])
    expect(calls()).toBe(1)
  })
})

describe('dedupe — one caller aborting does not cancel the others', () => {
  const gated = (): {
    transport: Transport
    release: () => void
    seen: HttpRequest[]
  } => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const seen: HttpRequest[] = []
    const transport: Transport = (request) => {
      seen.push(request)
      return new Promise((resolve, reject) => {
        onAbort(request.signal, reject)
        void gate.then(() => resolve(toHttpResponse(new Response('shared'), request)))
      })
    }
    return { transport, release: () => release(), seen }
  }

  it('the LEADER aborting leaves a joiner with its response', async () => {
    const { transport, release } = gated()
    const api = createHttp({ transport, use: [dedupe()] })
    const leader = new AbortController()
    const p1 = api.get('/x', { signal: leader.signal }).text()
    const p2 = api.get('/x').text()
    await tick()
    leader.abort()
    await expect(p1).rejects.toBeInstanceOf(AbortError)
    release()
    await expect(p2).resolves.toBe('shared')
  })

  it('a JOINER aborting rejects only that joiner, promptly', async () => {
    const { transport, release } = gated()
    const api = createHttp({ transport, use: [dedupe()] })
    const joiner = new AbortController()
    const p1 = api.get('/x').text()
    const p2 = api.get('/x', { signal: joiner.signal }).text()
    await tick()
    joiner.abort()
    await expect(p2).rejects.toBeInstanceOf(AbortError)
    release()
    await expect(p1).resolves.toBe('shared')
  })

  it('the shared request is cancelled once EVERY caller has aborted', async () => {
    const { transport, seen } = gated()
    const api = createHttp({ transport, use: [dedupe()] })
    const a = new AbortController()
    const b = new AbortController()
    const p1 = api.get('/x', { signal: a.signal })
    const p2 = api.get('/x', { signal: b.signal })
    await tick()
    a.abort()
    await expect(p1).rejects.toBeInstanceOf(AbortError)
    expect(seen[0]?.signal?.aborted).toBe(false)
    b.abort()
    await expect(p2).rejects.toBeInstanceOf(AbortError)
    expect(seen[0]?.signal?.aborted).toBe(true)
  })
})

describe('abort + timeout cover the BODY read, not just the headers', () => {
  const stalling = (): { transport: Transport; seen: HttpRequest[] } => {
    const seen: HttpRequest[] = []
    const transport: Transport = async (request) => {
      seen.push(request)
      return toHttpResponse(new Response(stallingBody(request.signal)), request)
    }
    return { transport, seen }
  }

  it('aborting during .json() rejects with AbortError and reaches the transport', async () => {
    const { transport, seen } = stalling()
    const api = createHttp({ transport, timeout: false })
    const controller = new AbortController()
    const body = api.get('/slow', { signal: controller.signal }).json()
    await tick(5)
    controller.abort()
    await expect(body).rejects.toBeInstanceOf(AbortError)
    expect(seen[0]?.signal?.aborted).toBe(true)
  })

  it('the timeout covers a slow body and surfaces as TimeoutError', async () => {
    const { transport, seen } = stalling()
    const api = createHttp({ transport, timeout: 30 })
    await expect(api.get('/slow').text()).rejects.toBeInstanceOf(TimeoutError)
    expect(seen[0]?.signal?.aborted).toBe(true)
  })

  it('releases the caller listener once the body has been read (leak class D)', async () => {
    const api = createHttp({
      transport: async (request) => toHttpResponse(new Response('{"ok":true}'), request),
    })
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    await expect(api.get('/x', { signal: controller.signal }).json()).resolves.toEqual({ ok: true })
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('still releases at headers when nobody asks for a decoder (bare await)', async () => {
    const api = createHttp({
      transport: async (request) => toHttpResponse(new Response('x'), request),
    })
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    await api.get('/x', { signal: controller.signal })
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('an HTTP error thrown before the body is read still releases the link', async () => {
    const api = createHttp({
      transport: async (request) => toHttpResponse(new Response('no', { status: 404 }), request),
    })
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    await expect(api.get('/x', { signal: controller.signal }).json()).rejects.toBeInstanceOf(
      HttpError,
    )
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})

describe('retry / refresh — discarded responses release their body', () => {
  const trackedBody = (): { body: ReadableStream<Uint8Array>; cancelled: () => boolean } => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('busy'))
      },
      cancel() {
        cancelled = true
      },
    })
    return { body, cancelled: () => cancelled }
  }

  it('retry cancels the body of a response it is about to replay', async () => {
    const first = trackedBody()
    let n = 0
    const api = createHttp({
      transport: async (request) =>
        toHttpResponse(
          n++ === 0 ? new Response(first.body, { status: 503 }) : new Response('ok'),
          request,
        ),
      use: [retry({ backoff: () => 0 })],
    })
    await expect(api.get('/x').text()).resolves.toBe('ok')
    expect(first.cancelled()).toBe(true)
  })

  it('refresh cancels the body of the 401 it is about to re-issue', async () => {
    const first = trackedBody()
    let n = 0
    const api = createHttp({
      transport: async (request) =>
        toHttpResponse(
          n++ === 0 ? new Response(first.body, { status: 401 }) : new Response('ok'),
          request,
        ),
      use: [refresh({ refresh: async () => true })],
    })
    await expect(api.get('/x').text()).resolves.toBe('ok')
    expect(first.cancelled()).toBe(true)
  })
})

describe('retry / refresh — a one-shot (stream) request body is never replayed', () => {
  const consuming = (status: number): { transport: Transport; calls: () => number } => {
    let calls = 0
    const transport: Transport = async (request) => {
      calls++
      // Reading the body is what a real transport does; a second read of the
      // same stream throws "disturbed / locked".
      await new Response(request.body).text()
      return toHttpResponse(new Response('', { status: calls === 1 ? status : 200 }), request)
    }
    return { transport, calls: () => calls }
  }
  const streamBody = (): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode('payload'))
        c.close()
      },
    })

  it('retry returns the original response instead of re-sending a consumed stream', async () => {
    const { transport, calls } = consuming(503)
    const api = createHttp({ transport, use: [retry({ backoff: () => 0 })] })
    const error = await api.put('/x', { body: streamBody() }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ServerError)
    expect(error).not.toBeInstanceOf(NetworkError)
    expect(calls()).toBe(1)
  })

  it('refresh returns the 401 instead of re-sending a consumed stream', async () => {
    const { transport, calls } = consuming(401)
    const doRefresh = vi.fn(async () => true)
    const api = createHttp({ transport, use: [refresh({ refresh: doRefresh })] })
    const error = await api.post('/x', { body: streamBody() }).catch((e: unknown) => e)
    expect((error as HttpError).status).toBe(401)
    expect(calls()).toBe(1)
  })
})

describe('refresh — the re-issued request carries the NEW token regardless of order', () => {
  it('use: [bearer(), refresh()] re-reads the token after refreshing', async () => {
    let token = 'old'
    const seen: string[] = []
    const api = createHttp({
      transport: async (request) => {
        const auth = request.headers.get('authorization') ?? ''
        seen.push(auth)
        return toHttpResponse(
          new Response('', { status: auth === 'Bearer new' ? 200 : 401 }),
          request,
        )
      },
      use: [
        bearer(() => token),
        refresh({
          refresh: async () => {
            token = 'new'
            return true
          },
        }),
      ],
    })
    await expect(api.get('/x')).resolves.toMatchObject({ status: 200 })
    expect(seen).toEqual(['Bearer old', 'Bearer new'])
  })

  it('use: [refresh(), bearer()] keeps working', async () => {
    let token = 'old'
    const api = createHttp({
      transport: async (request) =>
        toHttpResponse(
          new Response('', {
            status: request.headers.get('authorization') === 'Bearer new' ? 200 : 401,
          }),
          request,
        ),
      use: [
        refresh({
          refresh: async () => {
            token = 'new'
            return true
          },
        }),
        bearer(() => token),
      ],
    })
    await expect(api.get('/x')).resolves.toMatchObject({ status: 200 })
  })
})

describe('bearer — the token stays on the baseUrl origin', () => {
  const echo: Transport = async (request) =>
    toHttpResponse(new Response(request.headers.get('authorization') ?? 'none'), request)

  it('does not attach to an absolute URL on a foreign origin', async () => {
    const api = createHttp({
      baseUrl: 'https://api.test/v1',
      transport: echo,
      use: [bearer(() => 't')],
    })
    await expect(api.get('https://evil.test/steal').text()).resolves.toBe('none')
  })

  it('attaches to relative paths and to absolute URLs on the baseUrl origin', async () => {
    const api = createHttp({
      baseUrl: 'https://api.test/v1',
      transport: echo,
      use: [bearer(() => 't')],
    })
    await expect(api.get('users').text()).resolves.toBe('Bearer t')
    await expect(api.get('https://api.test/other').text()).resolves.toBe('Bearer t')
  })

  it('protocol-relative paths stay under baseUrl (no origin escape)', async () => {
    const api = createHttp({
      baseUrl: 'https://api.test',
      transport: echo,
      use: [bearer(() => 't')],
    })
    const res = await api.get('//evil.test/steal')
    expect(res.request.url.startsWith('https://api.test/')).toBe(true)
    expect(await res.raw.text()).toBe('Bearer t')
  })

  it('crossOrigin: true opts back in', async () => {
    const api = createHttp({
      baseUrl: 'https://api.test',
      transport: echo,
      use: [bearer(() => 't', { crossOrigin: true })],
    })
    await expect(api.get('https://other.test/x').text()).resolves.toBe('Bearer t')
  })

  it('without a baseUrl there is no boundary to enforce', async () => {
    const api = createHttp({ transport: echo, use: [bearer(() => 't')] })
    await expect(api.get('https://api.test/x').text()).resolves.toBe('Bearer t')
  })
})

describe('error messages never carry the query string', () => {
  const secret = 'token=s3cret'
  const url = `https://api.test/x?${secret}#frag`

  it('HttpError', async () => {
    const api = createHttp({
      transport: async (request) => toHttpResponse(new Response('', { status: 500 }), request),
    })
    const error = (await api.get(url).catch((e: unknown) => e)) as Error
    expect(error).toBeInstanceOf(HttpError)
    expect(error.message).toContain('https://api.test/x')
    expect(error.message).not.toContain(secret)
    // The full URL is still available to code that needs it.
    expect((error as HttpError).request?.url).toContain(secret)
  })

  it('TimeoutError / AbortError / NetworkError / ParseError / ResponseValidationError', async () => {
    const hang: Transport = (request) => new Promise((_, reject) => onAbort(request.signal, reject))
    const timeout = (await createHttp({ transport: hang, timeout: 5 })
      .get(url)
      .catch((e: unknown) => e)) as Error
    expect(timeout).toBeInstanceOf(TimeoutError)
    expect(timeout.message).not.toContain(secret)

    const c = new AbortController()
    const aborted = createHttp({ transport: hang, timeout: false })
      .get(url, { signal: c.signal })
      .catch((e: unknown) => e)
    c.abort()
    expect(((await aborted) as Error).message).not.toContain(secret)

    const network = (await createHttp({
      transport: (request) => Promise.reject(new NetworkError(new Error('offline'), request)),
    })
      .get(url)
      .catch((e: unknown) => e)) as Error
    expect(network.message).not.toContain(secret)

    const html = createHttp({
      transport: async (request) => toHttpResponse(new Response('<html>'), request),
    })
    const parse = (await html
      .get(url)
      .json()
      .catch((e: unknown) => e)) as Error
    expect(parse).toBeInstanceOf(ParseError)
    expect(parse.message).not.toContain(secret)

    const json = createHttp({
      transport: async (request) => toHttpResponse(new Response('{}'), request),
    })
    const invalid = (await json
      .get(url)
      .json(() => {
        throw new Error('nope')
      })
      .catch((e: unknown) => e)) as Error
    expect(invalid).toBeInstanceOf(ResponseValidationError)
    expect(invalid.message).not.toContain(secret)
  })

  it('strips userinfo too', () => {
    const request = {
      method: 'GET' as const,
      url: 'https://user:pw@api.test/x?k=v',
      headers: new Headers(),
      body: null,
      signal: undefined,
      credentials: undefined,
      meta: {},
    }
    const error = new AbortError(request)
    expect(error.message).toContain('GET https://api.test/x ')
    expect(error.message).not.toContain('pw')
    expect(error.message).not.toContain('k=v')
  })

  it('logger lines', async () => {
    const lines: string[] = []
    const api = createHttp({
      transport: async (request) => toHttpResponse(new Response(''), request),
      use: [logger({ log: (line) => lines.push(line), production: true })],
    })
    await api.get(url)
    expect(lines[0]).toContain('https://api.test/x')
    expect(lines[0]).not.toContain(secret)
  })
})

describe('hardening — edge paths', () => {
  const echo: Transport = async (request) =>
    toHttpResponse(new Response(request.headers.get('authorization') ?? 'none'), request)
  const rewrite = (url: string) =>
    (async (request, next) => {
      request.url = url
      return next()
    }) as import('../types').HttpMiddleware

  it('bearer: a root-relative base keeps root-relative URLs, drops foreign absolutes', async () => {
    const same = createHttp({
      baseUrl: '/api',
      transport: echo,
      use: [rewrite('/other'), bearer(() => 't')],
    })
    await expect(same.get('x').text()).resolves.toBe('Bearer t')
    const foreign = createHttp({
      baseUrl: '/api',
      transport: echo,
      use: [rewrite('https://evil.test/x'), bearer(() => 't')],
    })
    await expect(foreign.get('x').text()).resolves.toBe('none')
  })

  it('bearer: an unparseable URL is treated as foreign', async () => {
    const api = createHttp({
      baseUrl: 'https://api.test',
      transport: echo,
      use: [rewrite('http://['), bearer(() => 't')],
    })
    await expect(api.get('x').text()).resolves.toBe('none')
  })

  it('refresh: a token source that yields nothing after refresh REMOVES the header', async () => {
    let token: string | null = 'old'
    const seen: string[] = []
    const api = createHttp({
      transport: async (request) => {
        seen.push(request.headers.get('authorization') ?? 'none')
        return toHttpResponse(new Response('', { status: 401 }), request)
      },
      throwHttpErrors: false,
      use: [
        bearer(() => token),
        refresh({
          refresh: async () => {
            token = null
            return true
          },
        }),
      ],
    })
    await api.get('/x')
    expect(seen).toEqual(['Bearer old', 'none'])
  })

  it('retry: a body whose cancel() rejects never replaces the outcome', async () => {
    let n = 0
    const api = createHttp({
      transport: async (request) =>
        toHttpResponse(
          n++ === 0
            ? new Response(
                new ReadableStream({
                  cancel() {
                    throw new Error('cancel failed')
                  },
                }),
                { status: 503 },
              )
            : new Response('ok'),
          request,
        ),
      use: [retry({ backoff: () => 0 })],
    })
    await expect(api.get('/x').text()).resolves.toBe('ok')
  })

  it('dedupe: callers without any signal share and settle', async () => {
    let calls = 0
    const api = createHttp({
      timeout: false,
      transport: async (request) => {
        calls++
        await tick(2)
        return toHttpResponse(new Response('s'), request)
      },
      use: [dedupe()],
    })
    await expect(Promise.all([api.get('/x').text(), api.get('/x').text()])).resolves.toEqual([
      's',
      's',
    ])
    expect(calls).toBe(1)
  })

  it('dedupe: a shared failure rejects every caller', async () => {
    const api = createHttp({
      transport: async () => {
        await tick(2)
        throw new NetworkError(new Error('down'))
      },
      use: [dedupe()],
    })
    const results = await Promise.allSettled([api.get('/x'), api.get('/x')])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
  })

  it('dedupe: a joiner arriving with an already-aborted signal leaves immediately', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const api = createHttp({
      transport: async (request) => {
        await gate
        return toHttpResponse(new Response('s'), request)
      },
      use: [dedupe()],
    })
    const leader = api.get('/x').text()
    await tick()
    const dead = new AbortController()
    dead.abort()
    // The client refuses a pre-aborted request before the chain runs, so
    // drive the middleware directly for the joiner.
    const mw = dedupe()
    const first = mw(
      {
        method: 'GET',
        url: '/y',
        headers: new Headers(),
        body: null,
        signal: undefined,
        credentials: undefined,
        meta: {},
      },
      () => gate.then(() => toHttpResponse(new Response('y'), {} as HttpRequest)),
    )
    const joiner = mw(
      {
        method: 'GET',
        url: '/y',
        headers: new Headers(),
        body: null,
        signal: dead.signal,
        credentials: undefined,
        meta: {},
      },
      () => Promise.reject(new Error('unreachable')),
    )
    await expect(joiner).rejects.toBeInstanceOf(AbortError)
    release()
    await expect(leader).resolves.toBe('s')
    await expect(first).resolves.toMatchObject({ status: 200 })
  })

  it('a response that lands after the caller aborted is not read', async () => {
    const controller = new AbortController()
    const api = createHttp({
      transport: async (request) => {
        controller.abort()
        return toHttpResponse(new Response('late'), request)
      },
    })
    await expect(api.get('/x', { signal: controller.signal }).text()).rejects.toBeInstanceOf(
      AbortError,
    )
  })
})
