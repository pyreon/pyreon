// The chunked transport under the unit runner. The server is the docs' reference handler (`reference-chunked.ts`), reached
// through the XHR double; Chromium runs the same handler behind a real server in `resumable.browser.test.ts` (the real path).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createResumeStore, createUploader } from '../index'
import { chunkedTransport } from '../transport-chunked'
import type { TransportContext, TransportFile, UploadError } from '../types'
import { FakeXhr, installFakeXhr } from './fake-xhr'
import { type Handler, serve } from './fake-servers'
import { chunkedHandler, openUploads } from './reference-chunked'

let xhr: ReturnType<typeof installFakeXhr>

beforeEach(() => {
  xhr = installFakeXhr()
})

afterEach(() => {
  xhr.restore()
  vi.unstubAllGlobals()
})

const BASE = 'http://up.test/api/uploads'
const reference: Handler = (req) => chunkedHandler(req)

const bytes = (n: number): Uint8Array<ArrayBuffer> => Uint8Array.from({ length: n }, (_, i) => i % 251)

const tf = (size: number, over: Partial<TransportFile> = {}): TransportFile => {
  const file = new File([bytes(size)], 'v.bin', { type: 'application/octet-stream', lastModified: 1 })

  return { id: 'u1', file, name: 'v.bin', size, type: file.type, meta: { album: 'a' }, ...over }
}

type Ctx = TransportContext & { controller: AbortController; saved: unknown[]; seen: number[] }

const ctxOf = (resumeState?: unknown): Ctx => {
  const controller = new AbortController()
  const saved: unknown[] = []
  const seen: number[] = []

  return { signal: controller.signal, onProgress: (n) => seen.push(n), resumeState, saveResumeState: (s) => saved.push(s), controller, saved, seen }
}

const failure = async (p: Promise<unknown>): Promise<UploadError> => {
  try {
    await p
  } catch (error) {
    return error as UploadError
  }
  throw new Error('expected the upload to fail')
}

describe('chunkedTransport: options', () => {
  it('refuses bad options with [Pyreon] errors that show the fix', () => {
    expect(() => chunkedTransport(undefined as never)).toThrow('[Pyreon] chunkedTransport: expected { url: "/api/uploads" }.')
    expect(() => chunkedTransport({} as never)).toThrow(TypeError)
    expect(() => chunkedTransport({ url: '/u', chunkSize: 0 })).toThrow(/chunkSize must be a whole number of bytes from 1, got 0/)
    expect(() => chunkedTransport({ url: '/u', chunkSize: 1.5 })).toThrow(RangeError)
    expect(() => chunkedTransport({ url: '/u', parallel: 0 })).toThrow(/parallel must be a whole number from 1, got 0/)
  })
})

