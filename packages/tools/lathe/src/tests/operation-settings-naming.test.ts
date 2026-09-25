/**
 * `operations` (per-operation settings) and `naming` (rename what Lathe
 * generates).
 *
 * Both change NAMES that several emitters must agree on — the queries module,
 * the previews, the infinite hook, the docs, the native layout — so the
 * assertions read the emitted files, the consumer typecheck proves the pieces
 * still fit, and the runtime spec proves a per-operation validation mode is
 * honoured by the request that actually goes out.
 */
import type { HttpMiddleware, HttpRequest, HttpResponse } from '@pyreon/http'
import { resolveConfig, type LatheSection } from '../core/config'
import { generate } from '../core/generate'
import { definePlugin } from '../core/plugin'
import { CUSTOMIZE_SPEC } from './helpers/customize-spec'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'
import { typecheckSpec } from './helpers/typecheck'

const gen = (section: Omit<LatheSection, 'input'> = {}) =>
  generate(
    CUSTOMIZE_SPEC,
    resolveConfig({ input: 'spec.json', plugins: ['schemas', 'client', 'queries', 'components', 'docs'], ...section }),
  )
const file = (r: ReturnType<typeof gen>, path: string): string => r.files.find((f) => f.path === path)?.contents ?? ''
const paths = (r: ReturnType<typeof gen>) => r.files.map((f) => f.path)

const PAGE = { kind: 'cursor', param: 'cursor', next: 'next', items: 'data' } as const

