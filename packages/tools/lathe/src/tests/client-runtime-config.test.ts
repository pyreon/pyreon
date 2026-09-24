/**
 * The generated client's RUNTIME seams (dx D8, perf lever 7, audit B4/E1),
 * exercised by importing the emitted modules and running requests.
 *
 *  - `configureApi` changes base URL, headers, middleware and validation
 *    after the endpoints were declared — they bind at declaration time, so
 *    each setting is read per request.
 *  - `installMocks()` answers through its OWN slot and cannot remove the
 *    middleware `configureApi({ use })` installed (they used to share one).
 *  - `auth.*` exists per security scheme and applies each one correctly.
 *  - a non-JSON response decodes by media type instead of throwing.
 *  - every cache key carries the client's scope.
 */
import type { HttpMiddleware, HttpRequest, HttpResponse } from '@pyreon/http'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'

const pet = { '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } }
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test/v1' }],
  paths: {
    '/pets': { get: { operationId: 'listPets', responses: pet } },
    '/log': { get: { operationId: 'getLog', responses: { '200': { description: 'x', content: { 'text/plain': { schema: { type: 'string' } } } } } } },
    '/img': { get: { operationId: 'getImage', responses: { '200': { description: 'x', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } } } } },
  },
  components: {
    schemas: { Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
    securitySchemes: {
      token: { type: 'http', scheme: 'bearer' },
      basicAuth: { type: 'http', scheme: 'basic' },
      headerKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
      queryKey: { type: 'apiKey', in: 'query', name: 'api_key' },
      cookieKey: { type: 'apiKey', in: 'cookie', name: 'sid' },
      oauth: { type: 'oauth2', flows: {} },
      mtls: { type: 'mutualTLS' },
    },
  },
})

interface Client {
  api: { endpoint: unknown }
  configureApi(c: Record<string, unknown>): void
  setDevTransport(m: HttpMiddleware | null): void
  auth: Record<string, (...a: unknown[]) => HttpMiddleware>
}
type Eps = Record<string, ((a?: unknown) => Promise<unknown>) & { key: { prefix: unknown } }>

const answer = (body: BodyInit, type = 'application/json') => (req: HttpRequest): Promise<HttpResponse> =>
  Promise.resolve({
    raw: new Response(body, { headers: { 'content-type': type } }),
    status: 200,
    ok: true,
    headers: new Headers({ 'content-type': type }),
    request: req,
  })

afterAll(() => cleanEmitted('d8'))

async function load(): Promise<{ client: Client; eps: Eps; mocks: { installMocks(): void } }> {
  const e = emitToDisk('d8', SPEC, { plugins: ['schemas', 'client', 'mocks'], validate: 'strict' })
  return {
    client: await e.load<Client>('client.ts'),
    eps: await e.load<Eps>('endpoints/default.ts'),
    mocks: await e.load<{ installMocks(): void }>('mocks.ts'),
  }
}

describe('configureApi', () => {
  it('base URL, headers and middleware apply after declaration; `undefined` resets', async () => {
    const { client, eps } = await load()
    const seen: HttpRequest[] = []
    client.setDevTransport((req) => {
      seen.push(req)
      return answer('{"name":"a"}')(req)
    })
    try {
      await eps.listPets?.()
      client.configureApi({
        baseUrl: 'https://staging.test/v2',
        headers: () => ({ 'x-trace': 't1' }),
        use: [(req, next) => (req.headers.set('x-mw', 'yes'), next(req))],
      })
      await eps.listPets?.()
      client.configureApi({ baseUrl: undefined, headers: undefined, use: undefined })
      await eps.listPets?.()
    } finally {
      client.setDevTransport(null)
    }
    expect(seen.map((r) => r.url)).toEqual([
      'https://api.test/v1/pets',
      'https://staging.test/v2/pets',
      'https://api.test/v1/pets',
    ])
    expect(seen[1]?.headers.get('x-trace')).toBe('t1')
    expect(seen[1]?.headers.get('x-mw')).toBe('yes')
    expect(seen[2]?.headers.get('x-mw')).toBeNull()
  })

  it('validate is switchable at runtime (perf lever 7)', async () => {
    const { client, eps } = await load()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    client.setDevTransport((req) => answer('{"name":1}')(req))
    try {
      await expect(eps.listPets?.()).rejects.toThrow()
      client.configureApi({ validate: 'warn' })
      await expect(eps.listPets?.()).resolves.toEqual({ name: 1 })
      client.configureApi({ validate: 'off' })
      await expect(eps.listPets?.()).resolves.toEqual({ name: 1 })
    } finally {
      client.configureApi({ validate: undefined })
      client.setDevTransport(null)
      warn.mockRestore()
    }
  })

  it('installMocks does not remove middleware configured with `use`', async () => {
    const { client, eps, mocks } = await load()
    const seen: string[] = []
    client.configureApi({
      use: [client.auth.token?.(() => 'abc') as HttpMiddleware, (req, next) => (seen.push(req.headers.get('authorization') ?? ''), next(req))],
    })
    mocks.installMocks()
    try {
      await expect(eps.listPets?.()).resolves.toHaveProperty('name')
    } finally {
      client.setDevTransport(null)
      client.configureApi({ use: undefined })
    }
    expect(seen).toEqual(['Bearer abc'])
  })
})

describe('auth helpers from securitySchemes', () => {
  it('one per client-applicable scheme, applied correctly', async () => {
    const { client, eps } = await load()
    expect(Object.keys(client.auth).sort()).toEqual(['basicAuth', 'cookieKey', 'headerKey', 'oauth', 'queryKey', 'token'])
    const seen: HttpRequest[] = []
    client.setDevTransport((req) => (seen.push(req), answer('{"name":"a"}')(req)))
    try {
      client.configureApi({
        use: [
          client.auth.basicAuth?.('Zoë', () => 'pässword') as HttpMiddleware,
          client.auth.headerKey?.('hk') as HttpMiddleware,
          client.auth.queryKey?.('q k') as HttpMiddleware,
          client.auth.cookieKey?.(() => 's1') as HttpMiddleware,
          client.auth.oauth?.(() => null) as HttpMiddleware,
        ],
      })
      await eps.listPets?.()
    } finally {
      client.configureApi({ use: undefined })
      client.setDevTransport(null)
    }
    const req = seen[0] as HttpRequest
    const basic = (req.headers.get('authorization') ?? '').replace('Basic ', '')
    expect(new TextDecoder().decode(Uint8Array.from(atob(basic), (c) => c.charCodeAt(0)))).toBe('Zoë:pässword')
    expect(req.headers.get('x-api-key')).toBe('hk')
    expect(req.url).toBe('https://api.test/v1/pets?api_key=q%20k')
    expect(req.headers.get('cookie')).toBe('sid=s1')
  })
})

describe('non-JSON responses (audit B4) and key scope (audit E1)', () => {
  it('decodes text and binary bodies by media type', async () => {
    const { client, eps } = await load()
    client.setDevTransport((req) => (req.url.endsWith('/log') ? answer('line 1\nline 2', 'text/plain')(req) : answer('PNG', 'image/png')(req)))
    try {
      await expect(eps.getLog?.()).resolves.toBe('line 1\nline 2')
      const img = (await eps.getImage?.()) as Blob
      expect(await img.text()).toBe('PNG')
    } finally {
      client.setDevTransport(null)
    }
  })

  it('every endpoint key is namespaced by the client', async () => {
    const { eps } = await load()
    expect(eps.listPets?.key.prefix).toEqual(['https://api.test/v1', 'GET', '/pets'])
  })
})