describe('chunkedTransport: a new upload against the reference handler', () => {
  it('creates the upload, sends every part, completes, and the server joins exactly the file', async () => {
    const s = serve(reference)
    const ctx = ctxOf()
    const result = await chunkedTransport({ url: BASE, chunkSize: 100, parallel: 2 }).upload(tf(250), ctx)

    expect(result).toEqual({ name: 'v.bin', size: 250 })
    expect(s.log[0]).toBe('POST /api/uploads')
    expect(s.log.filter((l) => l.startsWith('PUT')).sort()).toEqual(['/0', '/1', '/2'].map((n) => expect.stringMatching(new RegExp(`^PUT /api/uploads/[^/]+/parts${n}$`))))
    expect(s.log.at(-1)).toMatch(/^POST \/api\/uploads\/[^/]+\/complete$/)
    expect(openUploads()).toBe(0)
    const init = JSON.parse(await new Response(xhr.requests[0]!.body as BodyInit).text())

    expect(init).toEqual({ name: 'v.bin', size: 250, type: 'application/octet-stream', chunkSize: 100, meta: { album: 'a' } })
    expect(xhr.requests[0]!.header('content-type')).toBe('application/json')
    expect(xhr.requests[1]!.header('content-type')).toBe('application/octet-stream')
  })

  it('saves the state before the first part and after each part, and progress counts finished and in-flight bytes up to the size', async () => {
    serve(reference)
    const ctx = ctxOf()

    await chunkedTransport({ url: BASE, chunkSize: 100, parallel: 1 }).upload(tf(250), ctx)
    const states = ctx.saved as { uploadId: string; chunkSize: number; done: number[] }[]

    expect(states.map((x) => x.done)).toEqual([[], [0], [0, 1], [0, 1, 2]])
    expect(new Set(states.map((x) => x.uploadId)).size).toBe(1)
    expect(states[0]!.chunkSize).toBe(100)
    for (let i = 1; i < ctx.seen.length; i++) expect(ctx.seen[i]!).toBeGreaterThanOrEqual(ctx.seen[i - 1]!)
    expect(ctx.seen.at(-1)).toBe(250)
    expect(ctx.seen).toContain(50)
  })

  it('never has more than `parallel` parts on the wire, and keeps that many busy', async () => {
    serve(reference)
    const answer = FakeXhr.onSend!
    let most = 0

    FakeXhr.onSend = (x) => {
      answer(x)
      most = Math.max(most, xhr.requests.filter((r) => r.method === 'PUT' && !r.done).length)
    }
    await expect(chunkedTransport({ url: BASE, chunkSize: 10, parallel: 3 }).upload(tf(95), ctxOf())).resolves.toEqual({ name: 'v.bin', size: 95 })
    expect(xhr.requests.filter((r) => r.method === 'PUT')).toHaveLength(10)
    expect(most).toBe(3)
  })

  it('a zero-byte file is one empty part', async () => {
    const s = serve(reference)

    await expect(chunkedTransport({ url: BASE }).upload(tf(0), ctxOf())).resolves.toEqual({ name: 'v.bin', size: 0 })
    expect(s.log.filter((l) => l.startsWith('PUT'))).toHaveLength(1)
  })

  it('with checksum each part carries its SHA-256, which the reference handler verifies', async () => {
    serve(reference)

    await expect(chunkedTransport({ url: BASE, chunkSize: 64, checksum: 'sha-256' }).upload(tf(130), ctxOf())).resolves.toEqual({ name: 'v.bin', size: 130 })
    const sums = xhr.requests.filter((r) => r.method === 'PUT').map((r) => r.header('x-part-sha256'))

    expect(sums).toHaveLength(3)
    for (const s of sums) expect(s).toMatch(/^[0-9a-f]{64}$/)
  })

  it('a wrong checksum is a 422 from the server: a server error the queue does not retry', async () => {
    serve(async (req) => {
      if (req.method === 'PUT') {
        const forged = new Headers(req.headers)

        forged.set('x-part-sha256', '0'.repeat(64))

        return chunkedHandler(new Request(req.url, { method: 'PUT', headers: forged, body: await req.arrayBuffer() }))
      }

      return chunkedHandler(req)
    })
    expect(await failure(chunkedTransport({ url: BASE, checksum: 'sha-256' }).upload(tf(10), ctxOf()))).toMatchObject({ kind: 'server', status: 422, retryable: false, body: { error: 'checksum mismatch' } })
  })

  it('uses the chunk size the server asks for', async () => {
    const s = serve(async (req) => {
      const res = await chunkedHandler(req)

      if (req.method === 'POST' && new URL(req.url).pathname === '/api/uploads') return Response.json({ ...(await res.json()), chunkSize: 50.7 }, { status: 201 })

      return res
    })

    await chunkedTransport({ url: BASE, chunkSize: 100 }).upload(tf(120), ctxOf())
    expect(s.log.filter((l) => l.startsWith('PUT'))).toHaveLength(3)
  })

  it('a first answer without uploadId fails for good, carrying the body', async () => {
    serve(() => Response.json({ id: 'wrong-field' }, { status: 201 }))
    const e = await failure(chunkedTransport({ url: BASE }).upload(tf(10), ctxOf()))

    expect(e).toMatchObject({ kind: 'server', retryable: false, body: { id: 'wrong-field' } })
    expect(e.message).toMatch(/did not answer \{ uploadId \}/)
  })

  it('the url may be a function and a trailing slash is dropped; headers (async) go on every request; credentials and timeout apply', async () => {
    serve(reference)
    const headers = vi.fn(async () => ({ authorization: 'Bearer t' }))

    await chunkedTransport({ url: (f) => `${BASE}/?for=${f.id}`.replace('/?for=u1', '/'), headers, withCredentials: true, timeout: 999, chunkSize: 5 }).upload(tf(9), ctxOf())
    expect(headers).toHaveBeenCalledTimes(1)
    for (const r of xhr.requests) {
      expect(r.header('authorization')).toBe('Bearer t')
      expect(r.withCredentials).toBe(true)
      expect(r.timeout).toBe(999)
    }
    expect(xhr.requests[0]!.url).toBe(BASE)
  })
})

