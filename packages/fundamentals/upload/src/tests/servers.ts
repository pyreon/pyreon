import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { openUploads } from './reference-chunked'
import * as zeroRoute from './reference-zero-routes'

/** In-test servers for the resumable transports, mounted on the runner's dev server under `/__u/`. */
const read = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = []

    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve(Buffer.concat(chunks)))
  })

const send = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void => {
  res.writeHead(status, body === undefined ? headers : { 'content-type': 'application/json', ...headers })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

// ── the S3 multipart contract (what S3, R2 and MinIO do), reduced to what the transport relies on ───────────────────────
interface S3Upload {
  key: string
  parts: Map<number, { etag: string; size: number }>
}

const s3 = { uploads: new Map<string, S3Upload>(), objects: new Map<string, number>(), aborts: 0, puts: 0, nextId: 1 }
const MIN_PART = 5 * 1024 * 1024

type S3Handler = (q: URLSearchParams, body: Buffer, req: IncomingMessage, res: ServerResponse) => void

function s3Put(q: URLSearchParams, body: Buffer, _req: IncomingMessage, res: ServerResponse): void {
  if (q.get('sig') !== 'ok') return send(res, 403, { error: 'SignatureDoesNotMatch' })
  const etag = `"${createHash('md5').update(body).digest('hex')}"`

  s3.puts++
  if (q.get('uploadId') === null) {
    s3.objects.set(q.get('key') ?? '', body.length)

    return send(res, 200, undefined, { etag })
  }
  const upload = s3.uploads.get(q.get('uploadId')!)

  if (upload === undefined) return send(res, 404, { error: 'NoSuchUpload' })
  upload.parts.set(Number(q.get('partNumber')), { etag, size: body.length })
  send(res, 200, undefined, { etag })
}

function s3Complete(q: URLSearchParams, body: Buffer, _req: IncomingMessage, res: ServerResponse): void {
  const upload = s3.uploads.get(q.get('uploadId') ?? '')

  if (upload === undefined) return send(res, 404, { error: 'NoSuchUpload' })
  const listed = (JSON.parse(body.toString() || '{}') as { parts?: { partNumber: number; etag: string }[] }).parts ?? []
  const numbers = listed.map((p) => p.partNumber)

  if (numbers.some((n, i) => i > 0 && n <= numbers[i - 1]!)) return send(res, 400, { error: 'InvalidPartOrder' })
  for (const [i, p] of listed.entries()) {
    const stored = upload.parts.get(p.partNumber)

    if (stored === undefined || stored.etag !== p.etag) return send(res, 400, { error: 'InvalidPart', partNumber: p.partNumber })
    if (i < listed.length - 1 && stored.size < MIN_PART) return send(res, 400, { error: 'EntityTooSmall', partNumber: p.partNumber })
  }
  s3.uploads.delete(q.get('uploadId')!)
  send(res, 200, { key: upload.key, size: listed.reduce((n, p) => n + (upload.parts.get(p.partNumber)?.size ?? 0), 0), parts: listed.length })
}

const S3_ROUTES: Record<string, S3Handler> = {
  '/create': (q, _b, _r, res) => {
    const uploadId = `up-${s3.nextId++}`

    s3.uploads.set(uploadId, { key: q.get('key') ?? 'k', parts: new Map() })
    send(res, 200, { uploadId })
  },
  '/sign': (q, _b, _r, res) => send(res, 200, { url: `/__u/s3/obj?uploadId=${q.get('uploadId')}&partNumber=${q.get('partNumber')}&sig=ok`, headers: { 'x-amz-test': 'signed' } }),
  '/sign-single': (q, _b, _r, res) => send(res, 200, { url: `/__u/s3/obj?key=${q.get('key')}&sig=ok` }),
  '/obj': (q, body, req, res) => (req.method === 'PUT' ? s3Put(q, body, req, res) : send(res, 405, { error: 'method' })),
  '/list': (q, _b, _r, res) => {
    const upload = s3.uploads.get(q.get('uploadId') ?? '')

    if (upload === undefined) send(res, 404, { error: 'NoSuchUpload' })
    else send(res, 200, [...upload.parts].map(([partNumber, p]) => ({ partNumber, etag: p.etag })))
  },
  '/abort': (q, _b, _r, res) => {
    s3.aborts++
    s3.uploads.delete(q.get('uploadId') ?? '')
    send(res, 204)
  },
  '/complete': s3Complete,
  '/state': (_q, _b, _r, res) => send(res, 200, { open: s3.uploads.size, aborts: s3.aborts, puts: s3.puts }),
}

async function s3Route(path: string, q: URLSearchParams, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await read(req)
  const handler = S3_ROUTES[path]

  if (handler === undefined) send(res, 404, { error: 'unknown' })
  else handler(q, body, req, res)
}

// ── tus 1.0 (core, creation, termination), from the protocol text ─────────────────────────────────────────────────────────
interface TusUpload {
  length: number
  offset: number
  metadata: string
  data: Buffer[]
}

const tus = { uploads: new Map<string, TusUpload>(), nextId: 1, requests: [] as string[] }

async function tusRoute(path: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await read(req)
  const base = { 'tus-resumable': '1.0.0', 'cache-control': 'no-store' }
  const log = `${req.method} ${path}`

  tus.requests.push(log)
  if (path === '/state') return send(res, 200, { requests: tus.requests, open: tus.uploads.size, uploads: [...tus.uploads].map(([id, u]) => ({ id, offset: u.offset, length: u.length, metadata: u.metadata })) })
  if (req.headers['tus-resumable'] !== '1.0.0') return send(res, 412, undefined, { ...base, 'tus-version': '1.0.0' })
  if (path === '' || path === '/') {
    if (req.method !== 'POST') return send(res, 405, undefined, base)
    const length = Number(req.headers['upload-length'])

    if (!Number.isInteger(length) || length < 0) return send(res, 400, { error: 'Upload-Length' }, base)
    const id = `f${tus.nextId++}`

    tus.uploads.set(id, { length, offset: 0, metadata: String(req.headers['upload-metadata'] ?? ''), data: [] })

    return send(res, 201, undefined, { ...base, location: `/__u/tus/files/${id}` })
  }
  const id = path.replace(/^\/files\//, '')
  const upload = tus.uploads.get(id)

  if (upload === undefined) return send(res, 404, undefined, base)
  if (req.method === 'HEAD') return send(res, 200, undefined, { ...base, 'upload-offset': String(upload.offset), 'upload-length': String(upload.length) })
  if (req.method === 'DELETE') {
    tus.uploads.delete(id)

    return send(res, 204, undefined, base)
  }
  if (req.method === 'PATCH') {
    if (req.headers['content-type'] !== 'application/offset+octet-stream') return send(res, 415, undefined, base)
    if (Number(req.headers['upload-offset']) !== upload.offset) return send(res, 409, undefined, base)
    if (upload.offset + body.length > upload.length) return send(res, 413, undefined, base)
    upload.data.push(body)
    upload.offset += body.length

    return send(res, 204, undefined, { ...base, 'upload-offset': String(upload.offset) })
  }

  return send(res, 405, undefined, base)
}

/** Add the resumable routes to a dev server. */
let chunkPuts = 0

/** Call the Zero route module the way Zero does: the method name picks the export, the context carries the request. */
function routeFor(method: string, request: Request): Promise<Response> {
  const handler = (zeroRoute as Record<string, (ctx: { request: Request }) => Promise<Response>>)[method]

  return handler === undefined ? Promise.resolve(new Response(null, { status: 405 })) : handler({ request })
}

export function mountResumableServers(server: ViteDevServer): void {
  server.middlewares.use('/__u/chunked', (req, res) => {
    void (async () => {
      const body = await read(req)
      const path = req.url === '/' ? '' : (req.url ?? '')
      if (req.method === 'PUT') chunkPuts++
      const hasBody = body.length > 0 && req.method !== 'GET' && req.method !== 'HEAD'
      const response =
        path === '/state'
          ? new Response(JSON.stringify({ open: openUploads(), puts: chunkPuts }), { headers: { 'content-type': 'application/json' } })
          : await routeFor(req.method ?? 'GET', new Request(`http://x/api/uploads${path}`, { method: req.method ?? 'GET', headers: req.headers as Record<string, string>, ...(hasBody ? { body: new Uint8Array(body) } : {}) }))

      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
    })()
  })
  server.middlewares.use('/__u/s3', (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')

    void s3Route(url.pathname, url.searchParams, req, res)
  })
  server.middlewares.use('/__u/tus', (req, res) => {
    void tusRoute(new URL(req.url ?? '/', 'http://x').pathname, req, res)
  })
}
