/**
 * The CALL SITE is typed from the spec — for direct endpoint calls as well as
 * hooks (dx D6/D7, audit A8/E4/A11b). Each assertion is a consumer file the
 * real TypeScript compiler checks against the generated tree: a line that must
 * compile, and an `@ts-expect-error` that must still be an error. An unused
 * `@ts-expect-error` is itself an error (TS2578), so a loosened type fails.
 */
import { typecheckSpec } from './helpers/typecheck'

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'findPets',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['available', 'sold'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'x',
            content: {
              'application/json': {
                // An INLINE response with an enum field: the hook used to
                // spell `'up' | 'down'` while `@pyreon/validate` infers
                // `string` — the two disagreed (audit A8).
                schema: { type: 'object', required: ['state', 'items'], properties: { state: { type: 'string', enum: ['up', 'down'] }, items: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } },
              },
            },
          },
        },
      },
      post: {
        operationId: 'addPet',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        responses: { '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
      },
    },
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
      },
      patch: {
        operationId: 'touchPet',
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer' } }],
        // `required` absent: OpenAPI's default is an OPTIONAL body.
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        responses: { '204': { description: 'x' } },
      },
    },
    '/search': {
      get: {
        operationId: 'search',
        // A GET body: fetch refuses to send it, so it is dropped (A11b).
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'x', content: { 'application/json': { schema: { type: 'string' } } } } },
      },
    },
  },
  components: {
    schemas: { Pet: { type: 'object', required: ['name'], properties: { id: { type: 'integer' }, name: { type: 'string' } } } },
  },
})

const CONSUMER = `
import { addPet, findPets, getPet, search, touchPet } from './endpoints/default'
import { useAddPet, useFindPets, useGetPet, useTouchPet } from './queries/default'

export async function direct(maybeLimit: number | undefined): Promise<void> {
  await getPet({ params: { petId: 1 } })
  // @ts-expect-error — the path parameter is an integer
  await getPet({ params: { petId: 'x' } })
  // @ts-expect-error — the path parameter is required
  await getPet({})
  await findPets()
  await findPets({ query: { status: 'sold', limit: maybeLimit } })
  // @ts-expect-error — not a value of the enum
  await findPets({ query: { status: 'nope' } })
  const r = await findPets()
  const state: string = r.state
  void state
  await addPet({ json: { name: 'Rex' } })
  // @ts-expect-error — the body is typed
  await addPet({ json: { wrong: true } })
  // @ts-expect-error — a required body is required
  await addPet()
  await touchPet({ params: { petId: 1 } })
  await search()
  // @ts-expect-error — a GET body is not sent, so it is not accepted either
  await search({ json: {} })
  await getPet({ params: { petId: 1 }, signal: new AbortController().signal })
}

export function hooks(): void {
  const q = useGetPet(() => ({ params: { petId: 1 } }), () => ({ staleTime: 1000 }))
  const name: string | undefined = q.data()?.name
  void name
  const count = useFindPets(() => undefined, () => ({ select: (r) => r.items.length }))
  const n: number | undefined = count.data()
  void n
  // @ts-expect-error — options are typed, a typo is an error
  useGetPet(() => ({ params: { petId: 1 } }), () => ({ staleTimeTypo: 1 }))
  const m = useAddPet({ onSuccess: (pet) => void pet.name })
  m.mutate({ json: { name: 'x' } })
  useTouchPet().mutate({ params: { petId: 2 } })
}
`

describe('call-site typing', () => {
  for (const [client, validator] of [
    ['pyreon', 'pyreon'],
    ['pyreon', 'zod'],
    ['fetch', 'pyreon'],
    ['axios', 'zod'],
  ] as const) {
    it(`client=${client} validator=${validator}`, () => {
      const { errors, result } = typecheckSpec(
        `d6-${client}-${validator}`,
        SPEC,
        { client, validator, plugins: ['schemas', 'client', 'queries'] },
        { extra: { 'consumer.ts': CONSUMER } },
      )
      expect(errors, errors.join('\n')).toEqual([])
      expect(result.doc.notes.map((n) => n.code)).toContain('body-on-get')
    })
  }
})
