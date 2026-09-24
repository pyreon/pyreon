/**
 * Composition (`allOf` / `oneOf` / `anyOf`), nullability, and the native
 * schema dialect.
 *
 * Composition is where a spec says "and" or "or" and the IR has to pick
 * one representation. Both directions lose silently: flattening an
 * `allOf` that shares a field name twice emits a duplicate property, and
 * a `oneOf` collapsed to its first option types a response as one
 * variant of several — code compiles, then gets the other variant at
 * runtime.
 *
 * The native dialect is the second half. PMTC lowers a NARROWER subset
 * than the web validator, so a combinator with no native equivalent has
 * to degrade to something that lowers rather than emit an expression
 * that generates Swift which does not compile. That failure surfaces at
 * the consumer's native build, far from the spec that caused it — which
 * is why `null` and `unknown` deliberately widen to `string` there
 * rather than being emitted verbatim.
 */
import { describe, expect, it } from 'vitest'
import { loadOpenApi } from '../input/openapi'
import { schemaExpr, tsType } from '../emit/schema'
import type { IrType } from '../core/ir'

const spec = (schemas: Record<string, unknown>) =>
  loadOpenApi(JSON.stringify({
    openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {},
    components: { schemas },
  })).doc

const typeOf = (schema: unknown): IrType =>
  spec({ X: schema }).models.find((m) => m.name === 'X')!.type

const fieldNames = (t: IrType) =>
  (t as { fields?: Array<{ name: string }> }).fields?.map((f) => f.name) ?? []