describe('operations.<id>.hook', () => {
  it('renames the hook everywhere it is named: queries, previews, docs, infinite hook', () => {
    const r = gen({
      operations: { listPets: { hook: 'usePetList', pagination: { kind: 'cursor', param: 'cursor', next: 'next' } } },
    })
    const q = file(r, 'queries/pets.ts')
    expect(q).toContain('export function usePetList<')
    expect(q).toContain('export function usePetListInfinite(')
    expect(q).not.toContain('useListPets')
    expect(file(r, 'components.tsx')).toContain('usePetList(')
    expect(file(r, 'docs/pets.md')).toContain("import { usePetList } from './gen/queries/pets'")
  })

  it('a key may be the spec\'s own operationId', () => {
    expect(file(gen({ operations: { 'list-pets': { hook: 'usePetList' } } }), 'queries/pets.ts')).toContain('usePetList')
  })

  it('`hook: false` keeps the endpoint and drops the hook, its preview and its docs mention', () => {
    const r = gen({ operations: { listOrders: { hook: false }, getPetById: { hook: false } } })
    expect(file(r, 'endpoints/store.ts')).toContain('export const listOrders')
    // The store group had only that operation: no queries module, and the
    // barrel does not name one.
    expect(paths(r)).not.toContain('queries/store.ts')
    expect(file(r, 'queries/index.ts')).not.toContain('./store')
    expect(file(r, 'queries/pets.ts')).not.toContain('useGetPetById')
    expect(file(r, 'components.tsx')).not.toContain('ListOrders')
    expect(file(r, 'docs/store.md')).toContain("import { listOrders } from './gen/endpoints/store'")
  })

  it('`hook: false` removes the native data component too — and the reach report says so', () => {
    const r = generate(
      CUSTOMIZE_SPEC,
      resolveConfig({ input: 'x', target: 'multiplatform', operations: { listOrders: { hook: false } } }),
    )
    expect(file(r, 'store.native.tsx')).not.toMatch(/function ListOrders/)
    expect(r.reach.get('listOrders')?.reach).toBe('web-only')
  })

  it('refuses a hook that is not a hook name, or collides with anything the hook modules bind', () => {
    expect(() => gen({ operations: { listPets: { hook: 'petList' } } })).toThrow(/must start with `use`/)
    expect(() => gen({ operations: { listPets: { hook: 'useGetPetById' } } })).toThrow(
      /`useGetPetById` is used twice .*the hook for `getPetById` and the hook for `listPets`|the hook for `listPets`/,
    )
    expect(() => gen({ operations: { listPets: { hook: 'useQuery' } } })).toThrow(/`@pyreon\/query`'s `useQuery`/)
  })

  it('refuses an unknown operation, an unknown key, and pagination declared twice', () => {
    expect(() => gen({ operations: { listPet: { hook: 'useX' } } })).toThrow(/`operations.listPet` names no operation\. Did you mean `listPets`\?/)
    expect(() => gen({ operations: { listPets: { hooks: false } as never } })).toThrow(/unknown key `hooks`\. Did you mean `hook`\?/)
    expect(() => gen({ pagination: { listPets: PAGE }, operations: { listPets: { pagination: PAGE } } })).toThrow(
      /`listPets` declares pagination twice/,
    )
  })

  it('`operations.<id>.pagination` is the same declaration `pagination` takes', () => {
    const a = gen({ pagination: { listPets: PAGE } })
    const b = gen({ operations: { listPets: { pagination: PAGE } } })
    expect(file(b, 'queries/pets.ts')).toBe(file(a, 'queries/pets.ts'))
    expect(file(b, 'queries/pets.ts')).toContain('useListPetsInfinite')
  })
})

describe('operations.<id>.responseValidation', () => {
  it('is declared on that endpoint only', () => {
    const r = gen({ operations: { listOrders: { responseValidation: 'off' } } })
    expect(file(r, 'endpoints/store.ts')).toContain("validate: 'off'")
    expect(file(r, 'endpoints/pets.ts')).not.toContain('validate:')
    expect(() => gen({ operations: { listOrders: { responseValidation: 'loose' as never } } })).toThrow(
      /must be strict, warn, off/,
    )
  })

  const SPEC = JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'T', version: '1' },
    servers: [{ url: 'https://api.test' }],
    paths: {
      '/a': { get: { operationId: 'getA', responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Named' } } } } } } },
      '/b': { get: { operationId: 'getB', responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Named' } } } } } } },
    },
    components: { schemas: { Named: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
  })
  afterAll(() => {
    for (const c of ['pyreon', 'fetch', 'axios', 'ky']) cleanEmitted(`per-op-validate-${c}`)
  })

  it('pyreon client: the overridden endpoint passes a bad body through, its sibling still rejects', async () => {
    const e = emitToDisk('per-op-validate-pyreon', SPEC, {
      plugins: ['schemas', 'client'],
      operations: { getA: { responseValidation: 'off' } },
    })
    const client = await e.load<{ setDevTransport(m: HttpMiddleware | null): void }>('client.ts')
    const eps = await e.load<Record<string, () => Promise<unknown>>>('endpoints/index.ts')
    client.setDevTransport(
      (req: HttpRequest): Promise<HttpResponse> =>
        Promise.resolve({
          raw: new Response('{"name":1}', { headers: { 'content-type': 'application/json' } }),
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          request: req,
        }),
    )
    try {
      await expect(eps.getA?.()).resolves.toEqual({ name: 1 })
      await expect(eps.getB?.()).rejects.toThrow()
    } finally {
      client.setDevTransport(null)
    }
  })

  for (const client of ['fetch', 'axios', 'ky'] as const) {
    it(`${client} client: the overridden endpoint passes a bad body through, its sibling still rejects`, async () => {
      const e = emitToDisk(`per-op-validate-${client}`, SPEC, {
        plugins: ['schemas', 'client'],
        client,
        operations: { getA: { responseValidation: 'off' } },
      })
      const c = await e.load<{ setDevTransport(t: (() => unknown) | null): void }>('client.ts')
      const eps = await e.load<Record<string, () => Promise<unknown>>>('endpoints/index.ts')
      c.setDevTransport(() => ({ json: { name: 1 } }))
      try {
        await expect(eps.getA?.()).resolves.toEqual({ name: 1 })
        await expect(eps.getB?.()).rejects.toThrow()
      } finally {
        c.setDevTransport(null)
      }
    })
  }
})

describe('naming', () => {
  it('operation: renames endpoints (and so hooks), from the spec context', () => {
    const r = gen({ naming: { operation: (c) => (c.operationId === 'list-pets' ? 'browsePets' : c.default) } })
    expect(file(r, 'endpoints/pets.ts')).toContain('export const browsePets')
    expect(file(r, 'queries/pets.ts')).toContain('export function useBrowsePets<')
  })

  it('model: renames the model AND every reference to it', () => {
    const r = gen({ naming: { model: (c) => `${c.default}Dto` } })
    expect(paths(r)).toContain('schemas/PetDto.ts')
    expect(file(r, 'schemas/OrderDto.ts')).toContain('PetDto')
    expect(file(r, 'endpoints/pets.ts')).toContain('response: PetDto')
    expect(r.doc.models.find((m) => m.name === 'PetDto')?.source?.name).toBe('Pet')
  })

  it('file: renames the group file under every layer', () => {
    const r = gen({ naming: { file: (c) => `${c.default}-api` } })
    expect(paths(r)).toEqual(expect.arrayContaining(['endpoints/pets-api.ts', 'queries/pets-api.ts', 'docs/pets-api.md']))
    expect(paths(r)).not.toContain('endpoints/pets.ts')
  })

  it('hook: renames, or returns false to drop, per operation', () => {
    const r = gen({ naming: { hook: (c) => (c.kind === 'mutation' ? false : c.default.replace(/^use/, 'useApi')) } })
    const q = file(r, 'queries/pets.ts')
    expect(q).toContain('export function useApiListPets<')
    expect(q).not.toContain('useCreatePet')
    // An explicit `operations` hook wins over the naming function.
    expect(file(gen({ naming: { hook: () => false }, operations: { listPets: { hook: 'usePets' } } }), 'queries/pets.ts')).toContain(
      'export function usePets<',
    )
  })

  it('every collision is refused, naming both sides', () => {
    expect(() => gen({ naming: { operation: () => 'same' } })).toThrow(/`naming.operation` maps both `\w+` and `\w+` to `same`/)
    expect(() => gen({ naming: { model: (c) => (c.default === 'Order' ? 'Pet' : c.default) } })).toThrow(
      /`naming.model` maps both `\w+` and `\w+` to `Pet`/,
    )
    // Files compare case-insensitively: one file on macOS and Windows.
    expect(() => gen({ naming: { file: () => 'all' } })).toThrow(/`naming.file` maps both/)
  })

  it('every invalid name is refused with a usable suggestion', () => {
    expect(() => gen({ naming: { operation: (c) => `${c.default}-x` } })).toThrow(/not a usable endpoint name .*e\.g\. `\w+X`/)
    expect(() => gen({ naming: { operation: (c) => (c.default === 'listPets' ? 'api' : c.default) } })).toThrow(
      /`api`.*not a usable endpoint name/,
    )
    expect(() => gen({ naming: { model: (c) => `${c.default}!` } })).toThrow(/not a usable model name/)
    expect(() => gen({ naming: { file: () => 'Pets API' } })).toThrow(/lowercase kebab-case .*e\.g\. `pets-api`/)
  })

  it('a naming function that throws is attributed to it', () => {
    expect(() =>
      gen({
        naming: {
          model: () => {
            throw new Error('boom')
          },
        },
      }),
    ).toThrow('`naming.model` threw for `Order`: boom')
  })

  it('plugins see the final names', () => {
    let seen: string[] = []
    const reader = definePlugin({
      name: 'reader',
      emit: ({ doc }) => {
        seen = doc.operations.map((o) => `${o.id}:${String(o.hook)}`).sort()
        return []
      },
    })
    gen({ naming: { operation: (c) => (c.default === 'listPets' ? 'browsePets' : c.default) }, operations: { browsePets: { hook: 'useBrowse' } }, plugins: ['schemas', 'client', reader] })
    expect(seen).toContain('browsePets:useBrowse')
  })
})

describe('the customized client TYPECHECKS as a consumer uses it', () => {
  it('renamed hooks, a dropped hook, renamed models and files, per-op validation', () => {
    const { errors } = typecheckSpec(
      'customized',
      CUSTOMIZE_SPEC,
      {
        plugins: ['schemas', 'client', 'queries', 'components'],
        operations: {
          listPets: { hook: 'usePetList', responseValidation: 'warn', pagination: { kind: 'cursor', param: 'cursor', next: 'next' } },
          deleteUser: { hook: false },
        },
        naming: { model: (c) => `${c.default}Dto`, file: (c) => `${c.default}-api` },
      },
      {
        noUnused: true,
        extra: {
          'use.ts': [
            "import { usePetList, usePetListInfinite } from './queries/pets-api'",
            "import { deleteUser } from './endpoints/users-api'",
            "import type { PetDto } from './schemas'",
            'export const q = usePetList(() => ({}))',
            'export const i = usePetListInfinite(() => ({}))',
            "export const d = deleteUser({ params: { id: '1' } })",
            "export const p: PetDto = { id: '1', name: 'x' }",
            '',
          ].join('\n'),
        },
      },
    )
    expect(errors).toEqual([])
  })
})
