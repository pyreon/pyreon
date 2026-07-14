// analyzeValidate() + emitValidator() — the @pyreon/validate compile-time
// specialized-validator pass (slice 1: primitives + object/array + optional).
import { describe, expect, it } from 'vitest'
import {
  analyzeValidate,
  emitSchemaSource,
  emitValidator,
  isEmittable,
  type ValidateNode,
} from '../validate-emit'

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

// ─── Full string check vocabulary — the branches beyond min/email/nonEmpty ────
describe('emitValidator — full string vocabulary', () => {
  it('max / length verdicts', () => {
    const vmax = compile(ir('s.string().max(3)'))
    expect(vmax('ab')).toHaveLength(0)
    expect(vmax('abcd')[0]?.message).toBe('Must be at most 3 characters')

    const vlen = compile(ir('s.string().length(4)'))
    expect(vlen('abcd')).toHaveLength(0)
    expect(vlen('abc')[0]?.message).toBe('Must be exactly 4 characters')
  })

  it('url / uuid verdicts', () => {
    const vurl = compile(ir('s.string().url()'))
    expect(vurl('https://example.com')).toHaveLength(0)
    expect(vurl('not a url')[0]?.message).toBe('Invalid URL')

    const vuuid = compile(ir('s.string().uuid()'))
    expect(vuuid('550e8400-e29b-41d4-a716-446655440000')).toHaveLength(0)
    expect(vuuid('nope')[0]?.message).toBe('Invalid UUID')
  })

  it('regex verdict from a literal pattern (IR carries source + flags)', () => {
    expect(ir('s.string().regex(/^[0-9]{3}$/)')).toEqual({
      kind: 'string',
      checks: [{ kind: 'regex', source: '^[0-9]{3}$', flags: '' }],
    })
    const v = compile(ir('s.string().regex(/^[0-9]{3}$/)'))
    expect(v('123')).toHaveLength(0)
    expect(v('12')[0]?.message).toBe('Invalid format')
  })

  it('non-literal / unknown string methods → unsupported (not emittable)', () => {
    expect(isEmittable(ir('s.string().max(x)'))).toBe(false)
    expect(isEmittable(ir('s.string().length(n)'))).toBe(false)
    expect(isEmittable(ir('s.string().regex(dynamicRe)'))).toBe(false)
    expect(isEmittable(ir('s.string().weird()'))).toBe(false)
  })
})

// ─── Full number check vocabulary — gt/lt/positive/negative/gte/lte ───────────
describe('emitValidator — full number vocabulary', () => {
  it('gt / lt are exclusive', () => {
    const vgt = compile(ir('s.number().gt(0)'))
    expect(vgt(1)).toHaveLength(0)
    expect(vgt(0)[0]?.message).toBe('Must be > 0')

    const vlt = compile(ir('s.number().lt(10)'))
    expect(vlt(9)).toHaveLength(0)
    expect(vlt(10)[0]?.message).toBe('Must be < 10')
  })

  it('positive / negative verdicts', () => {
    const vpos = compile(ir('s.number().positive()'))
    expect(vpos(1)).toHaveLength(0)
    expect(vpos(0)[0]?.message).toBe('Must be positive')

    const vneg = compile(ir('s.number().negative()'))
    expect(vneg(-1)).toHaveLength(0)
    expect(vneg(0)[0]?.message).toBe('Must be negative')
  })

  it('gte / lte alias to min / max in the IR + verdict', () => {
    expect(ir('s.number().gte(5)')).toEqual({ kind: 'number', checks: [{ kind: 'min', n: 5 }] })
    expect(ir('s.number().lte(5)')).toEqual({ kind: 'number', checks: [{ kind: 'max', n: 5 }] })
    const v = compile(ir('s.number().gte(5).lte(10)'))
    expect(v(7)).toHaveLength(0)
    expect(v(4)[0]?.message).toBe('Must be >= 5')
    expect(v(11)[0]?.message).toBe('Must be <= 10')
  })

  it('extracts a negative numeric-literal bound (unary minus)', () => {
    expect(ir('s.number().min(-5)')).toEqual({ kind: 'number', checks: [{ kind: 'min', n: -5 }] })
  })

  it('non-literal / missing / unknown number methods → unsupported', () => {
    expect(isEmittable(ir('s.number().gt(x)'))).toBe(false)
    expect(isEmittable(ir('s.number().min()'))).toBe(false) // no arg → numArg null → UNSUP
    expect(isEmittable(ir('s.number().mystery()'))).toBe(false)
  })
})

// ─── literalArg — numeric / boolean / negative / missing ──────────────────────
describe('emitValidator — literal arg shapes', () => {
  it('parses numeric / boolean / negative literals', () => {
    expect(ir('s.literal(42)')).toEqual({ kind: 'literal', value: 42 })
    expect(ir('s.literal(true)')).toEqual({ kind: 'literal', value: true })
    expect(ir('s.literal(false)')).toEqual({ kind: 'literal', value: false })
    expect(ir('s.literal(-7)')).toEqual({ kind: 'literal', value: -7 })
    expect(compile(ir('s.literal(42)'))(42)).toHaveLength(0)
    expect(compile(ir('s.literal(42)'))(43)[0]?.message).toBe('Expected 42')
  })

  it('an empty / non-primitive literal is unsupported', () => {
    expect(isEmittable(ir('s.literal()'))).toBe(false)
    expect(isEmittable(ir('s.literal({})'))).toBe(false)
  })
})

