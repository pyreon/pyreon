// analyzeValidate() + emitValidator() — the @pyreon/validate compile-time
// specialized-validator pass (slice 1: primitives + object/array + optional).
import { describe, expect, it } from 'vitest'
import { analyzeValidate, emitValidator, isEmittable, type ValidateNode } from '../validate-emit'

/** Eval an emitted validator source into a callable `(input) => Issue[]`. */
function compile(node: ValidateNode): (input: unknown) => Array<{ path: unknown[]; message: string }> {
  // oxlint-disable-next-line no-new-func
  return new Function(`return ${emitValidator(node)}`)()
}

/** Parse a single-schema source and return its IR node. */
function ir(src: string): ValidateNode {
  const infos = analyzeValidate(`const X = ${src}`)
  expect(infos).toHaveLength(1)
  return infos[0]!.node
}

describe('analyzeValidate — IR extraction', () => {
  it('parses a flat object of primitives with checks', () => {
    const infos = analyzeValidate(`const Login = s.object({ email: s.string().email(), age: s.number().int().min(18) })`)
    expect(infos).toHaveLength(1)
    const info = infos[0]!
    expect(info.name).toBe('Login')
    expect(info.emittable).toBe(true)
    expect(info.node).toEqual({
      kind: 'object',
      fields: [
        { key: 'email', value: { kind: 'string', checks: [{ kind: 'email' }] } },
        { key: 'age', value: { kind: 'number', checks: [{ kind: 'int' }, { kind: 'min', n: 18 }] } },
      ],
    })
  })

  it('parses optional / nested object / array', () => {
    expect(ir('s.string().optional()')).toEqual({ kind: 'optional', inner: { kind: 'string', checks: [] } })
    expect(ir('s.array(s.number())')).toEqual({ kind: 'array', element: { kind: 'number', checks: [] } })
    expect(ir('s.object({ inner: s.object({ x: s.boolean() }) })')).toEqual({
      kind: 'object',
      fields: [{ key: 'inner', value: { kind: 'object', fields: [{ key: 'x', value: { kind: 'boolean' } }] } }],
    })
  })

  it('parses literal + number bounds (gte/lte → min/max)', () => {
    expect(ir('s.literal("admin")')).toEqual({ kind: 'literal', value: 'admin' })
    expect(ir('s.number().gte(0).lte(100)')).toEqual({
      kind: 'number',
      checks: [{ kind: 'min', n: 0 }, { kind: 'max', n: 100 }],
    })
    expect(ir('s.number().gt(0).lt(10)')).toEqual({
      kind: 'number',
      checks: [{ kind: 'gt', n: 0 }, { kind: 'lt', n: 10 }],
    })
  })

  it('marks unknown methods / shapes unsupported (conservative bail)', () => {
    expect(isEmittable(ir('s.string().refine(x => true)'))).toBe(false)
    expect(isEmittable(ir('s.record(s.number())'))).toBe(false)
    expect(isEmittable(ir('s.object({ ...spread })'))).toBe(false)
    expect(isEmittable(ir('s.number().min(someVar)'))).toBe(false) // non-literal arg
    // a single unsupported field makes the whole object non-emittable
    expect(analyzeValidate(`const X = s.object({ ok: s.string(), bad: s.custom() })`)[0]!.emittable).toBe(false)
  })

  it('ignores non-s expressions', () => {
    expect(analyzeValidate(`const x = foo.bar(); const y = 42`)).toHaveLength(0)
  })

  it('flags module-level vs nested scope via topLevel', () => {
    // Module-level const → safe to attach a module-end verdict.
    expect(analyzeValidate(`const X = s.string()`)[0]!.topLevel).toBe(true)
    expect(analyzeValidate(`export const X = s.string()`)[0]!.topLevel).toBe(true)
    // Function/block-scoped → NOT top-level (a module-end attach would ReferenceError).
    expect(analyzeValidate(`function f() { const X = s.string(); return X }`)[0]!.topLevel).toBe(false)
    expect(analyzeValidate(`const f = () => { const X = s.string() }`)[0]!.topLevel).toBe(false)
    expect(analyzeValidate(`{ const X = s.string() }`)[0]!.topLevel).toBe(false)
  })
})

