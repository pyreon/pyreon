/**
 * Every generated mock fixture is one its OWN generated schema accepts
 * (audit C7). Checked the strongest way available: install the mocks and
 * call every endpoint with strict response validation, so the generated
 * client is the judge — for both validator dialects.
 */
import type { HttpMiddleware } from '@pyreon/http'
import { conforms, sampleFromPattern } from '../core/sample'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'

const PATTERNS = [
  '^[A-Z]{3}$',
  '^\\d{3}-\\d{4}$',
  '^[a-z0-9_-]{3,16}$',
  '^(foo|bar)+$',
  '^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$',
  '^v\\d+(\\.\\d+){2}(?:-[a-z]+)?$',
  '[A-F0-9]{8}',
]

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/pets': { get: { operationId: 'listPets', responses: { '200': { description: 'x', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } } } },
    '/thing': { get: { operationId: 'getThing', responses: { '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } } } } },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['name', 'code', 'age', 'long', 'cold', 'price', 'kind'],
        properties: {
          name: { type: 'string', maxLength: 4 },
          code: { type: 'string', pattern: '^[A-Z]{3}$' },
          age: { type: 'integer', minimum: 18 },
          long: { type: 'string', minLength: 30 },
          cold: { type: 'integer', maximum: 0 },
          price: { type: 'number', minimum: -10, maximum: -1 },
          kind: { type: 'string', enum: ['cat', 'dog'] },
          // A spec example that CONTRADICTS its own schema — used verbatim,
          // it produced a fixture the client rejects.
          nick: { type: 'string', maxLength: 3, example: 'far too long' },
          tag: { type: 'string', example: 'ok-example' },
        },
      },
      Thing: {
        type: 'object',
        required: PATTERNS.map((_, i) => `p${i}`),
        properties: Object.fromEntries(PATTERNS.map((p, i) => [`p${i}`, { type: 'string', pattern: p }])),
      },
    },
  },
})

afterAll(() => {
  cleanEmitted('c7-pyreon')
  cleanEmitted('c7-zod')
})

describe('mock fixtures satisfy their own schemas', () => {
  for (const validator of ['pyreon', 'zod'] as const) {
    it(`validator=${validator}: every endpoint accepts its mock under strict validation`, async () => {
      const e = emitToDisk(`c7-${validator}`, SPEC, { validator, plugins: ['schemas', 'client', 'mocks'] })
      const client = await e.load<{ setDevTransport(m: HttpMiddleware | null): void }>('client.ts')
      const mocks = await e.load<{ installMocks(): void }>('mocks.ts')
      const eps = await e.load<Record<string, () => Promise<unknown>>>('endpoints/index.ts')
      mocks.installMocks()
      try {
        const pets = (await eps.listPets?.()) as { nick?: string; tag?: string }[]
        await eps.getThing?.()
        expect(pets[0]?.nick).not.toBe('far too long')
        expect(pets[0]?.tag).toBe('ok-example')
      } finally {
        client.setDevTransport(null)
      }
    })
  }

  it('the pattern sampler produces a match or declines — never a mismatch', () => {
    for (const p of PATTERNS) {
      const v = sampleFromPattern(p)
      expect(v, p).toBeDefined()
      expect(new RegExp(p).test(v as string), `${p} -> ${v}`).toBe(true)
    }
    // Lookaround and backreferences are declined rather than guessed.
    expect(sampleFromPattern('^(?=.*\\d)[a-z\\d]{8}$')).toBeUndefined()
    expect(sampleFromPattern('^(a)\\1$')).toBeUndefined()
    expect(sampleFromPattern('[')).toBeUndefined()
  })

  it('conforms checks type, enum, range, length, pattern and required fields', () => {
    const resolve = (): undefined => undefined
    const obj = { kind: 'object', fields: [{ name: 'a', type: { kind: 'string', maxLength: 2 }, required: true }] } as const
    expect(conforms({ a: 'ok' }, obj, resolve)).toBe(true)
    expect(conforms({ a: 'long' }, obj, resolve)).toBe(false)
    expect(conforms({}, obj, resolve)).toBe(false)
    expect(conforms([1, 2], { kind: 'array', items: { kind: 'number', integer: true } }, resolve)).toBe(true)
    expect(conforms([1.5], { kind: 'array', items: { kind: 'number', integer: true } }, resolve)).toBe(false)
    expect(conforms('x', { kind: 'union', options: [{ kind: 'number', integer: false }, { kind: 'string' }] }, resolve)).toBe(true)
    expect(conforms(null, { kind: 'string' }, resolve)).toBe(false)
    expect(conforms(true, { kind: 'boolean' }, resolve)).toBe(true)
    expect(conforms('c', { kind: 'enum', values: ['a', 'b'] }, resolve)).toBe(false)
  })
})
