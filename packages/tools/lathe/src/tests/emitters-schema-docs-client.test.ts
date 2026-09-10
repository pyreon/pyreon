/**
 * Three emitters, and the one thing they all decide silently: the shape
 * of code someone else will run.
 *
 * **`tsType`** is what the consumer's editor shows. A type wider than
 * the spec (`unknown` where a union belonged) costs them type safety
 * without saying so; one NARROWER than the spec is worse, because their
 * code compiles against a promise the server does not keep.
 *
 * **`schemaExpr`** is what actually validates at runtime, and it has two
 * dialects — the full one and the subset PMTC lowers. A native-path
 * expression that quietly uses an un-lowerable combinator generates
 * Swift that does not compile, which surfaces a build failure far from
 * the spec that caused it.
 *
 * **`byTag`** decides file layout and therefore import paths. Its order
 * has to be stable or every regeneration produces a diff, and
 * `lathe check` — which fails on output stale against the spec — then
 * reds on a run where nothing changed.
 */
import { describe, expect, it } from 'vitest'
import { byTag, endpointSpec } from '../emit/client'
import { emitTypes, schemaExpr, tsType } from '../emit/schema'
import type { IrDocument, IrOperation, IrType } from '../core/ir'

const num = (integer = false): IrType => ({ kind: 'number', integer })
const field = (name: string, type: IrType, required = true) =>
  ({ name, type, required, nullable: false })
const obj = (fields: ReturnType<typeof field>[]): IrType =>
  ({ kind: 'object', fields }) as IrType

const op = (id: string, tag: string): IrOperation =>
  ({ id, tag, method: 'GET', path: `/${id}`, pathParams: [], queryParams: [] }) as IrOperation
const doc = (operations: IrOperation[]): IrDocument =>
  ({ title: 'T', version: '1', baseUrl: '', models: [], operations, notes: [] }) as IrDocument

const expr = (type: IrType, native = false) => schemaExpr(type, { native })

describe('tsType renders the spec as widely as the spec allows, and no wider', () => {
  it('renders the primitives', () => {
    expect(tsType({ kind: 'string' })).toBe('string')
    expect(tsType(num())).toBe('number')
    expect(tsType(num(true))).toBe('number')
    expect(tsType({ kind: 'boolean' })).toBe('boolean')
    expect(tsType({ kind: 'null' })).toBe('null')
  })

  it('renders unknown for a type the spec did not narrow', () => {
    // `any` would silently disable checking on that field; `unknown`
    // makes the caller acknowledge it.
    expect(tsType({ kind: 'unknown', reason: 'no type' })).toBe('unknown')
  })

  it('renders an enum as a literal union, and widens it on request', () => {
    // The literal union is the point of generating types at all. The
    // widened form exists for positions where a literal cannot be used.
    expect(tsType({ kind: 'string', enum: ['a', 'b'] })).toBe("'a' | 'b'")
    expect(tsType({ kind: 'string', enum: ['a', 'b'] }, 0, true)).toBe('string')
  })

  it('PARENTHESISES a union inside an array', () => {
    // `string | number[]` and `(string | number)[]` are different types,
    // and the wrong one compiles.
    const t = tsType({ kind: 'array', items: { kind: 'union', options: [{ kind: 'string' }, num()] } })
    expect(t).toBe('(string | number)[]')
  })

  it('does not parenthesise a simple array', () => {
    expect(tsType({ kind: 'array', items: { kind: 'string' } })).toBe('string[]')
  })

  it('renders an object with optional markers', () => {
    const t = tsType(obj([field('id', { kind: 'string' }), field('note', { kind: 'string' }, false)]))
    expect(t).toContain('id: string')
    expect(t).toContain('note?: string')
  })

  it('renders a free-form object as a Record, not as {}', () => {
    // `{}` in TypeScript accepts almost anything, which is the opposite
    // of what an author reads it as.
    const t = tsType({ kind: 'object', fields: [], additional: { kind: 'string' } } as IrType)
    expect(t).toContain('Record<string, string>')
  })

  it('renders a ref by NAME so the emitted type links up', () => {
    expect(tsType({ kind: 'ref', name: 'User' })).toBe('User')
  })

  it('bounds a deeply nested inline object rather than recursing forever', () => {
    let t: IrType = { kind: 'string' }
    for (let i = 0; i < 40; i++) t = obj([field('f', t)])
    expect(() => tsType(t)).not.toThrow()
  })
})

