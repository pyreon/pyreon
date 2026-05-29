// Direct unit tests for the TS→Swift / TS→Kotlin type-mapper surface.
//
// Per the Phase 0 roadmap (#797) PR 5a — type-mapper coverage is the
// load-bearing piece of Phase 0 success criterion 1 ("≥90% of existing
// Pyreon source compiles to Swift without manual annotations"). These
// tests directly exercise `swiftType()` / `kotlinType()` against every
// TypeIR shape, locking in the per-target output as a contract.
//
// Tests are intentionally unit-level — not fixture-level — because the
// fixture path bundles type-mapping with parsing + emit, hiding
// edge-case failures. Direct unit tests give us per-kind coverage.

import { describe, expect, it } from 'vitest'
import { swiftType } from '../emit-swift'
import { kotlinType } from '../emit-kotlin'
import type { TypeIR } from '../types'

describe('swiftType — primitive types', () => {
  it('number → Int', () => {
    expect(swiftType({ kind: 'number' })).toBe('Int')
  })
  it('string → String', () => {
    expect(swiftType({ kind: 'string' })).toBe('String')
  })
  it('boolean → Bool', () => {
    expect(swiftType({ kind: 'boolean' })).toBe('Bool')
  })
})

describe('swiftType — collection + composite types', () => {
  it('array of number → [Int]', () => {
    expect(swiftType({ kind: 'array', element: { kind: 'number' } })).toBe('[Int]')
  })
  it('nested array of string → [[String]]', () => {
    expect(
      swiftType({
        kind: 'array',
        element: { kind: 'array', element: { kind: 'string' } },
      }),
    ).toBe('[[String]]')
  })
  it('object → tuple-shape', () => {
    expect(
      swiftType({
        kind: 'object',
        fields: [
          { name: 'id', type: { kind: 'number' } },
          { name: 'label', type: { kind: 'string' } },
        ],
      }),
    ).toBe('(id: Int, label: String)')
  })
})

describe('swiftType — nullable + union types', () => {
  it('null on its own → Any?', () => {
    expect(swiftType({ kind: 'null' })).toBe('Any?')
  })
  it('undefined on its own → Any?', () => {
    expect(swiftType({ kind: 'undefined' })).toBe('Any?')
  })
  it('T | null → T?', () => {
    expect(
      swiftType({
        kind: 'union',
        branches: [{ kind: 'string' }, { kind: 'null' }],
      }),
    ).toBe('String?')
  })
  it('T | undefined → T?', () => {
    expect(
      swiftType({
        kind: 'union',
        branches: [{ kind: 'number' }, { kind: 'undefined' }],
      }),
    ).toBe('Int?')
  })
  it('T | null | undefined → T?', () => {
    expect(
      swiftType({
        kind: 'union',
        branches: [{ kind: 'boolean' }, { kind: 'null' }, { kind: 'undefined' }],
      }),
    ).toBe('Bool?')
  })
  it('mixed-type union → Any (Swift has no structural union)', () => {
    expect(
      swiftType({
        kind: 'union',
        branches: [{ kind: 'string' }, { kind: 'number' }],
      }),
    ).toBe('Any')
  })
})

describe('swiftType — typeRef', () => {
  it('zero-arg ref → bare name', () => {
    expect(swiftType({ kind: 'typeRef', name: 'Foo', args: [] })).toBe('Foo')
  })
  it('Array<T> → [T] (Swift idiom)', () => {
    expect(swiftType({ kind: 'typeRef', name: 'Array', args: [{ kind: 'string' }] })).toBe(
      '[String]',
    )
  })
  it('Promise<T> → Task<T, Error>', () => {
    expect(swiftType({ kind: 'typeRef', name: 'Promise', args: [{ kind: 'string' }] })).toBe(
      'Task<String, Error>',
    )
  })
  it('user-defined generic ref → Name<T> verbatim', () => {
    expect(
      swiftType({
        kind: 'typeRef',
        name: 'Maybe',
        args: [{ kind: 'number' }],
      }),
    ).toBe('Maybe<Int>')
  })
})

describe('kotlinType — primitive types', () => {
  it('number → Int', () => {
    expect(kotlinType({ kind: 'number' })).toBe('Int')
  })
  it('string → String', () => {
    expect(kotlinType({ kind: 'string' })).toBe('String')
  })
  it('boolean → Boolean', () => {
    expect(kotlinType({ kind: 'boolean' })).toBe('Boolean')
  })
})

