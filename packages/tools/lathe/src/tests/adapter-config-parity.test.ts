/**
 * `configureApi` and `auth.*` are the SAME surface on every client (the
 * adapter-parity follow-up to dx D8), and send the SAME request.
 *
 * Executed against a real HTTP server: each client is generated, configured
 * with the same auth helpers plus one interceptor written in that library's
 * own idiom, and the requests the server receives must be identical.
 */
import type { HttpMiddleware } from '@pyreon/http'
import { createServer, type Server } from 'node:http'
import type { ClientName } from '../core/config'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'
import { typecheckSpec } from './helpers/typecheck'

let server: Server
let port = 0
const seen: { client: string; url: string; headers: Record<string, string | undefined> }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    const h = req.headers
    seen.push({
      client: String(h['x-client'] ?? ''),
      url: req.url ?? '',
      headers: {
        authorization: h.authorization,
        'x-api-key': h['x-api-key'] as string | undefined,
        cookie: h.cookie,
        'x-trace': h['x-trace'] as string | undefined,
        'x-configured': h['x-configured'] as string | undefined,
      },
    })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : 0
})

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  for (const c of CLIENTS) {
    cleanEmitted(`parity-${c}`)
    cleanEmitted(`parity-mock-${c}`)
  }
})

const spec = (base: string) =>
  JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'T', version: '1' },
    servers: [{ url: base }],
    paths: {
      '/ping': {
        get: { operationId: 'ping', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'x', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } } } },
      },
    },
    components: {
      securitySchemes: {
        token: { type: 'http', scheme: 'bearer' },
        headerKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        queryKey: { type: 'apiKey', in: 'query', name: 'api_key' },
        cookieKey: { type: 'apiKey', in: 'cookie', name: 'sid' },
        basicAuth: { type: 'http', scheme: 'basic' },
      },
    },
  })

const CLIENTS = ['pyreon', 'fetch', 'axios', 'ky'] as const

/** One interceptor per library, in its OWN idiom, that tags the request. */
const native: Record<ClientName, (client: string) => unknown> = {
  pyreon: (c) => ((req, next) => (req.headers.set('x-client', c), next(req))) satisfies HttpMiddleware,
  fetch: (c) => (request: Request, next: (r: Request) => Promise<Response>) => (request.headers.set('x-client', c), next(request)),
  axios: (c) => (config: { headers: { set(k: string, v: string): void } }) => (config.headers.set('x-client', c), config),
  ky: (c) => ({ request }: { request: Request }) => {
    request.headers.set('x-client', c)
  },
}

interface Client {
  configureApi(c: Record<string, unknown>): void
  auth: Record<string, (...a: unknown[]) => unknown>
}

describe('configureApi + auth are the same surface on every client', () => {
  it('sends identical requests', async () => {
    for (const c of CLIENTS) {
      const e = emitToDisk(`parity-${c}`, spec('http://127.0.0.1:1/unused'), { client: c, plugins: ['schemas', 'client'] })
      const client = await e.load<Client>('client.ts')
      const eps = await e.load<Record<string, (a?: unknown) => Promise<unknown>>>('endpoints/index.ts')
      client.configureApi({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        headers: () => ({ 'x-configured': 'yes' }),
        use: [
          native[c](c),
          client.auth.token?.(() => 'tok'),
          client.auth.headerKey?.('hk'),
          client.auth.queryKey?.('q k'),
          client.auth.cookieKey?.(() => 's1'),
          client.auth.basicAuth?.('u', null),
        ],
      })
      await expect(eps.ping?.({ query: { q: 'x' } })).resolves.toEqual({ ok: true })
    }
    expect(seen.map((s) => s.client)).toEqual([...CLIENTS])
    const [first, ...rest] = seen
    for (const other of rest) {
      expect({ url: other.url, headers: other.headers }, other.client).toEqual({ url: first?.url, headers: first?.headers })
    }
    // Basic comes last in `use`, so it wins the Authorization header — on every client.
    expect(first?.headers.authorization).toBe(`Basic ${btoa('u:')}`)
    expect(first?.url).toBe('/v1/ping?q=x&api_key=q%20k')
    expect(first?.headers).toMatchObject({ 'x-api-key': 'hk', cookie: 'sid=s1', 'x-configured': 'yes' })
  })

  it('mocks sit BELOW the library: its interceptors see mocked requests', async () => {
    const observed: { client: string; interceptorUrl: string; mockUrl: string | undefined; header: string | undefined; auth: string | undefined }[] = []
    for (const c of CLIENTS) {
      const e = emitToDisk(`parity-mock-${c}`, spec("https://api.test/v1"), { client: c, plugins: ["schemas", "client", "mocks"] })
      const client = await e.load<Client & { setDevTransport(t: unknown): void }>('client.ts')
      const mocks = await e.load<{ installMocks(): void; mockCalls: { url: string; headers: Record<string, string> }[] }>('mocks.ts')
      const eps = await e.load<Record<string, (a?: unknown) => Promise<unknown>>>('endpoints/index.ts')
      let interceptorUrl = ''
      const seeUrl: Record<ClientName, unknown> = {
        pyreon: ((req, next) => ((interceptorUrl = req.url), next(req))) satisfies HttpMiddleware,
        fetch: (request: Request, next: (r: Request) => Promise<Response>) => ((interceptorUrl = request.url), next(request)),
        axios: (config: { url?: string }) => ((interceptorUrl = config.url ?? ''), config),
        ky: ({ request }: { request: Request }) => {
          interceptorUrl = request.url
        },
      }
      client.configureApi({ baseUrl: undefined, headers: undefined, use: [native[c](c), client.auth.token?.('tok'), seeUrl[c]] })
      mocks.installMocks()
      try {
        await expect(eps.ping?.({ query: { q: 'x' } })).resolves.toMatchObject({})
      } finally {
        client.setDevTransport(null)
        client.configureApi({ use: undefined })
      }
      const call = mocks.mockCalls.at(-1)
      observed.push({ client: c, interceptorUrl, mockUrl: call?.url, header: call?.headers['x-client'], auth: call?.headers.authorization })
    }
    for (const o of observed) {
      expect(o, o.client).toEqual({
        client: o.client,
        interceptorUrl: 'https://api.test/v1/ping?q=x',
        mockUrl: '/ping?q=x',
        header: o.client,
        auth: 'Bearer tok',
      })
    }
  })

  it('the production barrel is byte-identical across clients', () => {
    const barrel = (c: ClientName) => emitToDisk(`parity-${c}`, spec('https://api.test'), { client: c, plugins: ['schemas', 'client'] }).file('index.ts')
    const pyreon = barrel('pyreon')
    expect(pyreon).toContain('auth, ')
    for (const c of CLIENTS) expect(barrel(c), c).toBe(pyreon)
  })

  for (const c of CLIENTS) {
    it(`typechecks with auth helpers: ${c}`, () => {
      const { errors } = typecheckSpec(`parity-tc-${c}`, spec('https://api.test'), { client: c, plugins: ['schemas', 'client', 'queries'] })
      expect(errors, errors.join('\n')).toEqual([])
    })
  }
})
