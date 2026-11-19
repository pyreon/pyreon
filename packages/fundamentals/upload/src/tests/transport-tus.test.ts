// The tus transport under the unit runner, against an in-memory tus 1.0 server (`fake-servers.ts`: creation, HEAD, PATCH with
// offset conflicts, termination). The real path is the tus server behind a real dev server in `resumable.browser.test.ts`;
// neither is tusd.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUploader } from '../index'
import { tusTransport } from '../transport-tus'
import type { TransportContext, TransportFile, UploadError } from '../types'
import { FakeXhr, installFakeXhr } from './fake-xhr'
import { serve, tusServer } from './fake-servers'

let xhr: ReturnType<typeof installFakeXhr>

beforeEach(() => {
  xhr = installFakeXhr()
})

afterEach(() => {
  xhr.restore()
  vi.unstubAllGlobals()
})

const ENDPOINT = 'http://up.test/files'

const tf = (size: number, name = 'clip.mp4'): TransportFile => {
  const file = new File([new Uint8Array(size)], name, { type: 'video/mp4' })

  return { id: 'u1', file, name, size, type: file.type, meta: {} }
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

describe('tusTransport: options', () => {
  it('refuses bad options with [Pyreon] errors', () => {
    expect(() => tusTransport({} as never)).toThrow('[Pyreon] tusTransport: expected { endpoint: "/files" }.')
    expect(() => tusTransport(null as never)).toThrow(TypeError)
    expect(() => tusTransport({ endpoint: '/f', chunkSize: 0 })).toThrow(/chunkSize must be a whole number of bytes from 1 \(or Infinity\), got 0/)
    expect(() => tusTransport({ endpoint: '/f', chunkSize: NaN })).toThrow(RangeError)
  })
})

describe('tusTransport: a new upload', () => {
  it('creates with Upload-Length and metadata, PATCHes each chunk at the confirmed offset, and saves the upload URL', async () => {
    const tus = tusServer()
    const s = serve(tus.handler)
    const ctx = ctxOf()
    const result = await tusTransport({ endpoint: ENDPOINT, chunkSize: 40 }).upload(tf(100), ctx)

    expect(result).toEqual({ url: 'http://up.test/files/f1', size: 100 })
    expect(s.log).toEqual(['POST /files', 'PATCH /files/f1', 'PATCH /files/f1', 'PATCH /files/f1'])
    const [post, ...patches] = xhr.requests

    expect(post!.header('tus-resumable')).toBe('1.0.0')
    expect(post!.header('upload-length')).toBe('100')
    expect(post!.header('upload-metadata')).toBe(`filename ${btoa('clip.mp4')},filetype ${btoa('video/mp4')}`)
    expect(patches.map((p) => p.header('upload-offset'))).toEqual(['0', '40', '80'])
    expect(patches.map((p) => (p.body as Blob).size)).toEqual([40, 40, 20])
    expect(patches.every((p) => p.header('content-type') === 'application/offset+octet-stream')).toBe(true)
    expect(ctx.saved).toEqual([{ url: 'http://up.test/files/f1' }])
    expect(tus.uploads.get('f1')).toMatchObject({ offset: 100, length: 100 })
    expect(ctx.seen[0]).toBe(0)
    expect(ctx.seen.at(-1)).toBe(100)
    for (let i = 1; i < ctx.seen.length; i++) expect(ctx.seen[i]!).toBeGreaterThanOrEqual(ctx.seen[i - 1]!)
  })

  it('custom metadata (empty values left out), an endpoint function, async headers, credentials and timeout', async () => {
    const tus = tusServer()

    serve(tus.handler)
    const headers = vi.fn(async () => ({ authorization: 'Bearer t' }))

    await tusTransport({ endpoint: (f) => `http://up.test/files?for=${f.id}`, metadata: () => ({ owner: 'me', note: '' }), headers, withCredentials: true, timeout: 500 }).upload(tf(10), ctxOf())
    expect(xhr.requests[0]!.header('upload-metadata')).toBe(`owner ${btoa('me')}`)
    for (const r of xhr.requests) {
      expect(r.header('authorization')).toBe('Bearer t')
      expect(r.withCredentials).toBe(true)
      expect(r.timeout).toBe(500)
    }
  })

  it('metadata with no values sends no Upload-Metadata header; a bad metadata key fails before any request', async () => {
    const s = serve(tusServer().handler)

    await tusTransport({ endpoint: ENDPOINT, metadata: () => ({}) }).upload(tf(5), ctxOf())
    expect(xhr.requests[0]!.header('upload-metadata')).toBeUndefined()
    await expect(tusTransport({ endpoint: ENDPOINT, metadata: () => ({ 'a b': 'x' }) }).upload(tf(5), ctxOf())).rejects.toThrow(/metadata key/)
    expect(s.log).toHaveLength(2)
  })

  it('chunkSize Infinity sends the whole file in one PATCH; a zero-byte file is created and needs no PATCH', async () => {
    const s = serve(tusServer().handler)

    await tusTransport({ endpoint: ENDPOINT, chunkSize: Infinity }).upload(tf(100), ctxOf())
    await tusTransport({ endpoint: ENDPOINT }).upload(tf(0), ctxOf())
    expect(s.log).toEqual(['POST /files', 'PATCH /files/f1', 'POST /files'])
  })

  it('a server that keeps fewer bytes than sent is followed: the next PATCH starts at its Upload-Offset', async () => {
    const s = serve(tusServer({ acceptAtMost: 30 }).handler)

    await tusTransport({ endpoint: ENDPOINT, chunkSize: 50 }).upload(tf(100), ctxOf())
    expect(xhr.requests.slice(1).map((p) => p.header('upload-offset'))).toEqual(['0', '30', '60', '90'])
    expect(s.log.filter((l) => l.startsWith('PATCH'))).toHaveLength(4)
  })
})

describe('tusTransport: answers that break the protocol', () => {
  it('201 without Location fails for good, naming the header', async () => {
    serve(tusServer({ noLocation: true }).handler)
    const e = await failure(tusTransport({ endpoint: ENDPOINT }).upload(tf(5), ctxOf()))

    expect(e).toMatchObject({ kind: 'server', retryable: false })
    expect(e.message).toMatch(/without a Location header/)
  })

  it('a PATCH answered without a new Upload-Offset, or with one that does not advance, fails for good', async () => {
    for (const patchOffset of [() => null, () => 0, (o: number, kept: number) => o - kept]) {
      serve(tusServer({ patchOffset }).handler)
      const e = await failure(tusTransport({ endpoint: ENDPOINT }).upload(tf(5), ctxOf()))

      expect(e).toMatchObject({ kind: 'server', retryable: false })
      expect(e.message).toMatch(/did not answer a new Upload-Offset/)
    }
  })

  it('an offset conflict (409) is a server error that is not retried', async () => {
    const tus = tusServer()

    serve(tus.handler)
    // The server moved on (another tab sent bytes): the transport's PATCH at the old offset conflicts.
    const answer = FakeXhr.onSend!

    FakeXhr.onSend = (x) => {
      if (x.method === 'PATCH') tus.uploads.get('f1')!.offset = 3
      answer(x)
    }
    expect(await failure(tusTransport({ endpoint: ENDPOINT }).upload(tf(5), ctxOf()))).toMatchObject({ kind: 'server', status: 409, retryable: false })
  })

  it('a server without tus (412) is not retried; a 5xx on creation is', async () => {
    serve(() => new Response(null, { status: 412 }))
    expect(await failure(tusTransport({ endpoint: ENDPOINT }).upload(tf(5), ctxOf()))).toMatchObject({ status: 412, retryable: false })
    serve(() => new Response(null, { status: 503 }))
    expect(await failure(tusTransport({ endpoint: ENDPOINT }).upload(tf(5), ctxOf()))).toMatchObject({ status: 503, retryable: true })
  })
})

describe('tusTransport: resuming', () => {
  async function partly(tus: ReturnType<typeof tusServer>, sent: number): Promise<{ url: string }> {
    serve(tus.handler)
    const ctx = ctxOf()
    const answer = FakeXhr.onSend!
    let patches = 0

    FakeXhr.onSend = (x) => {
      if (x.method !== 'PATCH' || ++patches <= sent) answer(x)
    }
    const p = tusTransport({ endpoint: ENDPOINT, chunkSize: 10 }).upload(tf(50), ctx)

    await vi.waitFor(() => expect(patches).toBe(sent + 1))
    ctx.controller.abort({ cause: 'pause' })
    expect((await failure(p)).cause).toBe('pause')

    return ctx.saved[0] as { url: string }
  }

  it('asks the offset with HEAD and continues from it, with no second POST; pausing sends no DELETE', async () => {
    const tus = tusServer()
    const state = await partly(tus, 2)
    const s = serve(tus.handler)
    const ctx = ctxOf(state)

    await expect(tusTransport({ endpoint: ENDPOINT, chunkSize: 10 }).upload(tf(50), ctx)).resolves.toEqual({ url: state.url, size: 50 })
    expect(s.log).toEqual(['HEAD /files/f1', 'PATCH /files/f1', 'PATCH /files/f1', 'PATCH /files/f1'])
    expect(xhr.requests.find((r) => r.method === 'PATCH' && r.header('upload-offset') === '20')).toBeDefined()
    expect(ctx.seen[0]).toBe(20)
    expect(tus.uploads.get('f1')!.offset).toBe(50)
  })

  it('a saved URL the server forgot (404 or 410) or answers 403 for starts a new upload', async () => {
    for (const status of [404, 410, 403]) {
      const tus = tusServer()
      const s = serve((req) => (req.method === 'HEAD' ? new Response(null, { status }) : tus.handler(req)))

      await tusTransport({ endpoint: ENDPOINT }).upload(tf(5), ctxOf({ url: 'http://up.test/files/old' }))
      expect(s.log.slice(0, 2), String(status)).toEqual(['HEAD /files/old', 'POST /files'])
    }
  })

  it('a saved URL for a different length starts a new upload; a HEAD without Upload-Offset starts at 0', async () => {
    const tus = tusServer()
    const state = await partly(tus, 1)

    tus.uploads.get('f1')!.length = 999
    const s = serve(tus.handler)

    await tusTransport({ endpoint: ENDPOINT, chunkSize: 10 }).upload(tf(50), ctxOf(state))
    expect(s.log.slice(0, 2)).toEqual(['HEAD /files/f1', 'POST /files'])
    const bare = tusServer()
    const again = await partly(bare, 0)
    const s2 = serve((req) => (req.method === 'HEAD' ? new Response(null, { status: 200, headers: { 'tus-resumable': '1.0.0' } }) : bare.handler(req)))

    await tusTransport({ endpoint: ENDPOINT, chunkSize: 10 }).upload(tf(50), ctxOf(again))
    expect(xhr.requests.filter((r) => r.method === 'PATCH').at(-5)!.header('upload-offset')).toBe('0')
    expect(s2.log[0]).toBe('HEAD /files/f1')
  })

  it('garbage resume state is ignored', async () => {
    for (const garbage of [null, 'x', 5, [], { url: 5 }]) {
      const s = serve(tusServer().handler)

      await tusTransport({ endpoint: ENDPOINT }).upload(tf(5), ctxOf(garbage))
      expect(s.log[0], JSON.stringify(garbage)).toBe('POST /files')
    }
  })
})

describe('tusTransport: cancel', () => {
  it('cancel and remove terminate the upload with DELETE; the server forgets it', async () => {
    for (const cause of ['cancel', 'remove']) {
      const tus = tusServer()
      const s = serve(tus.handler)

      s.hold((x) => x.method === 'PATCH')
      const ctx = ctxOf()
      const p = tusTransport({ endpoint: ENDPOINT }).upload(tf(50), ctx)

      await vi.waitFor(() => expect(s.held).toHaveLength(1))
      ctx.controller.abort({ cause })
      expect((await failure(p)).cause).toBe(cause)
      await vi.waitFor(() => expect(s.log.at(-1)).toBe('DELETE /files/f1'))
      await vi.waitFor(() => expect(tus.uploads.size).toBe(0))
    }
  })

  it('a cancel before the upload was created sends no DELETE; a failing DELETE is ignored', async () => {
    const s = serve(tusServer().handler)

    s.hold(() => true)
    const ctx = ctxOf()
    const p = tusTransport({ endpoint: ENDPOINT }).upload(tf(5), ctx)

    await vi.waitFor(() => expect(s.held).toHaveLength(1))
    ctx.controller.abort({ cause: 'cancel' })
    await failure(p)
    expect(s.log).toEqual(['POST /files'])
    const tus = tusServer()
    const s2 = serve((req) => (req.method === 'DELETE' ? Promise.reject(new TypeError('offline')) : tus.handler(req)))

    s2.hold((x) => x.method === 'PATCH')
    const ctx2 = ctxOf()
    const p2 = tusTransport({ endpoint: ENDPOINT }).upload(tf(5), ctx2)

    await vi.waitFor(() => expect(s2.held).toHaveLength(1))
    ctx2.controller.abort({ cause: 'cancel' })
    await failure(p2)
    await vi.waitFor(() => expect(s2.log.at(-1)).toBe('DELETE /files/f1'))
  })
})

describe('tusTransport in a queue', () => {
  it('a network failure mid-upload is retried and resumes with HEAD at the server offset', async () => {
    const tus = tusServer()
    const s = serve(tus.handler)
    const answer = FakeXhr.onSend!
    let patches = 0

    FakeXhr.onSend = (x) => {
      if (x.method === 'PATCH' && ++patches === 2) x.fail()
      else answer(x)
    }
    const up = createUploader({ transport: tusTransport({ endpoint: ENDPOINT, chunkSize: 10 }), retry: { attempts: 2, backoff: () => 0 } })
    const [f] = up.add([tf(30).file as File])

    await vi.waitFor(() => expect(f!.status()).toBe('done'))
    // The failed PATCH never reached the server, so it is not in the log.
    expect(s.log).toEqual(['POST /files', 'PATCH /files/f1', 'HEAD /files/f1', 'PATCH /files/f1', 'PATCH /files/f1'])
    expect(f!.result()).toEqual({ url: 'http://up.test/files/f1', size: 30 })
    up.dispose()
  })
})
