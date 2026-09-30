/**
 * `int64: 'bigint'`, EXECUTED: server → client → server, with no precision lost.
 *
 * `9007199254740993` is 2^53 + 1. `JSON.parse` turns it into
 * `9007199254740992` before anything else runs, so a test that only inspects
 * emitted source cannot tell a lossless client from one that rounds and then
 * types the wrong value as a bigint. This boots `node:http`, generates a
 * client for EVERY runtime (`@pyreon/http`, fetch, axios, ky) under EVERY
 * schema library (`@pyreon/validate`, zod), and proves three things per pair:
 *
 * 1. a response carrying the value decodes to the exact bigint, including in
 *    an array, a nested model, a nullable field and a top-level response —
 *    and a SMALL int64 is widened to a bigint too, so the type does not lie;
 * 2. a bigint in a request body leaves as JSON NUMBER text, digit for digit,
 *    not as a string and not as a thrown `TypeError`;
 * 3. a plain `double` field that the server happened to write as a long
 *    integer still arrives as the number `JSON.parse` would have produced.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashKey } from '@pyreon/query'
import { resolveConfig, type ClientName, type ValidatorName } from '../core/config'
import { generate } from '../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated')
const created: string[] = []

const BIG = '9007199254740993'
const BIGGER = '9223372036854775807' // int64 max

const SPEC = `
openapi: 3.0.3
info: { title: Ledger, version: '1.0.0' }
servers: [{ url: 'http://127.0.0.1:PORT/v1' }]
paths:
  /entries/{id}:
    get:
      operationId: getEntry
      tags: [entries]
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, format: int64 } }
        - { name: after, in: query, schema: { type: integer, format: int64 } }
        - { name: ids, in: query, schema: { type: array, items: { type: integer, format: int64 } } }
        - { name: X-Tenant, in: header, schema: { type: integer, format: int64 } }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Entry' }
  /entries:
    post:
      operationId: createEntry
      tags: [entries]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Entry' }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Entry' }
  /counter:
    get:
      operationId: getCounter
      tags: [entries]
      responses:
        '200':
          content:
            application/json:
              schema: { type: integer, format: int64 }
components:
  schemas:
    Account:
      type: object
      required: [id]
      properties:
        id: { type: integer, format: int64 }
    Entry:
      type: object
      required: [id, amount, refs, account]
      properties:
        id: { type: integer, format: int64 }
        small: { type: integer, format: int64 }
        amount: { type: number, format: double }
        refs: { type: array, uniqueItems: true, items: { type: integer, format: int64 } }
        parent: { type: integer, format: int64, nullable: true }
        account: { $ref: '#/components/schemas/Account' }
`

/** What GET /entries/{id} answers — raw TEXT, so nothing on this side rounds it. */
const ENTRY_TEXT = `{"id":${BIG},"small":7,"amount":100000000000000000000,"refs":[${BIG},1,${BIGGER}],"parent":null,"account":{"id":${BIGGER}}}`

let server: Server
let port = 0
const received: string[] = []
/** Each request's URL and `x-tenant` header, exactly as the server read them. */
const requests: Array<{ url: string; tenant: string | undefined }> = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => {
      body += String(c)
    })
    req.on('end', () => {
      received.push(body)
      const tenant = req.headers['x-tenant']
      requests.push({ url: req.url ?? '', tenant: Array.isArray(tenant) ? tenant.join(',') : tenant })
      res.writeHead(200, { 'content-type': 'application/json' })
      const path = (req.url ?? '').split('?')[0]
      // A POST is echoed BYTE FOR BYTE: whatever the client encoded is what
      // it must then decode.
      if (req.method === 'POST') res.end(body)
      else if (path === '/v1/counter') res.end(BIGGER)
      else res.end(ENTRY_TEXT)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no port')
  port = addr.port
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  received.length = 0
  requests.length = 0
})

type Call = ((args?: Record<string, unknown>) => Promise<unknown>) & {
  key: (args?: Record<string, unknown>) => readonly unknown[]
}

async function load(client: ClientName, validator: ValidatorName): Promise<Record<string, Call>> {
  const dir = join(ROOT, `int64-${client}-${validator}-${port}`)
  rmSync(dir, { recursive: true, force: true })
  created.push(dir)
  const cfg = resolveConfig({ input: 'x', client, validator, int64: 'bigint', plugins: ['schemas', 'client'] })
  const { files } = generate(SPEC.replace('PORT', String(port)), cfg)
  for (const f of files) {
    const p = join(dir, f.path)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, f.contents)
  }
  return (await import(join(dir, 'endpoints', 'entries.ts'))) as Record<string, Call>
}

const CLIENTS: readonly ClientName[] = ['pyreon', 'fetch', 'axios', 'ky']
const VALIDATORS: readonly ValidatorName[] = ['pyreon', 'zod']

for (const client of CLIENTS) {
  for (const validator of VALIDATORS) {
    describe(`${client} client × ${validator} schemas`, () => {
      it('decodes every int64 exactly, and widens a small one to a bigint', async () => {
        const { getEntry } = await load(client, validator)
        const entry = (await (getEntry as Call)({ params: { id: BIG } })) as Record<string, unknown>
        expect(entry).toEqual({
          id: 9007199254740993n,
          small: 7n,
          amount: 1e20,
          refs: [9007199254740993n, 1n, 9223372036854775807n],
          parent: null,
          account: { id: 9223372036854775807n },
        })
        // The double is a NUMBER — the lossless decoder handed it over as a
        // bigint, and its schema read it back as JSON.parse would have.
        expect(typeof entry.amount).toBe('number')
      })

      it('sends bigint path, query and header parameters as their exact digits', async () => {
        const { getEntry } = await load(client, validator)
        // The id the client itself decoded goes straight back out -- no
        // lossy `Number(…)` in between.
        const entry = (await (getEntry as Call)({ params: { id: BIG } })) as { id: bigint }
        expect(entry.id).toBe(9007199254740993n)
        await (getEntry as Call)({
          params: { id: entry.id },
          query: { after: 9223372036854775807n, ids: [entry.id, 2n] },
          headers: { 'X-Tenant': 18014398509481985n },
        })
        expect(requests[1]).toEqual({
          url: '/v1/entries/9007199254740993?after=9223372036854775807&ids=9007199254740993&ids=2',
          tenant: '18014398509481985',
        })
      })

      it('a cache key holding a bigint hashes (query keys go through JSON.stringify)', async () => {
        const { getEntry } = await load(client, validator)
        const key = (getEntry as Call).key({ params: { id: 9007199254740993n }, query: { ids: [2n] } })
        expect(() => hashKey(key)).not.toThrow()
        expect(key.at(-1)).toEqual({ params: { id: '9007199254740993' }, query: { ids: ['2'] } })
      })

      it('decodes a top-level int64 response', async () => {
        const { getCounter } = await load(client, validator)
        expect(await (getCounter as Call)()).toBe(9223372036854775807n)
      })

      it('sends a bigint as JSON number text and gets the same value back', async () => {
        const { createEntry } = await load(client, validator)
        const sent = {
          id: 9007199254740993n,
          amount: 1.5,
          refs: [9223372036854775807n],
          account: { id: 18014398509481985n },
        }
        const back = await (createEntry as Call)({ json: sent })
        expect(received).toHaveLength(1)
        // Exact digits on the wire, as NUMBERS (no quotes).
        expect(received[0]).toBe(`{"id":${BIG},"amount":1.5,"refs":[${BIGGER}],"account":{"id":18014398509481985}}`)
        expect(back).toEqual(sent)
      })
    })
  }
}