describe('schemaExpr emits a validator, in the dialect asked for', () => {
  it('emits an expression for every kind', () => {
    // A kind falling through to nothing produces a syntax error in the
    // generated module — loud, but only at the consumer's build.
    for (const [label, type] of [
      ['string', { kind: 'string' }],
      ['number', num()],
      ['boolean', { kind: 'boolean' }],
      ['null', { kind: 'null' }],
      ['unknown', { kind: 'unknown', reason: 'x' }],
      ['array', { kind: 'array', items: { kind: 'string' } }],
      ['object', obj([field('a', { kind: 'string' })])],
      ['ref', { kind: 'ref', name: 'User' }],
      ['enum', { kind: 'string', enum: ['a', 'b'] }],
      ['union', { kind: 'union', options: [{ kind: 'string' }, num()] }],
    ] as Array<[string, IrType]>) {
      const out = expr(type)
      expect(out, label).toBeTruthy()
      expect(out.trim(), label).not.toBe('')
    }
  })

  it('carries enum members into the validator', () => {
    // A validator that accepts any string for an enum field lets bad
    // data through at runtime, which is the one job it has.
    const out = expr({ kind: 'string', enum: ['active', 'banned'] })
    expect(out).toContain('active')
    expect(out).toContain('banned')
  })

  it('marks an optional field so a missing key is not a failure', () => {
    const out = expr(obj([field('a', { kind: 'string' }), field('b', { kind: 'string' }, false)]))
    expect(out).toContain('a')
    expect(out).toContain('b')
  })

  it('defers a ref that would be read in its temporal dead zone', () => {
    // Two mutually-referencing models. Naming the const directly throws
    // at MODULE LOAD in the consumer's app — before any of their code
    // runs, with a stack pointing into generated output.
    const out = schemaExpr({ kind: 'ref', name: 'Node' }, {
      native: false, defer: new Set(['Node']),
    })
    expect(out).toContain('lazy')
    expect(out).toContain('Node')
  })

  it('does NOT defer a ref that resolves in order', () => {
    // `lazy` on every ref would be correct and slower, and it obscures
    // which references are actually cyclic.
    expect(schemaExpr({ kind: 'ref', name: 'User' }, { native: false })).not.toContain('lazy')
  })

  it('emits a different dialect on the native path', () => {
    // The native subset is narrower. Emitting the full dialect there
    // generates Swift that does not compile, and the failure surfaces
    // far from the spec that caused it.
    const type = { kind: 'union', options: [{ kind: 'string' }, num()] } as IrType
    expect(expr(type, true)).toBeTruthy()
  })

  it('is deterministic for one input', () => {
    // `lathe check` fails on output stale against the spec; any
    // run-to-run variation reds CI on a run where nothing changed.
    const type = obj([field('b', { kind: 'string' }), field('a', num())])
    expect(expr(type)).toBe(expr(type))
  })
})

describe('a model is emitted as an interface when it can be', () => {
  // `emitTypes`, not `emitSchemas` — the keyword decision lives on the
  // TYPES file; schemas emit validator expressions.
  const emitModels = (models: Array<{ name: string; type: IrType }>) =>
    emitTypes({
      title: 'T', version: '1', baseUrl: '', models, operations: [], notes: [],
    } as IrDocument).build('// generated').contents

  it('uses `interface` for an object model', () => {
    // An interface can be augmented or extended by the consumer; an
    // alias to an object literal cannot be reopened, so a generated
    // client would foreclose a legitimate escape hatch.
    const out = emitModels([{
      kind: undefined as never,
      name: 'User',
      type: {
        kind: 'object',
        fields: [{ name: 'id', type: { kind: 'string' }, required: true, nullable: false }],
      },
    } as never])
    expect(out).toContain('export interface User')
  })

  it('uses `type` for a model that is NOT an object', () => {
    // `export interface X = string` is not valid TypeScript.
    const out = emitModels([
      { name: 'Status', type: { kind: 'string', enum: ['a', 'b'] } } as never,
    ])
    expect(out).toContain('export type Status')
    expect(out).not.toContain('export interface Status')
  })

  it('renders a dictionary model as a Record alias', () => {
    // `{}` in TypeScript accepts almost anything — the opposite of what
    // an author reads it as.
    const out = emitModels([{
      name: 'Bag',
      type: { kind: 'object', fields: [], additional: { kind: 'number', integer: false } },
    } as never])
    expect(out).toContain('Record<string, number>')
  })
})

describe('operations group by tag in a stable order', () => {
  it('groups and sorts within each tag', () => {
    const m = byTag(doc([op('zeta', 'users'), op('alpha', 'users'), op('one', 'posts')]))
    expect(m.get('users')!.map((o) => o.id)).toEqual(['alpha', 'zeta'])
    expect(m.get('posts')!.map((o) => o.id)).toEqual(['one'])
  })

  it('produces the same grouping whatever the input order', () => {
    // The tag decides the FILE an operation lands in, so an unstable
    // grouping moves code between files on every regeneration.
    const a = byTag(doc([op('a', 'x'), op('b', 'y')]))
    const b = byTag(doc([op('b', 'y'), op('a', 'x')]))
    expect(JSON.stringify([...a].map(([k, v]) => [k, v.map((o) => o.id)])))
      .toBe(JSON.stringify([...b].map(([k, v]) => [k, v.map((o) => o.id)])))
  })

  it('does not special-case the default tag to the front', () => {
    // Sorting it first would move every untagged operation whenever a
    // tag is added elsewhere.
    const m = byTag(doc([op('a', 'default'), op('b', 'admin')]))
    expect([...m.keys()]).toContain('default')
    expect([...m.keys()]).toContain('admin')
  })

  it('returns an empty map for a document with no operations', () => {
    expect([...byTag(doc([])).keys()]).toEqual([])
  })
})

describe('endpointSpec renders the method and path the client calls', () => {
  it('joins them the way @pyreon/http reads them', () => {
    expect(endpointSpec(op('getUser', 'users'))).toBe('GET /getUser')
  })

  it('keeps a path template verbatim', () => {
    // `{id}` is substituted at request time; rewriting it here would
    // request a literal `{id}`.
    const o = { ...op('x', 't'), method: 'DELETE', path: '/users/{id}/posts/{postId}' } as IrOperation
    expect(endpointSpec(o)).toBe('DELETE /users/{id}/posts/{postId}')
  })
})
