/**
 * The generated clients, EXECUTED against a real HTTP server.
 *
 * A `toContain` assertion on emitted source proves the emitter wrote what the
 * emitter meant to write. It cannot tell you whether axios was handed the
 * options it actually understands, whether ky's error shape is what the catch
 * block expects, or whether a 204 decodes to `undefined` rather than throwing
 * on an empty body — and those are precisely the places three different
 * libraries behave differently.
 *
 * So this boots `node:http`, generates a client pointed at it, imports the
 * generated file and calls it. What is proven is the request that went out (an
 * exact URL and method recorded server-side) and the value that came back.
 */
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { ADAPTER_CLIENTS, cleanGenerated, writeGenerated } from './helpers/adapter-fixture'

interface Recorded {
  method: string
  url: string
  body: string
}

interface Endpoint {
  (args?: Record<string, unknown>): Promise<unknown>
  query: (args?: Record<string, unknown>) => {
    queryKey: unknown
    queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>
  }
}

interface Generated {
  listBooks: Endpoint
  getBook: Endpoint
  createBook: Endpoint
  deleteBook: Endpoint
  installMocks: () => void
  setDevTransport: (t: unknown) => void
  LatheHttpError: new (...args: never[]) => Error
}

let server: Server
let port = 0
const recorded: Recorded[] = []
/** Set per-test to make the NEXT response fail, once. */
let failWith: number | null = null
/** Set per-test to make EVERY response fail — used to count retries. */
let alwaysFailWith: number | null = null

const BOOK = { id: 'b1', title: 'Dune', pages: 412 }

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => {
      body += String(c)
    })
    req.on('end', () => {
      recorded.push({ method: req.method ?? '', url: req.url ?? '', body })
      if (alwaysFailWith !== null) {
        res.writeHead(alwaysFailWith, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ message: 'nope' }))
        return
      }
      if (failWith !== null) {
        const status = failWith
        failWith = null
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ message: 'nope' }))
        return
      }
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (req.method === 'DELETE') {
        res.writeHead(204)
        res.end()
        return
      }
      res.writeHead(req.method === 'POST' ? 201 : 200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(path === '/v1/books' && req.method === 'GET' ? [BOOK] : BOOK))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no port')
  port = addr.port
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  cleanGenerated()
})

beforeEach(() => {
  recorded.length = 0
  failWith = null
  alwaysFailWith = null
})

async function load(client: (typeof ADAPTER_CLIENTS)[number]): Promise<Generated> {
  const dir = writeGenerated(client, port)
  const clientMod = (await import(join(dir, 'client.ts'))) as {
    setDevTransport: (t: unknown) => void
    LatheHttpError: new (...args: never[]) => Error
  }
  const endpoints = (await import(join(dir, 'endpoints', 'books.ts'))) as Record<string, Endpoint>
  const mocks = (await import(join(dir, 'mocks.ts'))) as { installMocks: () => void }
  // `import()` is cached per path and the generated client holds its dev
  // transport at MODULE scope, so a test that installs mocks would otherwise
  // leak them into every test after it — which reads as "the request was never
  // made" rather than as pollution.
  clientMod.setDevTransport(null)
  return { ...endpoints, ...clientMod, ...mocks } as unknown as Generated
}