describe('chunkedTransport: resuming', () => {
  /** Start an upload and stop it after `parts` parts reached the server; answers the state saved so far. */
  async function startThenStop(size: number, chunkSize: number, parts: number): Promise<{ state: { uploadId: string; chunkSize: number; done: number[] }; log: string[] }> {
    const s = serve(reference)
    let puts = 0

    s.hold((x) => x.method === 'PUT' && ++puts > parts)
    const ctx = ctxOf()
    const p = chunkedTransport({ url: BASE, chunkSize, parallel: 1 }).upload(tf(size), ctx)

    await vi.waitFor(() => expect(s.held).toHaveLength(1))
    ctx.controller.abort({ cause: 'pause' })
    expect(await failure(p)).toMatchObject({ kind: 'aborted', cause: 'pause' })

    return { state: ctx.saved.at(-1) as never, log: s.log }
  }

  it('asks the server which parts it has and sends only the others; pausing sends no DELETE', async () => {
    const { state, log } = await startThenStop(300, 100, 1)

    expect(state.done).toEqual([0])
    expect(log.some((l) => l.startsWith('DELETE'))).toBe(false)
    const s = serve(reference)
    const ctx = ctxOf(state)

    await expect(chunkedTransport({ url: BASE, chunkSize: 100 }).upload(tf(300), ctx)).resolves.toEqual({ name: 'v.bin', size: 300 })
    expect(s.log[0]).toBe(`GET /api/uploads/${state.uploadId}`)
    expect(s.log.filter((l) => l.startsWith('PUT')).map((l) => l.split('/').at(-1)).sort()).toEqual(['1', '2'])
    expect(s.log.some((l) => l === 'POST /api/uploads')).toBe(false)
    expect(ctx.seen[0]).toBe(100)
  })

  it('the server list wins over a saved state that claims parts the server does not have', async () => {
    const { state } = await startThenStop(300, 100, 1)
    const s = serve(reference)

    await chunkedTransport({ url: BASE, chunkSize: 100 }).upload(tf(300), ctxOf({ ...state, done: [0, 1, 2] }))
    expect(s.log.filter((l) => l.startsWith('PUT')).map((l) => l.split('/').at(-1)).sort()).toEqual(['1', '2'])
  })

  it('an upload the server forgot (404) starts over with a new one', async () => {
    const s = serve(reference)

    await expect(chunkedTransport({ url: BASE, chunkSize: 100 }).upload(tf(150), ctxOf({ uploadId: 'gone', chunkSize: 100, done: [0] }))).resolves.toEqual({ name: 'v.bin', size: 150 })
    expect(s.log.slice(0, 2)).toEqual(['GET /api/uploads/gone', 'POST /api/uploads'])
    expect(s.log.filter((l) => l.startsWith('PUT'))).toHaveLength(2)
  })

  it('a 410 also starts over; a received list with junk keeps only whole, non-negative, distinct indexes', async () => {
    const gone = serve((req) => (req.method === 'GET' ? new Response(null, { status: 410 }) : chunkedHandler(req)))

    await chunkedTransport({ url: BASE, chunkSize: 100 }).upload(tf(150), ctxOf({ uploadId: 'x', chunkSize: 100, done: [] }))
    expect(gone.log[1]).toBe('POST /api/uploads')
    const { state } = await startThenStop(300, 100, 1)
    const s = serve((req) => (req.method === 'GET' ? Response.json({ received: [0, 0, -1, 1.5, 'x'] }) : chunkedHandler(req)))

    await chunkedTransport({ url: BASE, chunkSize: 100 }).upload(tf(300), ctxOf(state))
    expect(s.log.filter((l) => l.startsWith('PUT')).map((l) => l.split('/').at(-1)).sort()).toEqual(['1', '2'])
  })

  it('a GET answered without a received list resends every part', async () => {
    const { state } = await startThenStop(200, 100, 1)
    const s = serve((req) => (req.method === 'GET' ? new Response(null, { status: 200 }) : chunkedHandler(req)))

    await chunkedTransport({ url: BASE, chunkSize: 100 }).upload(tf(200), ctxOf(state))
    expect(s.log.filter((l) => l.startsWith('PUT'))).toHaveLength(2)
  })

  it('garbage resume state is ignored: a new upload is created', async () => {
    for (const garbage of [null, 'x', 5, [], { uploadId: 1, chunkSize: 1, done: [] }, { uploadId: 'a', chunkSize: '1', done: [] }, { uploadId: 'a', chunkSize: 1, done: 'x' }]) {
      const s = serve(reference)

      await chunkedTransport({ url: BASE }).upload(tf(5), ctxOf(garbage))
      expect(s.log[0], JSON.stringify(garbage)).toBe('POST /api/uploads')
    }
  })

  it('a GET that fails (503) fails the attempt as retryable', async () => {
    serve(() => new Response(null, { status: 503 }))
    expect(await failure(chunkedTransport({ url: BASE }).upload(tf(5), ctxOf({ uploadId: 'a', chunkSize: 5, done: [] })))).toMatchObject({ kind: 'server', status: 503, retryable: true })
  })
})

