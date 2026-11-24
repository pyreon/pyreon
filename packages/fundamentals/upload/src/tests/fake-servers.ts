// In-memory servers for the resumable transports under the unit runner. The XHR double (`fake-xhr.ts`) turns each request into
// a real `Request` and answers with the handler's `Response`; `fetch` (used for the best-effort DELETE) goes to the same handler.
// The chunked server is the docs' reference handler itself (`reference-chunked.ts`); the tus and S3 servers follow the same
// protocol rules as `servers.ts`, which serves the Chromium tests (`resumable.browser.test.ts`, the real path).
import { createHash } from 'node:crypto'
import { vi } from 'vitest'
import { FakeXhr } from './fake-xhr'

export type Handler = (request: Request) => Response | Promise<Response>

export interface Served {
  /** `METHOD path` of every request, in the order they were sent (XHR and fetch). */
  log: string[]
  /** Requests the test holds back: they stay on the wire until released or aborted. */
  held: FakeXhr[]
  /** Hold requests that match, instead of answering them. */
  hold(match: (xhr: FakeXhr) => boolean): void
  /** Answer the held requests now. */
  release(): Promise<void>
}

const bodyOf = (xhr: FakeXhr): BodyInit | null => (xhr.method === 'GET' || xhr.method === 'HEAD' || xhr.body === null || xhr.body === undefined ? null : (xhr.body as BodyInit))

const sizeOf = (body: unknown): number => (body instanceof Blob ? body.size : typeof body === 'string' ? new TextEncoder().encode(body).length : 0)

async function answer(xhr: FakeXhr, handler: Handler, base: string): Promise<void> {
  const size = sizeOf(xhr.body)

  // Progress like a real upload: half, then all of the body (total counts some envelope bytes, as a real XHR's may).
  if (size > 0) {
    xhr.progress(size / 2, size)
    xhr.progress(size, size)
  }
  const response = await handler(new Request(new URL(xhr.url, base), { method: xhr.method, headers: xhr.headers, body: bodyOf(xhr) }))
  const headers: Record<string, string> = {}

  response.headers.forEach((v, k) => {
    headers[k] = v
  })
  xhr.respond({ status: response.status, body: await response.text(), headers })
}

/** Answer every XHR (and `fetch`) with `handler`. Relative URLs resolve against `base`. */
export function serve(handler: Handler, base = 'http://up.test'): Served {
  const log: string[] = []
  const held: FakeXhr[] = []
  let holdIf: (xhr: FakeXhr) => boolean = () => false

  FakeXhr.onSend = (xhr) => {
    log.push(`${xhr.method} ${new URL(xhr.url, base).pathname}`)
    if (holdIf(xhr)) held.push(xhr)
    else void answer(xhr, handler, base)
  }
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const request = new Request(new URL(input, base), init)

    log.push(`${request.method} ${new URL(request.url).pathname}`)

    return handler(request)
  })

  return {
    log,
    held,
    hold(match) {
      holdIf = match
    },
    async release() {
      const now = held.splice(0)

      holdIf = () => false
      await Promise.all(now.map((xhr) => answer(xhr, handler, base)))
    },
  }
}

// ── tus 1.0 (core, creation, termination) ──────────────────────────────────────────────────────────────────────────────
export interface TusUpload {
  length: number
  offset: number
  metadata: string
}