for (const client of ADAPTER_CLIENTS) {
  describe(`generated ${client} client`, () => {
    it('issues a GET at the URL the spec describes and decodes the body', async () => {
      const gen = await load(client)
      const books = (await gen.listBooks()) as { id: string }[]
      expect(books).toEqual([BOOK])
      expect(recorded).toHaveLength(1)
      expect(recorded[0]?.method).toBe('GET')
      expect(recorded[0]?.url).toBe('/v1/books')
    })

    it('substitutes a path parameter and encodes it', async () => {
      const gen = await load(client)
      await gen.getBook({ params: { id: 'a/b' } })
      // Encoded, so the id cannot break out of its segment and address a
      // different route.
      expect(recorded[0]?.url).toBe('/v1/books/a%2Fb')
    })

    it('appends query parameters and drops nullish ones', async () => {
      const gen = await load(client)
      await gen.listBooks({ query: { q: 'dune', skip: undefined } })
      expect(recorded[0]?.url).toBe('/v1/books?q=dune')
    })

    it('sends a JSON body with a content-type on a mutation', async () => {
      const gen = await load(client)
      const created = await gen.createBook({ json: BOOK })
      expect(created).toEqual(BOOK)
      expect(recorded[0]?.method).toBe('POST')
      expect(JSON.parse(recorded[0]?.body ?? 'null')).toEqual(BOOK)
    })

    it('decodes a 204 as undefined rather than failing on an empty body', async () => {
      // `res.json()` on an empty body rejects. Every adapter has to special-case
      // this, and each one has a different way of noticing.
      const gen = await load(client)
      await expect(gen.deleteBook({ params: { id: 'b1' } })).resolves.toBeUndefined()
      expect(recorded[0]?.method).toBe('DELETE')
    })

    it('normalises a non-2xx into one error shape carrying status and body', async () => {
      // The three libraries disagree by default: fetch RESOLVES a 500, axios
      // rejects with an AxiosError, ky with an HTTPError. A generated query's
      // `error` signal must not change shape when the client is swapped.
      const gen = await load(client)
      // 404 rather than a 5xx deliberately: ky RETRIES 5xx GETs by default and
      // the others do not, so a 5xx here would be testing retry policy while
      // claiming to test error shape. The retry divergence has its own test.
      failWith = 404
      const err = await gen.listBooks().then(
        () => null,
        (e: unknown) => e,
      )
      expect(err, `${client} should reject on 404`).toBeInstanceOf(gen.LatheHttpError)
      expect((err as { status: number }).status).toBe(404)
      expect((err as { body: unknown }).body).toEqual({ message: 'nope' })
    })

    it('validates the response against the generated schema', async () => {
      const gen = await load(client)
      failWith = null
      // The server answers `getBook` with a full Book; drop a required field
      // through the transport seam and the schema must reject it.
      gen.setDevTransport(() => ({ json: { id: 'b1' } }))
      await expect(gen.getBook({ params: { id: 'b1' } })).rejects.toThrow(
        /did not match its schema/,
      )
      gen.setDevTransport(null)
    })

    it('serves from the generated mocks with no server contacted', async () => {
      const gen = await load(client)
      gen.installMocks()
      const books = (await gen.listBooks()) as unknown[]
      // The array fixture emits two members, deterministically.
      expect(books).toHaveLength(2)
      // The whole point of a mock: nothing went out.
      expect(recorded).toHaveLength(0)
      gen.setDevTransport(null)
    })

    it('a mocked NO-CONTENT route still counts as handled', async () => {
      // The seam envelopes its answer precisely so `{ json: null }` (a matched
      // 204 route) stays distinguishable from `null` (no route). Without the
      // envelope this request silently reaches the network.
      const gen = await load(client)
      gen.installMocks()
      await expect(gen.deleteBook({ params: { id: 'b1' } })).resolves.toBeUndefined()
      expect(recorded).toHaveLength(0)
      gen.setDevTransport(null)
    })

    it('forwards an AbortSignal so a query can be cancelled', async () => {
      const gen = await load(client)
      const controller = new AbortController()
      // Aborted BEFORE the call rather than mid-flight: an in-flight abort
      // leaves the server's own `end` handler to fire whenever it likes, which
      // lands in the NEXT test's request log and reads as a duplicate request.
      // An already-aborted signal proves the same thing — that it reaches the
      // transport — with nothing in flight to race.
      controller.abort()
      const options = gen.listBooks.query()
      await expect(options.queryFn({ signal: controller.signal })).rejects.toThrow()
      expect(recorded, 'an aborted request must never reach the server').toHaveLength(0)
    })
  })
}

/**
 * A divergence that is REAL, deliberate, and asserted rather than papered over.
 *
 * ky retries a 5xx GET twice by default; axios and the platform fetch do not.
 * The generated code does NOT normalise this, because it is the library's own
 * documented behaviour and someone who picked ky picked it — but a divergence
 * nobody has written down is one that gets discovered in production, so it is
 * pinned here and stated in the README's limits table.
 *
 * Everything else about failure IS normalised: the same `LatheHttpError` with
 * the same `status` and `body` on all three, proven above.
 */
describe('retry policy is the library\'s own, and differs', () => {
  it('ky retries a 5xx GET; axios and fetch issue exactly one request', async () => {
    const attempts: Record<string, number> = {}
    for (const client of ADAPTER_CLIENTS) {
      const gen = await load(client)
      recorded.length = 0
      // Every attempt fails, so the count is the total number of tries.
      alwaysFailWith = 503
      await gen.listBooks().catch(() => undefined)
      alwaysFailWith = null
      attempts[client] = recorded.length
    }
    expect(attempts.fetch).toBe(1)
    expect(attempts.axios).toBe(1)
    expect(attempts.ky).toBeGreaterThan(1)
  })
})
