/**
 * Cross-runtime equivalence gate — proves the COMPILE-TIME specialized
 * validator (`@pyreon/compiler`'s `analyzeValidate` → `emitValidator`) agrees
 * with the RUNTIME `s` schema on the accept/reject verdict for every input in a
 * corpus.
 *
 * Each case is ONE schema source string. It is built two ways from that single
 * source:
 *   - runtime  — `new Function('s', 'return ' + src)(s)` → the real `@pyreon/validate` schema.
 *   - compiled — `analyzeValidate('const X = ' + src)[0].node` → `emitValidator` → eval.
 * Then every input is run through both, and `compiled(input).length === 0` MUST
 * equal `runtime.parse(input).ok`. Any divergence fails the gate.
 *
 * This is the layer the compiler-emit PR deliberately deferred (it kept the
 * dep graph clean — this test lives in @pyreon/validate, a fundamentals package
 * that may devDep the core @pyreon/compiler; the correct direction).
 */
import { analyzeValidate, emitValidator, type ValidateNode } from '@pyreon/compiler'
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

type EmittedValidator = (input: unknown) => Array<{ path: unknown[]; message: string }>

function compileFromSource(src: string): { node: ValidateNode; validate: EmittedValidator; emittable: boolean } {
  const infos = analyzeValidate(`const X = ${src}`)
  const info = infos[0]!
  if (!info.emittable) return { node: info.node, emittable: false, validate: () => [] }
  // oxlint-disable-next-line no-new-func
  const validate = new Function(`return ${emitValidator(info.node)}`)() as EmittedValidator
  return { node: info.node, emittable: true, validate }
}

function buildRuntime(src: string): { parse: (input: unknown) => { ok: boolean } } {
  // oxlint-disable-next-line no-new-func
  return new Function('s', `return ${src}`)(s)
}

/** Each corpus entry: the schema source + a set of inputs spanning valid + invalid. */
const CORPUS: Array<{ src: string; inputs: unknown[] }> = [
  {
    src: `s.string()`,
    inputs: ['hi', '', 42, null, undefined, {}, [], true],
  },
  {
    src: `s.string().min(3).max(6)`,
    inputs: ['abc', 'ab', 'abcdef', 'abcdefg', '', 'x', 99],
  },
  {
    src: `s.string().email()`,
    inputs: ['a@b.co', 'a@b', 'no-at', '@x.com', 'x@y.z', 1, ''],
  },
  {
    src: `s.string().url()`,
    inputs: ['https://x.com', 'http://a.b/c?d=1', 'ftp://x', 'notaurl', '', 5],
  },
  {
    src: `s.string().uuid()`,
    inputs: ['550e8400-e29b-41d4-a716-446655440000', 'not-a-uuid', '550e8400', 9],
  },
  {
    src: `s.string().nonEmpty()`,
    inputs: ['x', '', '   ', 0],
  },
  {
    src: `s.number()`,
    inputs: [0, 1, -1, 3.14, NaN, '5', null, undefined, true],
  },
  {
    src: `s.number().int()`,
    inputs: [1, 0, -3, 1.5, NaN, '2'],
  },
  {
    src: `s.number().min(0).max(100)`,
    inputs: [0, 50, 100, -1, 101, 50.5, NaN],
  },
  {
    src: `s.number().gt(0).lt(10)`,
    inputs: [5, 0, 10, 0.001, 9.999, -5, 11],
  },
  {
    src: `s.boolean()`,
    inputs: [true, false, 0, 1, 'true', null, undefined],
  },
  {
    src: `s.literal("admin")`,
    inputs: ['admin', 'user', '', 'Admin', 0, null],
  },
  {
    src: `s.array(s.number().int())`,
    inputs: [[], [1, 2, 3], [1, 2.5], [1, 'x'], 'nope', null, [0, -3, 7]],
  },
  {
    src: `s.object({ email: s.string().email(), age: s.number().int().min(18) })`,
    inputs: [
      { email: 'a@b.co', age: 18 },
      { email: 'a@b.co', age: 17 },
      { email: 'nope', age: 30 },
      { email: 'a@b.co', age: 30.5 },
      { email: 'a@b.co' }, // missing required age
      { email: 'a@b.co', age: 30, extra: 'stripped-but-still-valid' },
      null,
      [],
      'string',
    ],
  },
  {
    src: `s.object({ tags: s.array(s.string().nonEmpty()), meta: s.object({ n: s.number() }).optional() })`,
    inputs: [
      { tags: ['a', 'b'] },
      { tags: [] },
      { tags: ['a', ''] },
      { tags: ['a'], meta: { n: 1 } },
      { tags: ['a'], meta: { n: 'x' } },
      { tags: 'notarray' },
      {},
    ],
  },
  {
    src: `s.object({ name: s.string().min(2).optional() })`,
    inputs: [{}, { name: undefined }, { name: 'x' }, { name: 'ok' }, { name: 5 }],
  },
]

describe('emit ⟷ runtime equivalence', () => {
  for (const { src, inputs } of CORPUS) {
    it(`agrees on verdict for ${src}`, () => {
      const { validate, emittable } = compileFromSource(src)
      expect(emittable, `${src} should be emittable`).toBe(true)
      const runtime = buildRuntime(src)
      for (const input of inputs) {
        const compiledOk = validate(input).length === 0
        const runtimeOk = runtime.parse(input).ok
        expect(
          compiledOk,
          `verdict mismatch for input ${JSON.stringify(input)} on ${src} (compiled=${compiledOk}, runtime=${runtimeOk})`,
        ).toBe(runtimeOk)
      }
    })
  }

  it('every corpus schema is emittable (else the gate is silently hollow)', () => {
    for (const { src } of CORPUS) {
      expect(compileFromSource(src).emittable, `${src} not emittable`).toBe(true)
    }
  })
})
