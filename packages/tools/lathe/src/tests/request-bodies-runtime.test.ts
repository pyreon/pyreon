/**
 * Request bodies, headers and cookies, measured ON THE WIRE, for every client.
 *
 * The IR used to carry only a body TYPE, so every generated mutation sent
 * `json:` -- Stripe (611 of 612 mutations) and Twilio accept only
 * `application/x-www-form-urlencoded`, and uploads are multipart. Header and
 * cookie parameters were dropped outright, so a required `X-Dangerous` header
 * (DigitalOcean) could not even be passed. Each shape here is generated, the
 * generated client is imported and CALLED against a real `node:http` server,
 * and the bytes and headers that arrived are asserted -- for `@pyreon/http`
 * and for the three generated adapter runtimes alike, which must agree.
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALL_CLIENTS, type ClientName } from '../emit/client-runtime'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { loadOpenApi } from '../input/openapi'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated', 'request-bodies')

const SPEC = (port: number): string => `
openapi: 3.0.3
info: { title: Bodies, version: '1' }
servers: [{ url: 'http://127.0.0.1:${port}/v1' }]
paths:
  /charges:
    post:
      operationId: createCharge
      tags: [c]
      parameters:
        - { name: Idempotency-Key, in: header, schema: { type: string } }
        - { name: X-Dangerous, in: header, required: true, schema: { type: boolean } }
        - { name: Content-Type, in: header, schema: { type: string } }
        - { name: session, in: cookie, schema: { type: string } }
      requestBody:
        content:
          application/x-www-form-urlencoded:
            schema:
              type: object
              properties:
                amount: { type: integer }
                metadata: { type: object, additionalProperties: { type: string } }
                expand: { type: array, items: { type: string } }
            encoding:
              metadata: { style: deepObject, explode: true }
              expand: { style: deepObject, explode: true }
      responses:
        '2XX':
          content: { 'application/json; charset=utf-8': { schema: { $ref: '#/components/schemas/Ok' } } }
  /files:
    post:
      operationId: uploadFile
      tags: [c]
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties: { file: { type: string, format: binary }, purpose: { type: string } }
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Ok' } } } } }
  /blobs:
    put:
      operationId: putBlob
      tags: [c]
      requestBody: { content: { application/octet-stream: { schema: { type: string, format: binary } } } }
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Ok' } } } } }
components:
  schemas:
    Ok:
      type: object
      required: [ok]
      properties: { ok: { type: boolean } }
`

interface Recorded {
  method: string
  url: string
  headers: IncomingHttpHeaders
  body: Buffer
}

type Call = (args?: Record<string, unknown>) => Promise<unknown>
interface Generated {
  createCharge: Call
  uploadFile: Call
  putBlob: Call
}

let server: Server
let port = 0
const recorded: Recorded[] = []
const clients = new Map<ClientName, Generated>()

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      recorded.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end('{"ok":true}')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : 0
  for (const client of ALL_CLIENTS) {
    const dir = join(ROOT, `${client}-${port}`)
    const { files } = generate(SPEC(port), resolveConfig({ input: 'x', client, plugins: ['schemas', 'client'] }))
    for (const f of files) {
      const p = join(dir, f.path)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, f.contents)
    }
    clients.set(client, (await import(join(dir, 'endpoints', 'c.ts'))) as Generated)
  }
}, 120_000)

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  for (const client of ALL_CLIENTS) rmSync(join(ROOT, `${client}-${port}`), { recursive: true, force: true })
})

const last = (): Recorded => recorded[recorded.length - 1] as Recorded

describe('the IR carries the media type, header and cookie parameters', () => {
  const { doc } = loadOpenApi(SPEC(1))
  const charge = doc.operations.find((o) => o.id === 'createCharge')

  it('classifies a form body and keeps its per-field encoding', () => {
    expect(charge?.body).toMatchObject({
      mediaType: 'application/x-www-form-urlencoded',
      encoding: 'form',
      fieldEncoding: { metadata: { style: 'deepObject', explode: true }, expand: { style: 'deepObject', explode: true } },
    })
  })

  it('types header and cookie parameters, and IGNORES a Content-Type header parameter', () => {
    expect(charge?.headerParams.map((p) => [p.name, p.required])).toEqual([
      ['Idempotency-Key', false],
      ['X-Dangerous', true],
    ])
    expect(charge?.cookieParams.map((p) => p.name)).toEqual(['session'])
  })

  it('reads a `2XX` range and a JSON media type with parameters', () => {
    expect(charge?.response).toEqual({ kind: 'ref', name: 'Ok' })
  })
})

for (const client of ALL_CLIENTS) {
  describe(`client=${client}: what reaches the server`, () => {
    it('a form body is form-encoded, with deepObject brackets', async () => {
      const g = clients.get(client) as Generated
      const out = await g.createCharge({
        form: { amount: 100, metadata: { order: 'A1' }, expand: ['customer'] },
        headers: { 'X-Dangerous': true, 'Idempotency-Key': undefined },
        cookies: { session: 'abc' },
      })
      expect(out).toEqual({ ok: true })
      const r = last()
      expect(r.headers['content-type']).toBe('application/x-www-form-urlencoded')
      expect(decodeURIComponent(r.body.toString())).toBe('amount=100&metadata[order]=A1&expand[0]=customer')
      expect(r.headers['x-dangerous']).toBe('true')
      // An optional header left undefined is absent, not the text "undefined".
      expect(r.headers['idempotency-key']).toBeUndefined()
      expect(r.headers.cookie).toBe('session=abc')
    })

    it('a multipart body carries its file part with a platform boundary', async () => {
      const g = clients.get(client) as Generated
      await g.uploadFile({ multipart: { file: new File(['hello-bytes'], 'a.txt', { type: 'text/plain' }), purpose: 'x' } })
      const r = last()
      expect(r.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
      const text = r.body.toString()
      expect(text).toContain('name="file"; filename="a.txt"')
      expect(text).toContain('hello-bytes')
      expect(text).toContain('name="purpose"')
    })

    it('a binary body is sent raw with its declared media type', async () => {
      const g = clients.get(client) as Generated
      await g.putBlob({ body: new Blob([new Uint8Array([1, 2, 3])]) })
      const r = last()
      expect(r.method).toBe('PUT')
      expect(r.headers['content-type']).toBe('application/octet-stream')
      expect([...r.body]).toEqual([1, 2, 3])
    })
  })
}
