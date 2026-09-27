/**
 * Mutation hooks take typed options and invalidate what they change (audit
 * E2); `optimisticUpdate` rewrites cached data and returns a rollback.
 */
import { QueryClient } from '@pyreon/query'
import type { IrOperation } from '../core/ir'
import { invalidationTargets } from '../emit/client'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'

const op = (id: string, method: IrOperation['method'], path: string): IrOperation => ({
  id,
  method,
  path,
  tag: 't',
  pathParams: [],
  queryParams: [],
  headerParams: [],
  cookieParams: [],
})

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/pets': {
      get: { operationId: 'listPets', tags: ['pets'], responses: { '200': { description: 'x', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } } },
      post: { operationId: 'addPet', tags: ['pets'], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } }, responses: { '204': { description: 'x' } } },
    },
    '/pets/{id}': {
      get: { operationId: 'getPet', tags: ['pets'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } },
    },
    '/owners': { get: { operationId: 'listOwners', tags: ['owners'], responses: { '204': { description: 'x' } } } },
  },
  components: { schemas: { Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
})

afterAll(() => cleanEmitted('e2'))

describe('invalidation targets', () => {
  const queries = [op('listPets', 'GET', '/pets'), op('getPet', 'GET', '/pets/:id'), op('findPets', 'GET', '/pets/findByStatus'), op('listOwners', 'GET', '/owners'), op('getPetsIndex', 'GET', '/petshop')]

  it('an item mutation scopes to its collection', () => {
    expect(invalidationTargets(op('deletePet', 'DELETE', '/pets/:id'), queries).map((q) => q.id)).toEqual(['findPets', 'getPet', 'listPets'])
  })

  it('a collection mutation scopes to itself, at a segment boundary', () => {
    expect(invalidationTargets(op('addPet', 'POST', '/pets'), queries).map((q) => q.id)).toEqual(['findPets', 'getPet', 'listPets'])
  })

  it('a nested mutation does not reach its parent', () => {
    expect(invalidationTargets(op('addPhoto', 'POST', '/pets/:id/photos'), queries)).toEqual([])
  })
})

describe('emitted mutation hooks', () => {
  it('take options and invalidate the related queries by key prefix', () => {
    const src = emitToDisk('e2', SPEC, { plugins: ['schemas', 'client', 'queries'] }).file('queries/pets.ts')
    expect(src).toContain("options?: Omit<MutationOptions<Awaited<ReturnType<typeof addPet>>, Error, Parameters<typeof addPet>[0]>, 'mutationFn'>,")
    expect(src).toContain('invalidates: [getPet.key.prefix, listPets.key.prefix],')
    // Options come LAST, so a caller's `invalidates: []` turns it off.
    expect(src.indexOf('invalidates: [getPet')).toBeLessThan(src.indexOf('...options,'))
  })
})

describe('optimisticUpdate', () => {
  it('rewrites every cached entry under the key and rolls back exactly', async () => {
    const e = emitToDisk('e2', SPEC, { plugins: ['schemas', 'client', 'queries'] })
    const { optimisticUpdate } = await e.load<{
      optimisticUpdate: (c: QueryClient, ep: unknown, key: readonly unknown[], u: (x: unknown) => unknown) => Promise<() => void>
    }>('keys.ts')
    const eps = await e.load<Record<string, { key: ((a?: unknown) => readonly unknown[]) & { prefix: readonly unknown[] } }>>('endpoints/pets.ts')
    const getPet = eps.getPet as NonNullable<(typeof eps)['getPet']>
    const client = new QueryClient()
    client.setQueryData(getPet.key({ params: { id: '1' } }), { name: 'a' })
    client.setQueryData(getPet.key({ params: { id: '2' } }), { name: 'b' })
    const rollback = await optimisticUpdate(client, getPet, getPet.key.prefix, (p) => p && { name: 'renamed' })
    expect(client.getQueryData(getPet.key({ params: { id: '1' } }))).toEqual({ name: 'renamed' })
    expect(client.getQueryData(getPet.key({ params: { id: '2' } }))).toEqual({ name: 'renamed' })
    rollback()
    expect(client.getQueryData(getPet.key({ params: { id: '1' } }))).toEqual({ name: 'a' })
    expect(client.getQueryData(getPet.key({ params: { id: '2' } }))).toEqual({ name: 'b' })
  })
})
