// The reference handler of the chunked contract, as shown in the docs (the docs test checks this file is the code on the page).
// It keeps parts in memory to stay short: store them on disk or in object storage in a real server.

interface Upload {
  name: string
  size: number
  chunkSize: number
  parts: Map<number, Uint8Array>
}

const uploads = new Map<string, Upload>()
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Handle `POST /`, `GET /:id`, `PUT /:id/parts/:n`, `POST /:id/complete` and `DELETE /:id` under `base`. */
export async function chunkedHandler(request: Request, base = '/api/uploads'): Promise<Response> {
  const path = new URL(request.url).pathname.slice(base.length).split('/').filter(Boolean)
  const [id, kind, n] = path
  const upload = id === undefined ? undefined : uploads.get(id)

  if (id === undefined && request.method === 'POST') {
    const info = (await request.json()) as { name: string; size: number; chunkSize: number }
    const uploadId = crypto.randomUUID()

    uploads.set(uploadId, { name: info.name, size: info.size, chunkSize: info.chunkSize, parts: new Map() })

    return json({ uploadId }, 201)
  }
  if (upload === undefined) return json({ error: 'unknown upload' }, 404)
  if (request.method === 'GET' && kind === undefined) return json({ received: [...upload.parts.keys()] })
  if (request.method === 'DELETE' && kind === undefined) {
    uploads.delete(id!)

    return new Response(null, { status: 204 })
  }
  if (request.method === 'PUT' && kind === 'parts') {
    const bytes = new Uint8Array(await request.arrayBuffer())
    const expected = request.headers.get('x-part-sha256')

    if (expected !== null) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))

      if ([...digest].map((b) => b.toString(16).padStart(2, '0')).join('') !== expected) return json({ error: 'checksum mismatch' }, 422)
    }
    upload.parts.set(Number(n), bytes)

    return new Response(null, { status: 204 })
  }
  if (request.method === 'POST' && kind === 'complete') {
    const count = Math.max(1, Math.ceil(upload.size / upload.chunkSize))
    const missing = Array.from({ length: count }, (_, i) => i).filter((i) => !upload.parts.has(i))

    if (missing.length > 0) return json({ missing }, 409)
    const size = [...upload.parts.values()].reduce((sum, p) => sum + p.length, 0)

    if (size !== upload.size) return json({ error: 'size mismatch', size }, 422)
    uploads.delete(id!)

    return json({ name: upload.name, size })
  }

  return json({ error: 'not found' }, 404)
}

/** For the tests: how many uploads are still open. */
export const openUploads = (): number => uploads.size