describe('kotlinType — collection types', () => {
  it('array of number → List<Int>', () => {
    expect(kotlinType({ kind: 'array', element: { kind: 'number' } })).toBe('List<Int>')
  })
  it('nested array of string → List<List<String>>', () => {
    expect(
      kotlinType({
        kind: 'array',
        element: { kind: 'array', element: { kind: 'string' } },
      }),
    ).toBe('List<List<String>>')
  })
})

describe('kotlinType — nullable + union types', () => {
  it('null on its own → Any?', () => {
    expect(kotlinType({ kind: 'null' })).toBe('Any?')
  })
  it('T | null → T?', () => {
    expect(kotlinType({ kind: 'union', branches: [{ kind: 'string' }, { kind: 'null' }] })).toBe(
      'String?',
    )
  })
  it('T | undefined → T?', () => {
    expect(
      kotlinType({
        kind: 'union',
        branches: [{ kind: 'number' }, { kind: 'undefined' }],
      }),
    ).toBe('Int?')
  })
  it('mixed-type union → Any', () => {
    expect(
      kotlinType({
        kind: 'union',
        branches: [{ kind: 'string' }, { kind: 'number' }],
      }),
    ).toBe('Any')
  })
})

describe('kotlinType — typeRef', () => {
  it('zero-arg ref → bare name', () => {
    expect(kotlinType({ kind: 'typeRef', name: 'Foo', args: [] })).toBe('Foo')
  })
  it('Array<T> → List<T> (Kotlin idiom)', () => {
    expect(kotlinType({ kind: 'typeRef', name: 'Array', args: [{ kind: 'string' }] })).toBe(
      'List<String>',
    )
  })
  it('Promise<T> → Deferred<T>', () => {
    expect(kotlinType({ kind: 'typeRef', name: 'Promise', args: [{ kind: 'string' }] })).toBe(
      'Deferred<String>',
    )
  })
  it('user-defined generic ref → Name<T> verbatim', () => {
    expect(
      kotlinType({
        kind: 'typeRef',
        name: 'Maybe',
        args: [{ kind: 'number' }],
      }),
    ).toBe('Maybe<Int>')
  })
})

describe('swiftType — function types (roadmap PR 5b)', () => {
  it('zero-arg → Void: () -> Void', () => {
    expect(swiftType({ kind: 'function', params: [], returnType: { kind: 'unknown' } })).toBe(
      '() -> Void',
    )
  })
  it('one-arg number → Bool', () => {
    expect(
      swiftType({
        kind: 'function',
        params: [{ name: 'x', type: { kind: 'number' } }],
        returnType: { kind: 'boolean' },
      }),
    ).toBe('(Int) -> Bool')
  })
  it('two-arg → String', () => {
    expect(
      swiftType({
        kind: 'function',
        params: [
          { name: 'a', type: { kind: 'number' } },
          { name: 'b', type: { kind: 'string' } },
        ],
        returnType: { kind: 'string' },
      }),
    ).toBe('(Int, String) -> String')
  })
  it('nullable-T arg', () => {
    expect(
      swiftType({
        kind: 'function',
        params: [
          {
            name: 'x',
            type: { kind: 'union', branches: [{ kind: 'string' }, { kind: 'null' }] },
          },
        ],
        returnType: { kind: 'unknown' },
      }),
    ).toBe('(String?) -> Void')
  })
})

describe('kotlinType — function types (roadmap PR 5b)', () => {
  it('zero-arg → Unit: () -> Unit', () => {
    expect(kotlinType({ kind: 'function', params: [], returnType: { kind: 'unknown' } })).toBe(
      '() -> Unit',
    )
  })
  it('one-arg number → Boolean', () => {
    expect(
      kotlinType({
        kind: 'function',
        params: [{ name: 'x', type: { kind: 'number' } }],
        returnType: { kind: 'boolean' },
      }),
    ).toBe('(Int) -> Boolean')
  })
  it('two-arg → String', () => {
    expect(
      kotlinType({
        kind: 'function',
        params: [
          { name: 'a', type: { kind: 'number' } },
          { name: 'b', type: { kind: 'string' } },
        ],
        returnType: { kind: 'string' },
      }),
    ).toBe('(Int, String) -> String')
  })
})

