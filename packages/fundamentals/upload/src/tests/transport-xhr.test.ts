// The XHR transport under the unit runner, on an in-memory XMLHttpRequest (`fake-xhr.ts`). The fake stands in for the browser
// boundary only; the real path (real XHR, real server, real progress and aborts) is `upload.browser.test.ts` in Chromium.
import { createHttp } from '@pyreon/http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUploader } from '../index'
import { xhrHttpTransport, xhrTransport } from '../transport-xhr'
import type { TransportContext, TransportFile, UploadError } from '../types'
import { type FakeXhr, installFakeXhr, tick } from './fake-xhr'

let xhr: ReturnType<typeof installFakeXhr>

beforeEach(() => {
  xhr = installFakeXhr()
})

afterEach(() => {
  xhr.restore()
  vi.useRealTimers()
})

const tf = (over: Partial<TransportFile> = {}): TransportFile => {
  const file = new File([new Uint8Array(1000)], 'a.txt', { type: 'text/plain' })

  return { id: 'u1', file, name: 'a.txt', size: 1000, type: 'text/plain', meta: {}, ...over }
}

const ctxOf = (controller = new AbortController()): TransportContext & { seen: number[]; controller: AbortController } => {
  const seen: number[] = []

  return { signal: controller.signal, onProgress: (n) => seen.push(n), saveResumeState: () => {}, seen, controller }
}

const rejection = async (p: Promise<unknown>): Promise<UploadError> => {
  try {
    await p
  } catch (error) {
    return error as UploadError
  }
  throw new Error('expected the upload to fail')
}

