// One response shape, ONE nominal type — through every place it is named.
//
// A generated data component names its response twice: the render-callback
// parameter (`children: (data: T | undefined) => unknown`) and the query
// generic (`useQuery<T>`). Both are the same anonymous object type, and the
// emitters name an anonymous type by where it appears. Two sites, two names,
// and the first place the values meet is a compile error on BOTH targets:
//
//   Swift:  cannot convert value of type 'GetItemDataChildrenDataData?' to
//           expected argument type 'GetItemDataChildrenData?'
//   Kotlin: argument type mismatch: actual type is 'GetItemDataData?', but
//           'GetItemDataChildrenData?' was expected.
//
// (pyreon/pyreon#3784 — `{ data: { id } }`, the most ordinary envelope there is.)
//
// The two targets failed for two different reasons from one source line:
//   - Kotlin synthesized a class for the query generic WITHOUT asking whether
//     the file already named that shape (Swift did ask).
//   - Both keyed the lifted prop struct by its FIELD TYPES — `ref:Name` for the
//     lifted inner object — while the annotation site keyed the same shape as
//     `obj{…}`, so the lookup missed. On Swift a miss on a ONE-field object fell
//     through to a legacy branch that "degrades" `{ data: T }` to bare `T`,
//     which is why the single-field envelope picked the INNER struct.
//
// The class is "the same shape keyed two ways", so the matrix varies depth and
// field NAMES (data/items/children/result/error/id), arrays, optionals, a shape
// at two depths and equal sibling shapes.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SHAPES: Record<string, string> = {
  d1: '{ data: { id: string } }',
  d2: '{ data: { data: { id: string } } }',
  d3: '{ data: { data: { data: { id: string } } } }',
  d4: '{ data: { data: { data: { data: { id: string } } } } }',
  items1: '{ items: { id: string }[] }',
  items2: '{ items: { id: string; tags: { name: string }[] }[] }',
  child1: '{ children: { id: string } }',
  child2: '{ children: { children: { id: string } } }',
  result1: '{ result: { id: string } }',
  error1: '{ error: { message: string } }',
  id1: '{ id: string }',
  opt1: '{ data?: { id: string } }',
  opt2: '{ data: { id: string; meta?: { n: number } } }',
  twoDepth: '{ a: { id: string }; b: { c: { id: string } } }',
  sibEq: '{ a: { id: string }; b: { id: string } }',
  sibEqNested: '{ x: { p: { id: string } }; y: { p: { id: string } } }',
  mixed: '{ data: { id: string; n: number; ok: boolean; items: { id: string }[] }; total: number }',
  itemData: '{ item: { data: { id: string } } }',
}

const source = (type: string): string => `import { createHttp } from '@pyreon/http'
import { standardSchema } from '@pyreon/http/schema'
import { useQuery } from '@pyreon/query'
import { z } from 'zod'
const api = createHttp({ baseUrl: 'https://example.test/api', schema: standardSchema })
export const ep = api.endpoint('GET /p', { response: z.object({ id: z.string() }) })
export function GetItemData(props: { children: (data: ${type} | undefined) => unknown }) {
  const q = useQuery<${type}>(() => ep.query())
  return () => props.children(q.data())
}
`

/** The type NAME the callback parameter and the query generic each resolve to. */
function namesOf(code: string, target: 'swift' | 'kotlin'): { callback: string; query: string } {
  const callback =
    target === 'swift'
      ? /let children: \(([\w]+)\??\) ->/.exec(code)?.[1]
      : /children: @Composable \(([\w]+)\??\) -> Unit/.exec(code)?.[1]
  const query = /PyreonQuery<([\w]+)>/.exec(code)?.[1]
  return { callback: callback ?? '(none)', query: query ?? '(none)' }
}

describe('a response shape has one name through callback, query and decode', () => {
  for (const [label, type] of Object.entries(SHAPES)) {
    for (const target of ['swift', 'kotlin'] as const) {
      it(`${target}: ${label} — ${type}`, () => {
        const { code } = transform(source(type), { target })
        const { callback, query } = namesOf(code, target)
        expect(callback).not.toBe('(none)')
        expect(query).toBe(callback)
        // The decode names the SAME type as the container it fills.
        expect(code).toContain(target === 'swift' ? `decode(${query}.self` : `decodeFromString<${query}>`)
        // …and nothing else declares a second type for the same envelope.
        const declared = (code.match(target === 'swift' ? /^struct (\w+)/gm : /^data class (\w+)/gm) ?? []).length
        const unique = new Set(code.match(target === 'swift' ? /^struct (\w+)/gm : /^data class (\w+)/gm)).size
        expect(declared).toBe(unique)
      })
    }
  }

  // Same shape at TWO places must not mint two classes. (`sibEq` is the sharpest
  // case: `a` and `b` are equal objects; one declaration serves both.)
  it('equal sibling shapes share one declaration on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code } = transform(source(SHAPES.sibEq!), { target })
      const decls = code.match(target === 'swift' ? /^struct \w+: Codable \{\n  var id: String/gm : /^data class \w+\((?:var|val) id: String\)/gm)
      expect(decls?.length).toBe(1)
    }
  })
})

describe('the minimal envelope compiles on the real toolchains', () => {
  const REAL = ['d1', 'd2', 'items2', 'child1', 'sibEqNested', 'itemData'] as const
  for (const label of REAL) {
    describe.skipIf(!isSwiftcAvailable())(`swiftc ${label}`, () => {
      it('type-checks', () => {
        const r = validateSwiftWithStubs(transform(source(SHAPES[label]!), { target: 'swift' }).code)
        expect(r.ok, r.error ?? '').toBe(true)
      })
    })
    describe.skipIf(!isKotlincAvailable())(`kotlinc ${label}`, () => {
      it('compiles', () => {
        const r = validateKotlin(transform(source(SHAPES[label]!), { target: 'kotlin' }).code)
        expect(r.ok, r.error ?? '').toBe(true)
      })
    })
  }
})