describe('emitValidator — eval\'d verdicts', () => {
  it('string with email + min', () => {
    const v = compile(ir('s.string().min(3).email()'))
    expect(v('a@b.co')).toHaveLength(0)
    expect(v('x@y.io').some((i) => i.message === 'Invalid email')).toBe(false) // valid (2+ char TLD)
    expect(v('x@y.z').some((i) => i.message === 'Invalid email')).toBe(true) // 1-char TLD rejected (strict standard)
    expect(v(42)[0]?.message).toBe('Expected string')
    expect(v('no-at-sign').some((i) => i.message === 'Invalid email')).toBe(true)
    expect(v('a@').some((i) => i.message === 'Invalid email')).toBe(true)
  })

  it('number int + bounds', () => {
    const v = compile(ir('s.number().int().min(0).max(10)'))
    expect(v(5)).toHaveLength(0)
    expect(v(3.5)[0]?.message).toBe('Must be an integer')
    expect(v(-1).some((i) => i.message === 'Must be >= 0')).toBe(true)
    expect(v(11).some((i) => i.message === 'Must be <= 10')).toBe(true)
    expect(v(NaN)[0]?.message).toBe('Expected number')
    expect(v('5')[0]?.message).toBe('Expected number')
  })

  it('object with field paths', () => {
    const v = compile(ir('s.object({ email: s.string().email(), age: s.number().int() })'))
    expect(v({ email: 'a@b.co', age: 30 })).toHaveLength(0)
    const bad = v({ email: 'nope', age: 1.5 })
    expect(bad).toHaveLength(2)
    expect(bad.find((i) => i.message === 'Invalid email')?.path).toEqual(['email'])
    expect(bad.find((i) => i.message === 'Must be an integer')?.path).toEqual(['age'])
    expect(v(null)[0]?.message).toBe('Expected object')
    expect(v([])[0]?.message).toBe('Expected object')
  })

  it('optional skips undefined but validates a present value', () => {
    const v = compile(ir('s.object({ nick: s.string().min(2).optional() })'))
    expect(v({})).toHaveLength(0)
    expect(v({ nick: undefined })).toHaveLength(0)
    expect(v({ nick: 'x' })).toHaveLength(1) // present but too short
    expect(v({ nick: 'ok' })).toHaveLength(0)
  })

  it('array element validation carries the index path', () => {
    const v = compile(ir('s.array(s.number().int())'))
    expect(v([1, 2, 3])).toHaveLength(0)
    const bad = v([1, 2.5, 'x'])
    expect(bad.find((i) => i.message === 'Must be an integer')?.path).toEqual([1])
    expect(bad.find((i) => i.message === 'Expected number')?.path).toEqual([2])
    expect(v('not-array')[0]?.message).toBe('Expected array')
  })

  it('literal + boolean', () => {
    expect(compile(ir('s.literal("admin")'))('admin')).toHaveLength(0)
    expect(compile(ir('s.literal("admin")'))('user')).toHaveLength(1)
    expect(compile(ir('s.boolean()'))(true)).toHaveLength(0)
    expect(compile(ir('s.boolean()'))(1)[0]?.message).toBe('Expected boolean')
  })

  it('throws when asked to emit an unsupported node', () => {
    expect(() => emitValidator(ir('s.custom()'))).toThrow(/not emittable/)
  })

  it('nested object + array + optional compose end-to-end', () => {
    const v = compile(
      ir('s.object({ tags: s.array(s.string().nonEmpty()), meta: s.object({ n: s.number() }).optional() })'),
    )
    expect(v({ tags: ['a', 'b'] })).toHaveLength(0)
    expect(v({ tags: ['a', ''], meta: { n: 1 } }).find((i) => i.message === 'Must not be empty')?.path).toEqual([
      'tags',
      1,
    ])
    expect(v({ tags: [], meta: { n: 'x' } }).find((i) => i.message === 'Expected number')?.path).toEqual(['meta', 'n'])
  })
})