describe('xhrTransport: options', () => {
  it('refuses options without a url, naming the expected shape', () => {
    for (const bad of [undefined, null, {}, { url: 3 }]) {
      expect(() => xhrTransport(bad as never)).toThrow(/\[Pyreon\] xhrTransport: expected \{ url/)
    }
  })

  it('fails without retrying where there is no XMLHttpRequest (the server), saying uploads run in the browser', async () => {
    xhr.restore()
    const e = await rejection(xhrTransport({ url: '/u' }).upload(tf(), ctxOf()))

    expect(e).toMatchObject({ kind: 'network', retryable: false })
    expect(e.message).toMatch(/XMLHttpRequest is not available/)
  })
})

describe('xhrTransport: the request it sends', () => {
  it('POSTs multipart with the file under "file" and meta as text parts (objects as JSON, null and undefined left out)', async () => {
    const done = xhrTransport({ url: '/upload' }).upload(tf({ meta: { album: 'x', tags: ['a', 'b'], n: 2, gone: null, nope: undefined } }), ctxOf())

    await tick()
    const r = xhr.last()

    expect(r.method).toBe('POST')
    expect(r.url).toBe('/upload')
    expect(r.withCredentials).toBe(false)
    expect(r.timeout).toBe(0)
    const entries = r.formEntries()

    expect(entries.map(([k]) => k)).toEqual(['album', 'tags', 'n', 'file'])
    expect(entries[1]![1]).toBe('["a","b"]')
    expect(entries[2]![1]).toBe('2')
    expect((entries[3]![1] as File).name).toBe('a.txt')
    r.respond({ status: 200 })
    await expect(done).resolves.toBeUndefined()
  })

  it('honours method, field, url as a function, credentials, timeout and async per-file headers', async () => {
    const headers = vi.fn(async (f: TransportFile) => ({ authorization: `Bearer for-${f.id}` }))
    const done = xhrTransport({ url: (f) => `/files/${f.id}`, method: 'PUT', field: 'upload', withCredentials: true, timeout: 5000, headers }).upload(tf(), ctxOf())

    await tick()
    const r = xhr.last()

    expect(r.method).toBe('PUT')
    expect(r.url).toBe('/files/u1')
    expect(r.withCredentials).toBe(true)
    expect(r.timeout).toBe(5000)
    expect(r.header('Authorization')).toBe('Bearer for-u1')
    expect(r.formEntries().map(([k]) => k)).toEqual(['upload'])
    r.respond({ status: 201 })
    await done
    expect(headers).toHaveBeenCalledTimes(1)
  })

  it('sends static headers, and no meta with sendMeta: false; a nameless Blob is sent as "file"', async () => {
    const blob = new Blob([new Uint8Array(10)])
    const done = xhrTransport({ url: '/u', headers: { 'x-a': '1' }, sendMeta: false }).upload(tf({ file: blob, name: '', size: 10, meta: { a: 'b' } }), ctxOf())

    await tick()
    const r = xhr.last()

    expect(r.header('x-a')).toBe('1')
    const entries = r.formEntries()

    expect(entries.map(([k]) => k)).toEqual(['file'])
    expect((entries[0]![1] as File).name).toBe('file')
    r.respond({ status: 204 })
    await done
  })

  it('sends the body the app builds (a raw Blob, no multipart field)', async () => {
    const raw = new Blob(['raw'])
    const done = xhrTransport({ url: '/u', body: () => raw }).upload(tf({ meta: { a: 'b' } }), ctxOf())

    await tick()
    expect(xhr.last().body).toBe(raw)
    xhr.last().respond({ status: 200 })
    await done
  })
})

describe('xhrTransport: answers', () => {
  const send = async (response: Parameters<FakeXhr['respond']>[0]): Promise<unknown> => {
    const p = xhrTransport({ url: '/u' }).upload(tf(), ctxOf())

    await tick()
    xhr.last().respond(response)

    return p
  }

  it('resolves a 2xx with JSON when the server says JSON, else text; an empty body is undefined', async () => {
    await expect(send({ status: 200, body: '{"id":7}', headers: { 'Content-Type': 'application/json; charset=utf-8' } })).resolves.toEqual({ id: 7 })
    await expect(send({ status: 200, body: '{"id":7}', headers: { 'content-type': 'application/problem+JSON' } })).resolves.toEqual({ id: 7 })
    await expect(send({ status: 200, body: 'not json', headers: { 'content-type': 'application/json' } })).resolves.toBe('not json')
    await expect(send({ status: 200, body: '{"id":7}', headers: { 'content-type': 'text/plain' } })).resolves.toBe('{"id":7}')
    await expect(send({ status: 200, body: 'plain' })).resolves.toBe('plain')
    await expect(send({ status: 200, body: '' })).resolves.toBeUndefined()
  })

  it('a 4xx is a server error that is not retried, carrying the parsed body', async () => {
    const e = await rejection(send({ status: 422, body: '{"error":"bad"}', headers: { 'content-type': 'application/json' } }))

    expect(e).toMatchObject({ kind: 'server', status: 422, retryable: false, body: { error: 'bad' } })
    expect(e.retryAfter).toBeUndefined()
  })

  it('a 429 and a 503 are retryable and carry Retry-After in ms', async () => {
    expect(await rejection(send({ status: 429, headers: { 'Retry-After': '2' } }))).toMatchObject({ kind: 'server', status: 429, retryable: true, retryAfter: 2000 })
    const e = await rejection(send({ status: 503 }))

    expect(e).toMatchObject({ kind: 'server', status: 503, retryable: true })
    expect(e.retryAfter).toBeUndefined()
    expect(e.body).toBeUndefined()
  })

  it('a connection failure is a retryable network error; a timeout is a retryable timeout', async () => {
    const t = xhrTransport({ url: '/u', timeout: 10 })
    const a = t.upload(tf(), ctxOf())

    await tick()
    xhr.last().fail()
    expect(await rejection(a)).toMatchObject({ kind: 'network', retryable: true })
    const b = t.upload(tf(), ctxOf())

    await tick()
    xhr.last().expire()
    expect(await rejection(b)).toMatchObject({ kind: 'timeout', retryable: true })
  })
})

describe('xhrTransport: progress and aborts', () => {
  it('reports bytes of the file: a computable event is scaled to the file size (the multipart body is bigger than the file)', async () => {
    const ctx = ctxOf()
    const p = xhrTransport({ url: '/u' }).upload(tf(), ctx)

    await tick()
    const r = xhr.last()

    r.progress(600, 1200)
    r.progress(1200, 1200)
    r.progress(300, 0, false)
    r.progress(400, 0, true)
    expect(ctx.seen).toEqual([500, 1000, 300, 400])
    r.respond({ status: 200 })
    await p
  })

  it('aborting the signal aborts the request and fails as aborted, not retryable; the listener is gone afterwards', async () => {
    const ctx = ctxOf()
    const remove = vi.spyOn(ctx.signal, 'removeEventListener')
    const p = xhrTransport({ url: '/u' }).upload(tf(), ctx)

    await tick()
    ctx.controller.abort()
    expect(xhr.last().aborted).toBe(true)
    expect(await rejection(p)).toMatchObject({ kind: 'aborted', retryable: false })
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('a signal that is already aborted sends nothing', async () => {
    const controller = new AbortController()

    controller.abort()
    const e = await rejection(xhrTransport({ url: '/u' }).upload(tf(), ctxOf(controller)))

    expect(e.kind).toBe('aborted')
    expect(xhr.last().sent).toBe(false)
  })

  it('a settled request removes its abort listener, so a later abort does nothing', async () => {
    const ctx = ctxOf()
    const p = xhrTransport({ url: '/u' }).upload(tf(), ctx)

    await tick()
    xhr.last().respond({ status: 200, body: 'ok' })
    await expect(p).resolves.toBe('ok')
    ctx.controller.abort()
    expect(xhr.last().aborted).toBe(false)
  })
})

describe('xhrTransport in a queue', () => {
  it('a 503 is retried after the back-off and the second attempt succeeds; a 400 fails at once', async () => {
    vi.useFakeTimers()
    const up = createUploader({ transport: xhrTransport({ url: '/u' }), retry: { attempts: 3, backoff: () => 100 } })
    const [ok, bad] = up.add([new File(['a'], 'ok.txt'), new File(['b'], 'bad.txt')])

    await vi.advanceTimersByTimeAsync(0)
    expect(xhr.requests).toHaveLength(2)
    xhr.requests[0]!.respond({ status: 503 })
    xhr.requests[1]!.respond({ status: 400 })
    await vi.advanceTimersByTimeAsync(0)
    expect(bad!.status()).toBe('failed')
    expect(bad!.error()).toMatchObject({ status: 400, retryable: false })
    expect(ok!.status()).toBe('queued')
    await vi.advanceTimersByTimeAsync(100)
    expect(xhr.requests).toHaveLength(3)
    xhr.requests[2]!.respond({ status: 200, body: '{"url":"/f/1"}', headers: { 'content-type': 'application/json' } })
    await vi.advanceTimersByTimeAsync(0)
    expect(ok!.status()).toBe('done')
    expect(ok!.result()).toEqual({ url: '/f/1' })
    expect(ok!.attempt()).toBe(2)
    up.dispose()
  })

  it('pausing aborts the request on the wire; resuming sends a new one', async () => {
    vi.useFakeTimers()
    const up = createUploader({ transport: xhrTransport({ url: '/u' }) })
    const [f] = up.add([new File(['a'], 'a.txt')])

    await vi.advanceTimersByTimeAsync(0)
    up.pause(f!.id)
    expect(xhr.requests[0]!.aborted).toBe(true)
    expect(f!.status()).toBe('paused')
    up.resume(f!.id)
    await vi.advanceTimersByTimeAsync(0)
    expect(xhr.requests).toHaveLength(2)
    xhr.requests[1]!.respond({ status: 200 })
    await vi.advanceTimersByTimeAsync(0)
    expect(f!.status()).toBe('done')
    up.dispose()
  })
})

describe('xhrHttpTransport: the http-client transport', () => {
  const request = (over: Record<string, unknown> = {}) => ({
    method: 'POST',
    url: 'https://api.test/u',
    headers: new Headers({ authorization: 'Bearer t', 'x-b': '2' }),
    body: 'payload' as BodyInit,
    signal: undefined as AbortSignal | undefined,
    credentials: undefined as RequestCredentials | undefined,
    meta: {} as Record<string, unknown>,
    ...over,
  })

  it('sends method, url, headers and body, asks for an ArrayBuffer, and builds a Response with the parsed headers', async () => {
    const send = xhrHttpTransport()
    const p = send(request({ credentials: 'include' }))
    const r = xhr.last()

    expect(r.method).toBe('POST')
    expect(r.url).toBe('https://api.test/u')
    expect(r.headers).toEqual({ authorization: 'Bearer t', 'x-b': '2' })
    expect(r.body).toBe('payload')
    expect(r.withCredentials).toBe(true)
    expect(r.responseType).toBe('arraybuffer')
    r.respond({ status: 201, body: '{"ok":true}', headers: { 'Content-Type': 'application/json', 'X-Id': 'a:b' } })
    const res = await p

    expect(res.status).toBe(201)
    expect(res.ok).toBe(true)
    expect(res.headers.get('x-id')).toBe('a:b')
    expect(await res.raw.json()).toEqual({ ok: true })
  })

  it('a 204 has no body; a 500 is a response with ok false (the client decides what to throw)', async () => {
    const send = xhrHttpTransport()
    const a = send(request())

    xhr.last().respond({ status: 204 })
    const res = await a

    expect(res.ok).toBe(true)
    expect(res.raw.body).toBeNull()
    const b = send(request({ credentials: 'same-origin' }))

    expect(xhr.last().withCredentials).toBe(false)
    xhr.last().respond({ status: 500, body: 'boom' })
    const bad = await b

    expect(bad.ok).toBe(false)
    expect(await bad.raw.text()).toBe('boom')
  })

  it('reports upload progress through meta.onUploadProgress, with 0 as the total when it is not computable', async () => {
    const calls: [number, number][] = []
    const p = xhrHttpTransport()(request({ meta: { onUploadProgress: (l: number, t: number) => calls.push([l, t]) } }))

    xhr.last().progress(5, 10)
    xhr.last().progress(7, 99, false)
    xhr.last().respond({ status: 200 })
    await p
    expect(calls).toEqual([[5, 10], [7, 0]])
  })

  it('without onUploadProgress no progress handler is installed', async () => {
    const p = xhrHttpTransport()(request())

    expect(xhr.last().upload.onprogress).toBeNull()
    xhr.last().respond({ status: 200 })
    await p
  })

  it('fails like fetch: a TypeError for a network error and for a timeout, an AbortError for an abort', async () => {
    const send = xhrHttpTransport()
    const a = send(request())

    xhr.last().fail()
    await expect(a).rejects.toThrow(TypeError)
    const b = send(request())

    xhr.last().expire()
    await expect(b).rejects.toThrow(TypeError)
    const controller = new AbortController()
    const c = send(request({ signal: controller.signal }))

    controller.abort()
    await expect(c).rejects.toMatchObject({ name: 'AbortError' })
    expect(xhr.last().aborted).toBe(true)
  })

  it('an already aborted signal rejects without sending; a settled request drops its abort listener', async () => {
    const controller = new AbortController()

    controller.abort()
    await expect(xhrHttpTransport()(request({ signal: controller.signal }))).rejects.toMatchObject({ name: 'AbortError' })
    expect(xhr.last().sent).toBe(false)
    const live = new AbortController()
    const remove = vi.spyOn(live.signal, 'removeEventListener')
    const p = xhrHttpTransport()(request({ signal: live.signal }))

    xhr.last().fail()
    await expect(p).rejects.toThrow(TypeError)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})

describe('xhrTransport with a real @pyreon/http client', () => {
  it('sends through the client: base URL, client headers and middleware apply, and progress is scaled to the file', async () => {
    const seen: string[] = []
    const client = createHttp({
      baseUrl: 'https://api.test',
      headers: { authorization: 'Bearer abc' },
      use: [async (req, next) => {
        seen.push(`${req.method} ${req.url}`)
        req.headers.set('x-custom', 'from-middleware')

        return next(req)
      }],
    })
    const ctx = ctxOf()
    const p = xhrTransport({ client, url: (f) => `/files/${f.id}`, method: 'PUT' }).upload(tf(), ctx)

    await tick(30)
    const r = xhr.last()

    expect(r.method).toBe('PUT')
    expect(r.url).toBe('https://api.test/files/u1')
    expect(r.header('authorization')).toBe('Bearer abc')
    expect(r.header('x-custom')).toBe('from-middleware')
    expect(seen).toEqual(['PUT https://api.test/files/u1'])
    r.progress(500, 2000)
    r.progress(250, 0, false)
    expect(ctx.seen).toEqual([250, 250])
    r.respond({ status: 200, body: '{"id":1}', headers: { 'content-type': 'application/json' } })
    await expect(p).resolves.toEqual({ id: 1 })
  })

  it('a non-2xx from the client is an upload error with status, Retry-After and body', async () => {
    const client = createHttp({ baseUrl: 'https://api.test' })
    const p = xhrTransport({ client, url: '/u' }).upload(tf(), ctxOf())

    await tick(30)
    xhr.last().respond({ status: 503, body: '{"busy":true}', headers: { 'content-type': 'application/json', 'retry-after': '3' } })
    expect(await rejection(p)).toMatchObject({ kind: 'server', status: 503, retryable: true, retryAfter: 3000, body: { busy: true } })
  })

  it('a 4xx from the client is not retryable; a network failure is a non-retryable network error (the client reports it as a bug-shaped TypeError)', async () => {
    const client = createHttp({ baseUrl: 'https://api.test' })
    const t = xhrTransport({ client, url: '/u' })
    const a = t.upload(tf(), ctxOf())

    await tick(30)
    xhr.last().respond({ status: 403 })
    expect(await rejection(a)).toMatchObject({ kind: 'server', status: 403, retryable: false })
    const b = t.upload(tf(), ctxOf())

    await tick(30)
    xhr.last().fail()
    expect(await rejection(b)).toMatchObject({ kind: 'network' })
  })

  it('aborting through the queue signal aborts the client request: the error is aborted', async () => {
    const client = createHttp({ baseUrl: 'https://api.test' })
    const ctx = ctxOf()
    const p = xhrTransport({ client, url: '/u' }).upload(tf(), ctx)

    await tick(30)
    ctx.controller.abort()
    expect(xhr.last().aborted).toBe(true)
    expect(await rejection(p)).toMatchObject({ kind: 'aborted' })
  })
})