// ─── Unsupported-shape bails — every UNSUP path stays non-emittable ───────────
describe('analyzeValidate — unsupported shapes bail to non-emittable', () => {
  it('non-literal string.min → unsupported', () => {
    expect(isEmittable(ir('s.string().min(x)'))).toBe(false)
  })
  it('object with a non-literal shape arg', () => {
    expect(isEmittable(ir('s.object(sharedShape)'))).toBe(false)
  })
  it('object with a computed key', () => {
    expect(isEmittable(ir('s.object({ [dynamic]: s.string() })'))).toBe(false)
  })
  it('object with a spread / shorthand property', () => {
    expect(isEmittable(ir('s.object({ ...base, x: s.string() })'))).toBe(false)
  })
  it('a field whose value is not an s.* chain', () => {
    expect(isEmittable(ir('s.object({ x: foo() })'))).toBe(false)
  })
  it('a method chained onto an already-unsupported base short-circuits', () => {
    // base `s.custom()` → unsupported; the trailing `.min(2)` must not throw,
    // it returns the unsupported node unchanged (the method-loop guard).
    expect(isEmittable(ir('s.custom().min(2)'))).toBe(false)
  })
  it('a method chained onto an unsupported OBJECT base hits the loop guard', () => {
    // `s.object(shape)` parses to unsupported (non-literal shape) AND has a
    // trailing `.optional()`, so the method loop re-enters with an already-
    // unsupported node and returns it via the top-of-loop guard.
    expect(isEmittable(ir('s.object(shape).optional()'))).toBe(false)
  })
  it('a method on a base that supports no methods yet (boolean.foo)', () => {
    expect(isEmittable(ir('s.boolean().foo()'))).toBe(false)
  })
  it('array missing its element schema', () => {
    expect(isEmittable(ir('s.array()'))).toBe(false)
  })
})

// ─── emitSchemaSource — the tree-shakeable @pyreon/validate/mini rewrite ──────
describe('emitSchemaSource — mini construction expr + import set', () => {
  it('a bare string is just the ctor', () => {
    expect(emitSchemaSource(ir('s.string()'))).toEqual({ code: 'string()', imports: new Set(['string']) })
  })

  it('maps every string action to its mini form + collects imports', () => {
    const r = emitSchemaSource(
      ir('s.string().email().min(2).max(5).length(3).url().uuid().nonEmpty()'),
    )
    expect(r.code).toBe(
      'string().check(email(), minLength(2), maxLength(5), length(3), url(), uuid(), nonEmpty())',
    )
    expect(r.imports).toEqual(
      new Set(['string', 'email', 'minLength', 'maxLength', 'length', 'url', 'uuid', 'nonEmpty']),
    )
  })

  it('maps every number action to its mini form + collects imports', () => {
    const r = emitSchemaSource(ir('s.number().int().min(0).max(9).gt(1).lt(8).positive().negative()'))
    expect(r.code).toBe('number().check(integer(), minValue(0), maxValue(9), gt(1), lt(8), positive(), negative())')
    expect(r.imports).toEqual(
      new Set(['number', 'integer', 'minValue', 'maxValue', 'gt', 'lt', 'positive', 'negative']),
    )
  })

  it('emits boolean / literal / object / array / optional constructors', () => {
    expect(emitSchemaSource(ir('s.boolean()')).code).toBe('boolean()')
    expect(emitSchemaSource(ir('s.literal("admin")')).code).toBe('literal("admin")')
    const obj = emitSchemaSource(ir('s.object({ x: s.string(), y: s.number() })'))
    expect(obj.code).toBe('object({ x: string(), y: number() })')
    expect(obj.imports).toEqual(new Set(['object', 'string', 'number']))
    expect(emitSchemaSource(ir('s.array(s.number())')).code).toBe('array(number())')
    expect(emitSchemaSource(ir('s.string().optional()')).code).toBe('optional(string())')
  })

  it('regex action lowers to a global new RegExp(...), untouched by prefix', () => {
    const r = emitSchemaSource(ir('s.string().regex(/^[0-9]+$/)'))
    expect(r.code).toBe('string().check(regex(new RegExp("^[0-9]+$", "")))')
    expect(r.imports.has('regex')).toBe(true)
  })

  it('quotes a non-identifier object key', () => {
    expect(emitSchemaSource(ir('s.object({ "a-b": s.string() })')).code).toBe('object({ "a-b": string() })')
  })

  it('aliasPrefix prefixes ctor + action identifiers', () => {
    const r = emitSchemaSource(ir('s.string().email()'), '_pv_')
    expect(r.code).toBe('_pv_string().check(_pv_email())')
    expect(r.imports).toEqual(new Set(['string', 'email']))
  })

  it('throws on an unemittable node (the public isEmittable guard)', () => {
    // The recursive `isEmittable` guard rejects at the entry, so the inner
    // `emitSchemaExpr` `unsupported node` throw is defensively unreachable via
    // the public API (same class as `emitNode`'s unsupported throw).
    expect(() => emitSchemaSource(ir('s.custom()'))).toThrow(/not emittable/)
  })
})
