/**
 * A closed set of values is a literal union in the TYPES — on the interface,
 * in the schema's inferred output, and through every place a type can sit.
 *
 * `@pyreon/validate`'s `s.enum` infers `L[number]` from the array it receives,
 * and the emitted `s.enum(['available', 'pending', 'sold'])` widened that array
 * to `string[]`. The schema therefore inferred `string`, the interface was
 * written as `string` to agree with it, and `Pet.status` accepted any string —
 * with the schema/interface agreement check green, because both sides had lost
 * the same information. That check now also compares each interface with the
 * type the SPEC describes (`$spec` in `schemas.agreement.ts`), which is what
 * catches a loss shared by both.
 */
import type { ValidatorName } from '../core/config'
import { emitSchemaAgreement } from '../emit/schema'
import { banner } from '../emit/writer'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'E', version: '1' },
  servers: [{ url: 'https://e.test' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        tags: ['pets'],
        responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['status', 'kind'],
        properties: {
          status: { type: 'string', enum: ['available', 'pending', 'sold'] },
          kind: { type: 'string', const: 'pet' },
          optional: { type: 'string', enum: ['a', 'b'] },
          nullable: { type: 'string', enum: ['x', 'y'], nullable: true },
          list: { type: 'array', items: { type: 'string', enum: ['red', 'green'] } },
          level: { type: 'integer', enum: [1, 2, 3] },
          mixed: { enum: ['auto', 0, true, null] },
          flag: { type: 'boolean', enum: [true] },
        },
      },
      Status: { type: 'string', enum: ['on', 'off'] },
    },
  },
})

const EXPECTED = [
  "  status: 'available' | 'pending' | 'sold'",
  "  kind: 'pet'",
  "  optional?: 'a' | 'b' | undefined",
  "  nullable?: 'x' | 'y' | null | undefined",
  "  list?: ('red' | 'green')[] | undefined",
  '  level?: 1 | 2 | 3 | undefined',
  "  mixed?: 'auto' | 0 | true | null | undefined",
  '  flag?: true | undefined',
]

afterAll(() => {
  for (const v of ['pyreon', 'zod']) cleanTypecheck(`enum-literal-${v}`)
})

describe.each(['pyreon', 'zod'] satisfies ValidatorName[])('enum and const types — validator=%s', (validator) => {
  const extra = (result: Parameters<typeof emitSchemaAgreement>[0]): Record<string, string> => ({
    'schemas.agreement.ts': emitSchemaAgreement(result, validator).build(banner('E', '1')).contents,
  })

  it('interfaces carry the literal union, and the schema infers the same', () => {
    // First pass to get the IR for the agreement module; the second compiles both.
    const first = typecheckSpec(`enum-literal-${validator}`, SPEC, { validator, plugins: ['schemas'] })
    const { errors, result } = typecheckSpec(
      `enum-literal-${validator}`,
      SPEC,
      { validator, plugins: ['schemas'] },
      {
        extra: {
          ...extra(first.result.doc),
          // The consumer-side proof: a value outside the set is a TYPE error.
          'consumer.ts': [
            "import type { Pet, Status } from './schemas'",
            "const ok: Pet = { status: 'sold', kind: 'pet' }",
            "// @ts-expect-error — not one of the statuses",
            "const bad: Pet = { status: 'lost', kind: 'pet' }",
            "const s: Status = 'on'",
            "// @ts-expect-error — not one of the values",
            "const t: Status = 'maybe'",
            'export { ok, bad, s, t }',
          ].join('\n'),
        },
      },
    )
    expect(errors, errors.join('\n')).toEqual([])
    const pet = result.files.find((f) => f.path === 'schemas/Pet.ts')?.contents ?? ''
    for (const line of EXPECTED) expect(pet).toContain(line)
    expect(result.files.find((f) => f.path === 'schemas/Status.ts')?.contents).toContain(
      "export type Status = 'on' | 'off'",
    )
  })
})