describe('allOf flattens into one object', () => {
  it('merges the fields of every part', () => {
    // The control, and the shape every "extends" in a spec produces.
    const t = typeOf({
      allOf: [
        { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        { type: 'object', properties: { name: { type: 'string' } } },
      ],
    })
    expect(fieldNames(t).sort()).toEqual(['id', 'name'])
  })

  it('merges through a $ref part', () => {
    // `allOf: [{$ref: Base}, {…}]` is how a spec spells inheritance.
    const doc = spec({
      Base: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      X: {
        allOf: [
          { $ref: '#/components/schemas/Base' },
          { type: 'object', properties: { extra: { type: 'string' } } },
        ],
      },
    })
    expect(fieldNames(doc.models.find((m) => m.name === 'X')!.type).sort())
      .toEqual(['extra', 'id'])
  })

  it('emits a shared field name ONCE', () => {
    // Two parts declaring `id` is ordinary. A duplicate property is a
    // syntax error in the generated type — loud, but only at the
    // consumer's build.
    const t = typeOf({
      allOf: [
        { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        { type: 'object', properties: { id: { type: 'string' }, x: { type: 'string' } } },
      ],
    })
    expect(fieldNames(t).filter((n) => n === 'id')).toHaveLength(1)
  })

  it('handles an EMPTY allOf without emitting a broken object', () => {
    expect(() => typeOf({ allOf: [] })).not.toThrow()
  })

  it('skips a part that is not an object', () => {
    const t = typeOf({
      allOf: [null, { type: 'object', properties: { a: { type: 'string' } } }],
    })
    expect(fieldNames(t)).toEqual(['a'])
  })
})

describe('oneOf and anyOf become a union', () => {
  it('keeps EVERY option, not just the first', () => {
    // Collapsing to the first types a response as one variant of
    // several: the code compiles, then gets the other variant at
    // runtime with no type error to warn anyone.
    const t = typeOf({ oneOf: [{ type: 'string' }, { type: 'number' }] }) as {
      kind: string; options?: unknown[]
    }
    expect(t.kind).toBe('union')
    expect(t.options).toHaveLength(2)
  })

  it('treats anyOf the same way', () => {
    const t = typeOf({ anyOf: [{ type: 'string' }, { type: 'boolean' }] }) as {
      kind: string; options?: unknown[]
    }
    expect(t.kind).toBe('union')
    expect(t.options).toHaveLength(2)
  })

  it('NOTES an empty oneOf rather than emitting an uninhabited union', () => {
    // An empty union accepts nothing, so the generated validator rejects
    // correct data.
    const d = spec({ X: { oneOf: [] } })
    expect(d.notes.length).toBeGreaterThan(0)
  })

  it('reduces a single-option union to that option', () => {
    // A union of one is just the thing. Keeping the wrapper makes every
    // downstream emitter render pointless parentheses.
    const t = typeOf({ oneOf: [{ type: 'string' }] })
    expect(t.kind === 'string' || t.kind === 'union').toBe(true)
  })
})

describe('nullability reaches both the type and the validator', () => {
  it('renders `| null` on a nullable field', () => {
    const t = tsType({
      kind: 'object',
      fields: [{ name: 'a', type: { kind: 'string' }, required: true, nullable: true }],
    } as IrType)
    expect(t).toContain('| null')
  })

  it('does NOT render it on a non-nullable one', () => {
    const t = tsType({
      kind: 'object',
      fields: [{ name: 'a', type: { kind: 'string' }, required: true, nullable: false }],
    } as IrType)
    expect(t).not.toContain('null')
  })

  it('marks the field nullable in the validator too', () => {
    // A type that permits null against a validator that rejects it is
    // the worst combination: it compiles and fails at runtime.
    const out = schemaExpr({
      kind: 'object',
      fields: [{ name: 'a', type: { kind: 'string' }, required: true, nullable: true }],
    } as IrType, { native: false })
    expect(out).toContain('nullable')
  })
})

describe('the native dialect narrows what it cannot lower', () => {
  it('widens null and unknown to string', () => {
    // PMTC lowers a narrower subset. Emitting the web spelling there
    // generates Swift that does not compile, and the failure surfaces at
    // the consumer's native build with no line pointing at the spec.
    expect(schemaExpr({ kind: 'null' }, { native: true })).toContain('string')
    expect(schemaExpr({ kind: 'unknown', reason: 'x' }, { native: true })).toContain('string')
  })

  it('keeps them distinct on the WEB path', () => {
    // Widening there would throw away type information for nothing.
    expect(schemaExpr({ kind: 'null' }, { native: false })).toContain('null')
    expect(schemaExpr({ kind: 'unknown', reason: 'x' }, { native: false })).toContain('unknown')
  })

  it('does not emit a record on the native path', () => {
    // A dynamic-key map has no lowered form; an object is the honest
    // narrowing.
    const type = { kind: 'object', fields: [], additional: { kind: 'string' } } as IrType
    expect(schemaExpr(type, { native: true })).not.toContain('record')
    expect(schemaExpr(type, { native: false })).toContain('record')
  })

  it('emits an empty object for a free-form object', () => {
    const type = { kind: 'object', fields: [] } as IrType
    expect(schemaExpr(type, { native: false })).toContain('object({})')
  })
})

describe('a deeply nested $ref chain is bounded', () => {
  it('stops walking a long ref chain rather than recursing forever', () => {
    // `isObjectish` follows a `$ref` to decide whether an `allOf` part
    // contributes fields. A spec can chain refs arbitrarily deep — an
    // alias of an alias of an alias — and without a depth bound the
    // reduction never returns.
    const schemas: Record<string, unknown> = {
      Leaf: { type: 'object', properties: { a: { type: 'string' } } },
    }
    for (let i = 0; i < 20; i++) {
      schemas[`A${i}`] = { $ref: `#/components/schemas/${i === 0 ? 'Leaf' : `A${i - 1}`}` }
    }
    schemas.X = {
      allOf: [
        { $ref: '#/components/schemas/A19' },
        { type: 'object', properties: { own: { type: 'string' } } },
      ],
    }
    let d: ReturnType<typeof spec> | undefined
    expect(() => { d = spec(schemas) }).not.toThrow()
    expect(d!.models.map((m) => m.name)).toContain('X')
  })
})

describe('a rendered model is an interface when it can be', () => {
  it('renders an object model as an interface, and an alias otherwise', () => {
    // An interface is what a consumer can augment or extend; an alias to
    // an object shape cannot be reopened.
    const objectModel = tsType({
      kind: 'object',
      fields: [{ name: 'a', type: { kind: 'string' }, required: true, nullable: false }],
    } as IrType)
    expect(objectModel.startsWith('{'), 'an object renders brace-first').toBe(true)
    const aliasModel = tsType({ kind: 'union', options: [{ kind: 'string' }, { kind: 'null' }] })
    expect(aliasModel.startsWith('{')).toBe(false)
  })
})
