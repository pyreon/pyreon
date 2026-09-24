/**
 * `$ref` and `allOf` cycles must TERMINATE.
 *
 * Only `#/components/schemas/*` refs used to become named models; every other
 * pointer was inlined, recursively, with no guard. A recursive `#/$defs/Node`
 * (legal 3.1) or a pointer back into its own property overflowed the stack
 * under V8 -- and under Bun, whose proper tail calls turn the recursion into a
 * loop, it HUNG forever, so `lathe check` in CI hung with it. The guard
 * (`ctx.resolving`) was declared and never read, and the `cyclic-ref` note
 * code was never emitted.
 *
 * Each shape here is also imported through the generated schemas, because a
 * cycle that terminates in the IR can still emit a module that throws at
 * import (a `const` naming itself).
 */
import { afterAll, describe, expect, it } from 'vitest'
import { loadOpenApi } from '../input/openapi'
import { cleanupGenerated, issuesOf, loadGeneratedSchemas } from './helpers/generated-schemas'

const doc = (extra: Record<string, unknown>, schemas: Record<string, unknown>): string =>
  JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {}, ...extra, components: { schemas } })

afterAll(() => cleanupGenerated())

describe('reference-only cycles describe no value', () => {
  it('a pointer back into its own property terminates, as unknown, with a note', () => {
    const src = doc({}, { A: { type: 'object', properties: { self: { $ref: '#/components/schemas/A/properties/self' } } } })
    const { doc: ir } = loadOpenApi(src)
    const a = ir.models.find((m) => m.name === 'A')
    expect(a?.type.kind).toBe('object')
    expect(ir.notes.some((n) => n.code === 'cyclic-ref')).toBe(true)
  })

  it('a two-cycle of plain refs terminates', () => {
    const src = doc({ $defs: { X: { $ref: '#/$defs/Y' }, Y: { $ref: '#/$defs/X' } } }, { A: { $ref: '#/$defs/X' } })
    const { doc: ir } = loadOpenApi(src)
    expect(ir.models.find((m) => m.name === 'A')?.type.kind).toBe('unknown')
    expect(ir.notes.filter((n) => n.code === 'cyclic-ref')).toHaveLength(1)
  })
})

describe('a recursive schema outside components/schemas becomes a model', () => {
  const TREE = doc(
    {
      $defs: {
        Node: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' }, children: { type: 'array', items: { $ref: '#/$defs/Node' } } },
        },
      },
    },
    { Tree: { type: 'object', required: ['root'], properties: { root: { $ref: '#/$defs/Node' } } } },
  )

  it('hoists `#/$defs/Node` into a named model that closes the cycle through a ref', () => {
    const { doc: ir } = loadOpenApi(TREE)
    const node = ir.models.find((m) => m.name === 'Node')
    expect(node?.type.kind).toBe('object')
    const tree = ir.models.find((m) => m.name === 'Tree')
    expect(tree?.type).toMatchObject({ kind: 'object', fields: [{ name: 'root', type: { kind: 'ref', name: 'Node' } }] })
  })

  for (const validator of ['pyreon', 'zod'] as const) {
    it(`${validator}: the generated module imports and validates a nested tree`, async () => {
      const { schemas } = await loadGeneratedSchemas(TREE, validator, 'cycles-tree')
      expect(issuesOf(schemas.Tree, { root: { name: 'a', children: [{ name: 'b', children: [] }] } })).toEqual([])
      expect(issuesOf(schemas.Tree, { root: { name: 'a', children: [{ children: [] }] } }).length).toBeGreaterThan(0)
    }, 60_000)
  }

  it('a synthesized name never collides with a component model', () => {
    const src = doc(
      { $defs: { Node: { type: 'object', properties: { next: { $ref: '#/$defs/Node' } } } } },
      { Node: { type: 'string' }, Uses: { type: 'object', properties: { n: { $ref: '#/$defs/Node' } } } },
    )
    const { doc: ir } = loadOpenApi(src)
    const names = ir.models.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Node2')
    expect(ir.models.find((m) => m.name === 'Node')?.type.kind).toBe('string')
  })
})

describe('allOf cycles', () => {
  it('`A: allOf [A, {…}]` terminates and keeps the own fields', () => {
    const src = doc({}, {
      A: { allOf: [{ $ref: '#/components/schemas/A' }, { type: 'object', properties: { x: { type: 'string' } } }] },
    })
    const { doc: ir } = loadOpenApi(src)
    const a = ir.models.find((m) => m.name === 'A')
    expect(a?.type).toMatchObject({ kind: 'object', fields: [{ name: 'x' }] })
    expect(ir.notes.some((n) => n.code === 'cyclic-ref')).toBe(true)
  })

  it('a mutual allOf cycle A -> B -> A terminates', () => {
    const src = doc({}, {
      A: { allOf: [{ $ref: '#/components/schemas/B' }, { type: 'object', properties: { a: { type: 'string' } } }] },
      B: { allOf: [{ $ref: '#/components/schemas/A' }, { type: 'object', properties: { b: { type: 'string' } } }] },
    })
    const { doc: ir } = loadOpenApi(src)
    expect(ir.models.map((m) => m.name).sort()).toEqual(['A', 'B'])
  })

  it('converts a base model ONCE, so its notes are not duplicated per subtype', () => {
    const src = doc({}, {
      Base: { type: 'object', properties: { weird: { type: 'tuple' } } },
      C1: { allOf: [{ $ref: '#/components/schemas/Base' }] },
      C2: { allOf: [{ $ref: '#/components/schemas/Base' }] },
    })
    const { doc: ir } = loadOpenApi(src)
    expect(ir.notes.filter((n) => n.message.includes('tuple'))).toHaveLength(1)
  })
})

describe('JSON-pointer segments are percent-decoded (RFC 6901 §6)', () => {
  it('resolves `#/components/schemas/a%20b`', () => {
    const src = doc({}, { 'a b': { type: 'string' }, U: { type: 'object', properties: { v: { $ref: '#/components/schemas/a%20b' } } } })
    const { doc: ir } = loadOpenApi(src)
    expect(ir.notes.filter((n) => n.code === 'unsupported-ref')).toEqual([])
    expect(ir.models.find((m) => m.name === 'U')?.type).toMatchObject({ fields: [{ type: { kind: 'ref', name: 'AB' } }] })
  })
})
