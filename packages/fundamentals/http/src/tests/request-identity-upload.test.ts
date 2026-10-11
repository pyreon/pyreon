/** @vitest-environment node */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHttp } from '../client'
import { dedupe } from '../middleware'
import { AbortError } from '../errors'
import { fetchTransport } from '../transport'

let server: Server
let baseUrl: string
const hits = new Map<string, number>()

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const path = request.url!
    hits.set(path, (hits.get(path) ?? 0) + 1)
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    // Keep overlapping callers in flight so sharing is observable.
    await new Promise((resolve) => setTimeout(resolve, 10))
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({ headers: request.headers, body: Buffer.concat(chunks).toString() }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

type Echo = { headers: Record<string, string>; body: string }

function streamedBody(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('hello '))
      controller.enqueue(encoder.encode('world'))
      controller.close()
    },
  })
}

describe('real request identity', () => {
  it.each(['accept-language', 'accept', 'x-tenant-id', 'x-api-key', 'authorization', 'cookie'])(
    'keeps different %s values isolated',
    async (header) => {
      const api = createHttp({ baseUrl, use: [dedupe()] })
      const path = `/identity/${header}`
      const [a, b] = await Promise.all([
        api.get(path, { headers: { [header]: 'first' } }).json<Echo>(),
        api.get(path, { headers: { [header]: 'second' } }).json<Echo>(),
      ])
      expect(a.headers[header]).toBe('first')
      expect(b.headers[header]).toBe('second')
      expect(hits.get(path)).toBe(2)
    },
  )

  it('shares normalized equal headers regardless of casing or insertion order', async () => {
    const api = createHttp({ baseUrl, use: [dedupe()] })
    const path = '/identity/equal'
    const [a, b] = await Promise.all([
      api.get(path, { headers: { 'X-B': '2', 'x-a': '1' } }).json<Echo>(),
      api
        .get(path, {
          headers: new Headers([
            ['X-A', '1'],
            ['x-b', '2'],
          ]),
        })
        .json<Echo>(),
    ])
    expect(a.headers['x-a']).toBe('1')
    expect(b.headers['x-b']).toBe('2')
    expect(hits.get(path)).toBe(1)
  })

  it('keeps fetch credentials modes isolated while sending real requests', async () => {
    const credentials: (RequestCredentials | undefined)[] = []
    const api = createHttp({
      baseUrl,
      use: [dedupe()],
      transport: (request) => {
        credentials.push(request.credentials)
        return fetchTransport(request)
      },
    })
    await Promise.all([
      api.get('/identity/credentials', { credentials: 'include' }).json(),
      api.get('/identity/credentials', { credentials: 'omit' }).json(),
    ])
    expect(credentials).toEqual(['include', 'omit'])
    expect(hits.get('/identity/credentials')).toBe(2)
  })

  it('does not share when downstream middleware changes a header, and does not log its value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let tenant = 0
    const api = createHttp({
      baseUrl,
      use: [
        dedupe(),
        (request, next) => {
          request.headers.set('x-tenant-id', `private-tenant-${++tenant}`)
          return next()
        },
      ],
    })
    try {
      const [a, b] = await Promise.all([
        api.get('/identity/downstream').json<Echo>(),
        api.get('/identity/downstream').json<Echo>(),
      ])
      expect(new Set([a.headers['x-tenant-id'], b.headers['x-tenant-id']])).toEqual(
        new Set(['private-tenant-1', 'private-tenant-2']),
      )
      expect(hits.get('/identity/downstream')).toBe(2)
      expect(warn).toHaveBeenCalledOnce()
      expect(String(warn.mock.calls)).not.toContain('private-tenant')
    } finally {
      warn.mockRestore()
    }
  })

  it('keeps cancellation local to one caller of a shared real request', async () => {
    const api = createHttp({ baseUrl, use: [dedupe()] })
    const controller = new AbortController()
    const first = api.get('/identity/abort', { signal: controller.signal }).json<Echo>()
    const second = api.get('/identity/abort').json<Echo>()
    controller.abort()
    await expect(first).rejects.toBeInstanceOf(AbortError)
    expect((await second).body).toBe('')
    expect(hits.get('/identity/abort')).toBe(1)
  })

  it('does not share a body added by downstream middleware', async () => {
    let body = 0
    const api = createHttp({
      baseUrl,
      use: [
        dedupe({ methods: ['POST'] }),
        (request, next) => {
          request.body = String(++body)
          return next()
        },
      ],
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const [a, b] = await Promise.all([
        api.post('/identity/downstream-body').json<Echo>(),
        api.post('/identity/downstream-body').json<Echo>(),
      ])
      expect([a.body, b.body]).toEqual(['1', '2'])
      expect(hits.get('/identity/downstream-body')).toBe(2)
    } finally {
      warn.mockRestore()
    }
  })

  it('does not infer identity from request bodies when POST sharing is enabled', async () => {
    const api = createHttp({ baseUrl, use: [dedupe({ methods: ['POST'] })] })
    const [a, b] = await Promise.all([
      api.post('/identity/body', { body: 'first' }).json<Echo>(),
      api.post('/identity/body', { body: 'second' }).json<Echo>(),
    ])
    expect([a.body, b.body]).toEqual(['first', 'second'])
    expect(hits.get('/identity/body')).toBe(2)
  })

  it('honors an explicit custom key for body identity', async () => {
    const api = createHttp({
      baseUrl,
      use: [
        dedupe({ methods: ['POST'], key: (request) => `${request.url}:${String(request.body)}` }),
      ],
    })
    const [a, b] = await Promise.all([
      api.post('/identity/custom', { body: 'same' }).json<Echo>(),
      api.post('/identity/custom', { body: 'same' }).json<Echo>(),
    ])
    expect([a.body, b.body]).toEqual(['same', 'same'])
    expect(hits.get('/identity/custom')).toBe(1)
  })
})

describe('real Node streamed uploads', () => {
  it('sends a ReadableStream body through fetch', async () => {
    const api = createHttp({ baseUrl })
    const result = await api.post('/upload/stream', { body: streamedBody() }).json<Echo>()
    expect(result.body).toBe('hello world')
    expect(hits.get('/upload/stream')).toBe(1)
  })

  it('keeps ordinary text and FormData uploads working', async () => {
    const api = createHttp({ baseUrl })
    const form = new FormData()
    form.set('name', 'Ada')
    const text = await api.post('/upload/text', { body: 'hello' }).json<Echo>()
    const multipart = await api.post('/upload/form', { body: form }).json<Echo>()
    expect(text.body).toBe('hello')
    expect(multipart.body).toContain('name="name"')
    expect(multipart.body).toContain('Ada')
  })
})
