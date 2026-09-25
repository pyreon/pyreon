/**
 * Generated mock routes must INTERCEPT exactly the request they describe.
 *
 * Run through the generated `installMocks()` and the generated endpoints —
 * never by asserting on the emitted text, which can only tell you the emitter
 * wrote what it meant to. Three shipped holes are locked here:
 *
 *  - a parameterised route emitted as a plain string never matched (history);
 *  - a PARAMETERLESS route matched only as a URL suffix, so `GET /pets?limit=5`
 *    missed it and went to the network (audit D1);
 *  - routes were unanchored and id-ordered, so `/pets/:id` answered
 *    `/owners/1/pets/2` and `/users/:id` answered `/users/me` (audit D2).
 */
import type { HttpMiddleware } from '@pyreon/http'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'

const item = (schema: string) => ({ '200': { description: 'x', content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } } } })
const list = (schema: string) => ({ '200': { description: 'x', content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${schema}` } } } } } })
const id = [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test/v1' }],
  paths: {
    '/pets': { get: { operationId: 'listPets', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: list('Pet') } },
    '/pets/{id}': {
      get: { operationId: 'aGetPet', parameters: id, responses: item('Pet') },
      delete: { operationId: 'deletePet', parameters: id, responses: { '204': { description: 'gone' } } },
    },
    '/users/{id}': { get: { operationId: 'aUser', parameters: id, responses: item('User') } },
    '/users/me': { get: { operationId: 'me', responses: item('Me') } },
    '/owners/{id}/pets/{petId}': {
      get: { operationId: 'ownerPet', parameters: [...id, { name: 'petId', in: 'path', required: true, schema: { type: 'string' } }], responses: item('OwnerPet') },
    },
  },
  components: {
    schemas: {
      Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      User: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      Me: { type: 'object', required: ['me'], properties: { me: { type: 'boolean' } } },
      OwnerPet: { type: 'object', required: ['owner'], properties: { owner: { type: 'string' } } },
    },
  },
})

type Ep = (a?: unknown) => Promise<unknown>
interface Loaded {
  eps: Record<string, Ep>
  client: { setDevTransport(m: HttpMiddleware | null): void; configureApi(c: { baseUrl?: string | undefined }): void }
  mocks: {
    installMocks(): void
    mockOperation(id: string, o: Record<string, unknown>): () => void
    resetMocks(): void
    mockCalls: { url: string }[]
  }
}

async function load(): Promise<Loaded> {
  const e = emitToDisk('mocks', SPEC, { plugins: ['schemas', 'client', 'mocks'] })
  const client = await e.load<Loaded['client']>('client.ts')
  // No mock may fall through: the network is a failure here.
  const mocks = await e.load<Loaded['mocks']>('mocks.ts')
  return { eps: await e.load<Loaded['eps']>('endpoints/index.ts'), client, mocks }
}

afterAll(() => cleanEmitted('mocks'))

describe('generated mock routes', () => {
  let l: Loaded
  beforeAll(async () => {
    l = await load()
  })
  beforeEach(() => l.mocks.installMocks())
  afterEach(() => {
    l.mocks.resetMocks()
    l.client.setDevTransport(null)
    l.client.configureApi({ baseUrl: undefined })
  })

  it('a parameterless route still matches with a query string (D1)', async () => {
    await expect(l.eps.listPets?.({ query: { limit: 5 } })).resolves.toEqual([{ name: expect.any(String) }, { name: expect.any(String) }])
  })

  it('a parameterised route matches the resolved URL', async () => {
    await expect(l.eps.aGetPet?.({ params: { id: 'b1' } })).resolves.toHaveProperty('name')
  })

  it('a literal segment beats a parameter in the same position (D2)', async () => {
    await expect(l.eps.me?.()).resolves.toEqual({ me: true })
    await expect(l.eps.aUser?.({ params: { id: 'u1' } })).resolves.toHaveProperty('id')
  })

  it('routes are anchored at the base URL (D2)', async () => {
    await expect(l.eps.ownerPet?.({ params: { id: 'o1', petId: 'p1' } })).resolves.toHaveProperty('owner')
  })

  it('anchoring follows a runtime base-URL switch', async () => {
    l.client.configureApi({ baseUrl: 'https://staging.test/api/v2' })
    await expect(l.eps.aGetPet?.({ params: { id: 'b1' } })).resolves.toHaveProperty('name')
    expect(l.mocks.mockCalls.at(-1)?.url).toBe('/pets/b1')
  })

  it('a no-content operation answers like the server — no body', async () => {
    await expect(l.eps.deletePet?.({ params: { id: 'b1' } })).resolves.toBeUndefined()
  })

  it('mockOperation overrides one route; the restore and resetMocks undo it', async () => {
    const restore = l.mocks.mockOperation('listPets', { json: [] })
    await expect(l.eps.listPets?.()).resolves.toEqual([])
    restore()
    await expect(l.eps.listPets?.()).resolves.toHaveLength(2)
    l.mocks.mockOperation('aGetPet', { status: 500, json: { message: 'down' } })
    await expect(l.eps.aGetPet?.({ params: { id: 'x' } })).rejects.toThrow()
    l.mocks.resetMocks()
    await expect(l.eps.aGetPet?.({ params: { id: 'x' } })).resolves.toHaveProperty('name')
  })
})