describe('chunkedTransport: failures and cancel', () => {
  it('a failing part stops the pool: no new part starts, running ones finish, and the error is the first one', async () => {
    let puts = 0
    const s = serve((req) => {
      if (req.method === 'PUT' && ++puts === 2) return new Response(null, { status: 503, headers: { 'retry-after': '7' } })

      return chunkedHandler(req)
    })
    const e = await failure(chunkedTransport({ url: BASE, chunkSize: 10, parallel: 2 }).upload(tf(100), ctxOf()))

    expect(e).toMatchObject({ kind: 'server', status: 503, retryable: true, retryAfter: 7000 })
    expect(s.log.filter((l) => l.startsWith('PUT')).length).toBeLessThanOrEqual(3)
    expect(s.log.some((l) => l.endsWith('/complete'))).toBe(false)
  })

  it('cancel and remove tell the server to forget the upload (DELETE, not awaited); the server then has nothing open', async () => {
    for (const cause of ['cancel', 'remove']) {
      const before = openUploads()
      const s = serve(reference)

      s.hold((x) => x.method === 'PUT')
      const ctx = ctxOf()
      const p = chunkedTransport({ url: BASE, chunkSize: 10 }).upload(tf(30), ctx)

      await vi.waitFor(() => expect(s.held.length).toBeGreaterThan(0))
      expect(openUploads()).toBe(before + 1)
      ctx.controller.abort({ cause })
      expect(await failure(p)).toMatchObject({ kind: 'aborted', cause })
      await vi.waitFor(() => expect(s.log.at(-1)).toMatch(/^DELETE \/api\/uploads\/[^/]+$/))
      await vi.waitFor(() => expect(openUploads()).toBe(before))
    }
  })

  it('a failing DELETE is ignored; a cancel before the upload was created sends none', async () => {
    const s = serve((req) => (req.method === 'DELETE' ? Promise.reject(new TypeError('offline')) : chunkedHandler(req)))

    s.hold((x) => x.method === 'PUT')
    const ctx = ctxOf()
    const p = chunkedTransport({ url: BASE, chunkSize: 10 }).upload(tf(30), ctx)

    await vi.waitFor(() => expect(s.held.length).toBeGreaterThan(0))
    ctx.controller.abort({ cause: 'cancel' })
    expect((await failure(p)).kind).toBe('aborted')
    const early = serve(reference)

    early.hold(() => true)
    const ctx2 = ctxOf()
    const p2 = chunkedTransport({ url: BASE }).upload(tf(5), ctx2)

    await vi.waitFor(() => expect(early.held).toHaveLength(1))
    ctx2.controller.abort({ cause: 'cancel' })
    expect((await failure(p2)).kind).toBe('aborted')
    expect(early.log).toEqual(['POST /api/uploads'])
  })
})

describe('chunkedTransport in a queue with a persisted resume store', () => {
  it('a new queue with the same store and the same file sends only the parts the first one did not finish', async () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) }
    const file = new File([bytes(300)], 'v.bin', { type: 'application/octet-stream', lastModified: 7 })
    const s = serve(reference)
    let puts = 0

    s.hold((x) => x.method === 'PUT' && ++puts > 2)
    const first = createUploader({ transport: chunkedTransport({ url: BASE, chunkSize: 100, parallel: 1 }), resume: createResumeStore(storage) })

    first.add([file])
    await vi.waitFor(() => expect(s.held).toHaveLength(1))
    first.dispose()
    expect(memory.size).toBe(1)
    const fresh = serve(reference)
    const second = createUploader({ transport: chunkedTransport({ url: BASE, chunkSize: 100, parallel: 1 }), resume: createResumeStore(storage) })
    const [f] = second.add([file])

    await vi.waitFor(() => expect(f!.status()).toBe('done'))
    expect(fresh.log.filter((l) => l.startsWith('PUT')).map((l) => l.split('/').at(-1))).toEqual(['2'])
    expect(f!.result()).toEqual({ name: 'v.bin', size: 300 })
    expect(memory.size).toBe(0)
    second.dispose()
  })
})
