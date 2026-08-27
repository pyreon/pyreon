import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { subsetStructName } from '../expr-utils'
import type { TypeIR } from '../types'

/**
 * A literal that OMITS an optional field must still construct the DECLARED
 * struct, not a freshly synthesized one.
 *
 * Both emitters index declared structs by their exact sorted field-name set, so
 * `type T = { a: string; b?: string }` with `{ a: 'x' }` missed the index and
 * fell through to synthesis. That is ordinary TypeScript — a type with an
 * optional field, and a literal that simply does not set it — and the two
 * targets then broke differently, the usual pattern for this whole family:
 *
 *   Swift   `@State private var v: T = __Obj0(a: "x")` — the declaration writes
 *           the type out, so swiftc rejects it. Loud.
 *   Kotlin  `var v by remember { mutableStateOf(__Obj0(a = "x")) }` — nothing
 *           writes `T`, so Kotlin infers `__Obj0` and it COMPILES. The value's
 *           real type is not the one the annotation claims, so `encode`
 *           serializes the wrong shape and any site expecting `T` fails
 *           somewhere else entirely. Silent.
 *
 * Found chasing a ProseMirror document tree — a recursive type whose leaf node
 * (`{ type, text }`) has a different shape from its branch (`{ type, content }`),
 * so every level hits this.
 */
const P = '@pyreon/primitives'
const R = '@pyreon/reactivity'

const declLine = (pre: string, init: string, target: 'swift' | 'kotlin'): string =>
  transform(
    `import { signal } from '${R}'
     import { Stack, Text } from '${P}'
     ${pre}
     export function C() {
       const v = ${init}
       return <Stack><Text>{v().a}</Text></Stack>
     }`,
    { target },
  )
    .code.split('\n')
    .find((l) => l.includes('var v')) ?? ''

const T_OPT = `type T = { a: string; b?: string }`

describe('a literal omitting an optional field constructs the DECLARED struct', () => {
  it.each(['swift', 'kotlin'] as const)('%s: omitted optional still builds T', (target) => {
    const line = declLine(T_OPT, `signal<T>({ a: 'x' })`, target)
    expect(line).toContain('T(a')
    expect(line, 'must not fall through to a synthesized struct').not.toContain('__Obj')
  })

  it.each(['swift', 'kotlin'] as const)('%s: the exact-match path is unchanged', (target) => {
    const line = declLine(T_OPT, `signal<T>({ a: 'x', b: 'y' })`, target)
    expect(line).toContain('T(a')
    expect(line).not.toContain('__Obj')
  })

  it('a RECURSIVE annotated type now compiles — the shape that surfaced this', () => {
    // A ProseMirror document: the branch node carries `content`, the leaf
    // carries `text`, and both are the same declared type with optionals.
    const src = `import { signal } from '${R}'
      import { Stack, WebView } from '${P}'
      type PMNode = { type: string; content?: PMNode[]; text?: string }
      export function C() {
        const doc = signal<PMNode>({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] })
        return <Stack><WebView html="<p/>" data={{ content: doc() }} /></Stack>
      }`
    for (const target of ['swift', 'kotlin'] as const) {
      const code = transform(src, { target }).code
      expect(code, `${target} must build PMNode at every level`).not.toContain('__Obj')
      expect(code).toContain('PMNode(type')
    }
  })

  // The matcher's own rules, unit-tested. Driving these through a full emit
  // does not reach it — an un-annotated binding gets a struct named for the
  // component and the binding (`CV`) from an earlier path, so an emit-level
  // assertion here would be testing something else and passing for the wrong
  // reason. It did, on the first draft.
  describe('subsetStructName', () => {
    const OPT = { kind: 'union', branches: [{ kind: 'string' }, { kind: 'undefined' }] } as TypeIR
    const REQ = { kind: 'string' } as TypeIR
    const isOptional = (t: TypeIR): boolean =>
      t.kind === 'union' && t.branches.some((b) => b.kind === 'undefined' || b.kind === 'null')

    it('matches when every omitted field is optional', () => {
      const structs = [{ name: 'T', fields: [{ name: 'a', type: REQ }, { name: 'b', type: OPT }] }]
      expect(subsetStructName(['a'], structs, isOptional)).toBe('T')
    })

    it('does NOT match when an omitted field is required', () => {
      const structs = [{ name: 'T', fields: [{ name: 'a', type: REQ }, { name: 'b', type: REQ }] }]
      expect(subsetStructName(['a'], structs, isOptional)).toBeNull()
    })

    it('does NOT match when the literal sets a field the struct lacks', () => {
      const structs = [{ name: 'T', fields: [{ name: 'a', type: REQ }, { name: 'b', type: OPT }] }]
      expect(subsetStructName(['a', 'nope'], structs, isOptional)).toBeNull()
    })

    it('BAILS on ambiguity rather than picking one', () => {
      // There is no type context at the literal to choose between them, so
      // picking either would be a silent mis-construction — the same rule the
      // exact field-set index uses for a collision.
      const structs = [
        { name: 'A', fields: [{ name: 'a', type: REQ }, { name: 'z', type: OPT }] },
        { name: 'B', fields: [{ name: 'a', type: REQ }, { name: 'y', type: OPT }] },
      ]
      expect(subsetStructName(['a'], structs, isOptional)).toBeNull()
    })
  })

  it('a literal with a field the struct does NOT have never matches it', () => {
    const line = declLine(T_OPT, `signal({ a: 'x', nope: 'y' })`, 'swift')
    expect(line).not.toContain('T(a')
  })
})