/** A tus server. `quirks` let a test make it misbehave in the ways the transport must survive. */
export function tusServer(quirks: { patchOffset?: (offset: number, received: number) => number | null; noLocation?: boolean; acceptAtMost?: number } = {}) {
  const uploads = new Map<string, TusUpload>()
  let next = 1
  const base = { 'tus-resumable': '1.0.0' }
  const handler: Handler = async (req) => {
    const path = new URL(req.url).pathname

    if (req.headers.get('tus-resumable') !== '1.0.0') return new Response(null, { status: 412, headers: { 'tus-version': '1.0.0' } })
    if (path === '/files' || path === '/files/') {
      if (req.method !== 'POST') return new Response(null, { status: 405, headers: base })
      const length = Number(req.headers.get('upload-length'))

      if (!Number.isInteger(length) || length < 0) return new Response(null, { status: 400, headers: base })
      const id = `f${next++}`

      uploads.set(id, { length, offset: 0, metadata: req.headers.get('upload-metadata') ?? '' })

      return new Response(null, { status: 201, headers: quirks.noLocation === true ? base : { ...base, location: `/files/${id}` } })
    }
    const id = path.replace(/^\/files\//, '')
    const upload = uploads.get(id)

    if (upload === undefined) return new Response(null, { status: 404, headers: base })
    if (req.method === 'HEAD') return new Response(null, { status: 200, headers: { ...base, 'upload-offset': String(upload.offset), 'upload-length': String(upload.length) } })
    if (req.method === 'DELETE') {
      uploads.delete(id)

      return new Response(null, { status: 204, headers: base })
    }
    if (req.method === 'PATCH') {
      if (req.headers.get('content-type') !== 'application/offset+octet-stream') return new Response(null, { status: 415, headers: base })
      if (Number(req.headers.get('upload-offset')) !== upload.offset) return new Response(null, { status: 409, headers: base })
      const bytes = (await req.arrayBuffer()).byteLength
      const kept = Math.min(bytes, quirks.acceptAtMost ?? Infinity)

      if (upload.offset + kept > upload.length) return new Response(null, { status: 413, headers: base })
      upload.offset += kept
      const told = quirks.patchOffset === undefined ? upload.offset : quirks.patchOffset(upload.offset, kept)

      return new Response(null, { status: 204, headers: told === null ? base : { ...base, 'upload-offset': String(told) } })
    }

    return new Response(null, { status: 405, headers: base })
  }

  return { handler, uploads }
}

// ── S3: presigned PUT of an object or of a part, and the app's multipart callbacks on the same store ─────────────────────
export interface S3Part {
  etag: string
  size: number
}

/** An S3-like store. `exposeEtag: false` models a bucket whose CORS rule does not expose ETag. */
export function s3Server(quirks: { exposeEtag?: boolean } = {}) {
  const uploads = new Map<string, Map<number, S3Part>>()
  const objects = new Map<string, number>()
  const calls: string[] = []
  let next = 1

  const handler: Handler = async (req) => {
    const url = new URL(req.url)
    const q = url.searchParams

    if (req.method !== 'PUT') return new Response(null, { status: 405 })
    if (q.get('sig') !== 'ok') return new Response('<Error><Code>SignatureDoesNotMatch</Code></Error>', { status: 403 })
    const bytes = new Uint8Array(await req.arrayBuffer())
    const etag = `"${createHash('md5').update(bytes).digest('hex')}"`
    const headers = quirks.exposeEtag === false ? {} : { etag }
    const uploadId = q.get('uploadId')

    if (uploadId === null) {
      objects.set(url.pathname, bytes.length)

      return new Response(null, { status: 200, headers })
    }
    const parts = uploads.get(uploadId)

    if (parts === undefined) return new Response('<Error><Code>NoSuchUpload</Code></Error>', { status: 404 })
    parts.set(Number(q.get('partNumber')), { etag, size: bytes.length })

    return new Response(null, { status: 200, headers })
  }

  const multipart = {
    create: vi.fn(async () => {
      const uploadId = `up-${next++}`

      uploads.set(uploadId, new Map())
      calls.push(`create ${uploadId}`)

      return { uploadId }
    }),
    signPart: vi.fn(async (_file: unknown, p: { uploadId: string; partNumber: number }) => ({ url: `http://s3.test/bucket/key?uploadId=${p.uploadId}&partNumber=${p.partNumber}&sig=ok`, headers: { 'x-amz-test': 'signed' } })),
    complete: vi.fn(async (_file: unknown, p: { uploadId: string; parts: { partNumber: number; etag: string }[] }) => {
      const stored = uploads.get(p.uploadId)

      calls.push(`complete ${p.uploadId} ${p.parts.map((x) => x.partNumber).join(',')}`)
      if (stored === undefined) throw new Error('NoSuchUpload')
      for (const [i, part] of p.parts.entries()) {
        if (i > 0 && part.partNumber <= p.parts[i - 1]!.partNumber) throw new Error('InvalidPartOrder')
        if (stored.get(part.partNumber)?.etag !== part.etag) throw new Error(`InvalidPart ${part.partNumber}`)
      }
      uploads.delete(p.uploadId)

      return { key: 'key', parts: p.parts.length, size: p.parts.reduce((n, x) => n + stored.get(x.partNumber)!.size, 0) }
    }),
    abort: vi.fn(async (_file: unknown, p: { uploadId: string }) => {
      calls.push(`abort ${p.uploadId}`)
      uploads.delete(p.uploadId)
    }),
    list: vi.fn(async (_file: unknown, p: { uploadId: string }) => [...(uploads.get(p.uploadId) ?? new Map<number, S3Part>())].map(([partNumber, x]) => ({ partNumber, etag: x.etag }))),
  }

  return { handler, uploads, objects, calls, multipart }
}
