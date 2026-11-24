// The S3 transport under the unit runner, against an in-memory S3 store (`fake-servers.ts`: presigned PUT with a signature
// check and an MD5 ETag, and the app's multipart callbacks on the same store). The real path is the S3 multipart mimic behind
// a real server in `resumable.browser.test.ts`. Neither is real S3, R2 or MinIO.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUploader } from '../index'
import { s3Transport } from '../transport-s3'
import type { TransportContext, TransportFile, UploadError } from '../types'
import { FakeXhr, installFakeXhr } from './fake-xhr'
import { s3Server, serve } from './fake-servers'

let xhr: ReturnType<typeof installFakeXhr>

beforeEach(() => {
  xhr = installFakeXhr()
})

afterEach(() => {
  xhr.restore()
  vi.unstubAllGlobals()
})

const MiB = 1024 * 1024

const tf = (size: number): TransportFile => {
  const file = new File([new Uint8Array(size).map((_, i) => i % 7)], 'big.mov', { type: 'video/quicktime' })

  return { id: 'u1', file, name: 'big.mov', size, type: file.type, meta: {} }
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

const presign = vi.fn(async () => ({ url: 'http://s3.test/bucket/small?sig=ok&X-Amz-Expires=60', headers: { 'content-type': 'video/quicktime' } }))

describe('s3Transport: options', () => {
  it('refuses bad options with [Pyreon] errors', () => {
    expect(() => s3Transport({} as never)).toThrow('[Pyreon] s3Transport: expected { presign: (file) => Promise<{ url, headers? }> }.')
    expect(() => s3Transport(null as never)).toThrow(TypeError)
    expect(() => s3Transport({ presign, parallel: 0 })).toThrow(/parallel must be a whole number from 1, got 0/)
    expect(() => s3Transport({ presign, partSize: 0 })).toThrow(/partSize must be a whole number of bytes, got 0/)
    expect(() => s3Transport({ presign, partSize: 1.5 })).toThrow(RangeError)
  })
})

describe('s3Transport: one presigned PUT', () => {
  it('a file up to partSize is one PUT with the signed headers; the result is the URL without the query', async () => {
    const s3 = s3Server()
    const s = serve(s3.handler)
    const ctx = ctxOf()

    await expect(s3Transport({ presign, multipart: s3.multipart, withCredentials: true }).upload(tf(1000), ctx)).resolves.toEqual({ url: 'http://s3.test/bucket/small', size: 1000 })
    expect(s.log).toEqual(['PUT /bucket/small'])
    expect(xhr.requests[0]!.header('content-type')).toBe('video/quicktime')
    expect(xhr.requests[0]!.withCredentials).toBe(true)
    expect(s3.objects.get('/bucket/small')).toBe(1000)
    expect(s3.multipart.create).not.toHaveBeenCalled()
    expect(ctx.seen).toEqual([500, 1000])
  })

  it('a method from the presigned answer is used; without multipart a big file is still one request', async () => {
    const s = serve(() => new Response(null, { status: 204 }))

    await s3Transport({ presign: async () => ({ url: 'http://s3.test/form', method: 'POST' }) }).upload(tf(9 * MiB), ctxOf())
    expect(s.log).toEqual(['POST /form'])
  })

  it('a bad signature is a 403: a server error that is not retried; a presign that throws fails the upload', async () => {
    serve(s3Server().handler)
    expect(await failure(s3Transport({ presign: async () => ({ url: 'http://s3.test/k?sig=bad' }) }).upload(tf(10), ctxOf()))).toMatchObject({ kind: 'server', status: 403, retryable: false, body: expect.stringContaining('SignatureDoesNotMatch') })
    await expect(s3Transport({ presign: async () => { throw new Error('not signed in') } }).upload(tf(10), ctxOf())).rejects.toThrow('not signed in')
  })
})

describe('s3Transport: multipart', () => {
  it('a file over partSize is sent in parts (5 MiB minimum part, numbered from 1, signed headers), completed in ascending order with every ETag', async () => {
    const s3 = s3Server()

    serve(s3.handler)
    // Answer parts out of order: hold part 1 until the others are done.
    const answer = FakeXhr.onSend!
    let first: FakeXhr | null = null

    FakeXhr.onSend = (x) => {
      if (x.url.includes('partNumber=1&')) first = x
      else answer(x)
    }
    const ctx = ctxOf()
    const p = s3Transport({ presign, multipart: s3.multipart, partSize: 1 }).upload(tf(12 * MiB), ctx)

    await vi.waitFor(() => expect(s3.uploads.get('up-1')?.size).toBe(2))
    answer(first!)
    const result = await p

    expect(result).toEqual({ key: 'key', parts: 3, size: 12 * MiB })
    expect(s3.calls).toEqual(['create up-1', 'complete up-1 1,2,3'])
    expect(s3.multipart.signPart.mock.calls.map(([, x]) => x.partNumber).sort()).toEqual([1, 2, 3])
    expect(xhr.requests.every((r) => r.header('x-amz-test') === 'signed')).toBe(true)
    expect(xhr.requests.map((r) => (r.body as Blob).size).sort((a, b) => a - b)).toEqual([2 * MiB, 5 * MiB, 5 * MiB])
    const last = ctx.saved.at(-1) as { uploadId: string; partSize: number; parts: { partNumber: number }[] }

    expect(last.uploadId).toBe('up-1')
    expect(last.partSize).toBe(5 * MiB)
    expect(last.parts.map((x) => x.partNumber)).toEqual([2, 3, 1])
    expect((ctx.saved[0] as { parts: unknown[] }).parts).toEqual([])
    expect(ctx.seen.at(-1)).toBe(12 * MiB)
  })

  it('a part answer without an ETag (not exposed by CORS) fails for good and names ExposeHeaders', async () => {
    const s3 = s3Server({ exposeEtag: false })

    serve(s3.handler)
    const e = await failure(s3Transport({ presign, multipart: s3.multipart }).upload(tf(9 * MiB), ctxOf()))

    expect(e).toMatchObject({ kind: 'server', retryable: false })
    expect(e.message).toMatch(/ExposeHeaders/)
  })

  it('resuming with list sends only the parts S3 does not report; a part S3 lost is sent again', async () => {
    const s3 = s3Server()

    serve(s3.handler)
    const ctx = ctxOf()
    const answer = FakeXhr.onSend!
    let n = 0

    FakeXhr.onSend = (x) => {
      if (++n === 1) answer(x)
    }
    const p = s3Transport({ presign, multipart: s3.multipart, parallel: 1 }).upload(tf(12 * MiB), ctx)

    await vi.waitFor(() => expect(ctx.saved).toHaveLength(2))
    ctx.controller.abort({ cause: 'pause' })
    expect(await failure(p)).toMatchObject({ kind: 'aborted' })
    expect(s3.multipart.abort).not.toHaveBeenCalled()
    const saved = ctx.saved.at(-1) as { uploadId: string; parts: { partNumber: number; etag: string }[] }

    expect(saved.parts.map((x) => x.partNumber)).toEqual([1])
    const s = serve(s3.handler)
    const result = await s3Transport({ presign, multipart: s3.multipart }).upload(tf(12 * MiB), ctxOf({ ...saved, parts: [...saved.parts, { partNumber: 2, etag: '"made-up"' }] }))

    expect(result).toMatchObject({ parts: 2 })
    expect(s.log).toEqual(['PUT /bucket/key'])
    expect(s3.multipart.list).toHaveBeenCalledWith(expect.anything(), { uploadId: saved.uploadId })
    expect(s3.multipart.create).toHaveBeenCalledTimes(1)
  })

  it('without list, a resumed upload trusts the saved part list', async () => {
    const s3 = s3Server()
    const { list: _list, ...noList } = s3.multipart

    serve(s3.handler)
    const { uploadId } = await s3.multipart.create()
    const s = serve(s3.handler)
    const done = s3Transport({ presign, multipart: noList }).upload(tf(9 * MiB), ctxOf({ uploadId, partSize: 8 * MiB, parts: [{ partNumber: 1, etag: '"x"' }] }))

    // Part 1 was never stored, so S3 refuses the completion: the transport did not resend it.
    await expect(done).rejects.toThrow('InvalidPart 1')
    expect(s.log).toEqual(['PUT /bucket/key'])
  })

  it('a part signed with a method and no extra headers is sent with that method and no headers', async () => {
    const s3 = s3Server()

    serve(s3.handler)
    s3.multipart.signPart.mockImplementation(async (_f, p) => ({ url: `http://s3.test/bucket/key?uploadId=${p.uploadId}&partNumber=${p.partNumber}&sig=ok`, method: 'PUT' }) as never)
    await s3Transport({ presign, multipart: s3.multipart }).upload(tf(9 * MiB), ctxOf())
    expect(xhr.requests.map((r) => [r.method, r.headers])).toEqual([['PUT', {}], ['PUT', {}]])
  })

  it('garbage resume state starts a new multipart upload', async () => {
    for (const garbage of [null, 'x', { uploadId: 1, partSize: 1, parts: [] }, { uploadId: 'a', partSize: '1', parts: [] }, { uploadId: 'a', partSize: 1, parts: 'no' }]) {
      const s3 = s3Server()

      serve(s3.handler)
      await s3Transport({ presign, multipart: s3.multipart }).upload(tf(9 * MiB), ctxOf(garbage))
      expect(s3.multipart.create, JSON.stringify(garbage)).toHaveBeenCalledTimes(1)
    }
  })

  it('cancel and remove abort the multipart upload; a failing abort is ignored; a store without abort is fine', async () => {
    for (const cause of ['cancel', 'remove']) {
      const s3 = s3Server()
      const s = serve(s3.handler)

      s.hold(() => true)
      const ctx = ctxOf()
      const p = s3Transport({ presign, multipart: s3.multipart }).upload(tf(9 * MiB), ctx)

      await vi.waitFor(() => expect(s.held.length).toBeGreaterThan(0))
      ctx.controller.abort({ cause })
      expect((await failure(p)).cause).toBe(cause)
      expect(s3.calls).toEqual(['create up-1', 'abort up-1'])
      expect(s3.uploads.size).toBe(0)
    }
    const s3 = s3Server()
    const s = serve(s3.handler)

    s.hold(() => true)
    s3.multipart.abort.mockRejectedValueOnce(new Error('network'))
    const ctx = ctxOf()
    const p = s3Transport({ presign, multipart: s3.multipart }).upload(tf(9 * MiB), ctx)

    await vi.waitFor(() => expect(s.held.length).toBeGreaterThan(0))
    ctx.controller.abort({ cause: 'cancel' })
    expect((await failure(p)).kind).toBe('aborted')
    const { abort: _abort, ...noAbort } = s3Server().multipart
    const s2 = serve(s3.handler)

    s2.hold(() => true)
    const ctx2 = ctxOf()
    const p2 = s3Transport({ presign, multipart: { ...noAbort, create: s3.multipart.create } }).upload(tf(9 * MiB), ctx2)

    await vi.waitFor(() => expect(s2.held.length).toBeGreaterThan(0))
    ctx2.controller.abort({ cause: 'cancel' })
    expect((await failure(p2)).kind).toBe('aborted')
  })

  it('a create that fails before an upload exists aborts nothing', async () => {
    const s3 = s3Server()

    serve(s3.handler)
    s3.multipart.create.mockRejectedValueOnce(new Error('no credentials'))
    const ctx = ctxOf()

    ctx.controller.abort({ cause: 'cancel' })
    await expect(s3Transport({ presign, multipart: s3.multipart }).upload(tf(9 * MiB), ctx)).rejects.toThrow('no credentials')
    expect(s3.multipart.abort).not.toHaveBeenCalled()
  })
})

describe('s3Transport in a queue', () => {
  it('a 503 on a part is retried by the queue and continues with the missing parts only', async () => {
    const s3 = s3Server()
    let puts = 0

    serve((req) => (++puts === 2 ? new Response(null, { status: 503 }) : s3.handler(req)))
    const up = createUploader({ transport: s3Transport({ presign, multipart: s3.multipart, parallel: 1 }), retry: { attempts: 2, backoff: () => 0 } })
    const [f] = up.add([tf(12 * MiB).file as File])

    await vi.waitFor(() => expect(f!.status()).toBe('done'))
    expect(f!.attempt()).toBe(2)
    expect(puts).toBe(3)
    expect(s3.multipart.create).toHaveBeenCalledTimes(1)
    expect(f!.result()).toMatchObject({ parts: 2 })
    up.dispose()
  })
})