describe('parseTypeAnnotation → function-type round-trip', () => {
  it('parses TSFunctionType (no params, void return)', () => {
    const t = parseSignalType('() => void')
    expect(t).toEqual({
      kind: 'function',
      params: [],
      returnType: { kind: 'unknown' },
    })
  })
  it('parses TSFunctionType (one param, boolean return)', () => {
    const t = parseSignalType('(x: number) => boolean')
    expect(t).toEqual({
      kind: 'function',
      params: [{ name: 'x', type: { kind: 'number' } }],
      returnType: { kind: 'boolean' },
    })
  })
  it('parses TSFunctionType (two params, string return)', () => {
    const t = parseSignalType('(a: number, b: string) => string')
    expect(t).toEqual({
      kind: 'function',
      params: [
        { name: 'a', type: { kind: 'number' } },
        { name: 'b', type: { kind: 'string' } },
      ],
      returnType: { kind: 'string' },
    })
  })
})

describe('type mapper — unknown / void / never degrade to Any', () => {
  it('unknown → Any (Swift)', () => {
    expect(swiftType({ kind: 'unknown' })).toBe('Any')
  })
  it('unknown → Any (Kotlin)', () => {
    expect(kotlinType({ kind: 'unknown' })).toBe('Any')
  })
})

// ─── Parse → type-mapper round-trip ──────────────────────────────────
// One additional layer: confirm `parseTypeAnnotation` from parse.ts
// produces the right TypeIR for each TS shape, which the unit tests
// above then map to the right per-target string.

import { parsePyreon } from '../parse'

// Helper: parse a Pyreon snippet with a single signal declaration and
// return the parsed TypeIR. Lets us exercise the type-annotation
// parser via real TS syntax instead of hand-building IR.
function parseSignalType(typeAnnotation: string): TypeIR {
  const source = `import { signal } from '@pyreon/reactivity'
export function Comp() {
  const x = signal<${typeAnnotation}>(null as any)
  return null
}
`
  const result = parsePyreon(source)
  const comp = result.components[0]
  if (!comp) throw new Error('parser produced no component')
  const decl = comp.decls.find((d) => d.kind === 'signal')
  if (!decl) throw new Error('parser produced no signal decl')
  return decl.type
}

describe('parseTypeAnnotation → TypeIR round-trip', () => {
  it('parses TSNullKeyword', () => {
    expect(parseSignalType('null')).toEqual({ kind: 'null' })
  })
  it('parses TSUndefinedKeyword', () => {
    expect(parseSignalType('undefined')).toEqual({ kind: 'undefined' })
  })
  it('parses TSUnionType (T | null)', () => {
    expect(parseSignalType('string | null')).toEqual({
      kind: 'union',
      branches: [{ kind: 'string' }, { kind: 'null' }],
    })
  })
  it('parses TSUnionType (T | undefined)', () => {
    expect(parseSignalType('number | undefined')).toEqual({
      kind: 'union',
      branches: [{ kind: 'number' }, { kind: 'undefined' }],
    })
  })
  it('parses TSTypeReference (named type)', () => {
    expect(parseSignalType('Foo')).toEqual({
      kind: 'typeRef',
      name: 'Foo',
      args: [],
    })
  })
  it('parses TSTypeReference (generic)', () => {
    expect(parseSignalType('Promise<string>')).toEqual({
      kind: 'typeRef',
      name: 'Promise',
      args: [{ kind: 'string' }],
    })
  })
  it('parses TSAnyKeyword → unknown', () => {
    expect(parseSignalType('any')).toEqual({ kind: 'unknown' })
  })
  it('parses TSLiteralType (string literal) → string', () => {
    expect(parseSignalType("'red'")).toEqual({ kind: 'string' })
  })
  it('parses string-literal union → string', () => {
    // `'red' | 'green' | 'blue'` collapses to `string | string | string`
    // = effectively the base type — the parser flattens, and the
    // mapper degrades since Swift/Kotlin can't model the string-literal
    // set without an explicit enum (Phase 1+).
    const result = parseSignalType("'red' | 'green' | 'blue'")
    expect(result.kind).toBe('union')
    if (result.kind !== 'union') throw new Error()
    expect(result.branches.every((b) => b.kind === 'string')).toBe(true)
  })
})
