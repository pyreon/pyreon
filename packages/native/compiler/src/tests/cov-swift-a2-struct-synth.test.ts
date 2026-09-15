// Branch matrices for the Swift STRUCT-SYNTHESIS layer — the path that turns
// an anonymous object TYPE (a prop's inline shape) or an object LITERAL into
// a named `struct`, plus the field-ordering pass that makes a literal's
// arguments line up with the struct's memberwise init.
//
// It matters because Swift has no structural record: an un-synthesized shape
// degrades to a labelled TUPLE (compiles, is not `Codable`) or to `Any` (every
// member access then fails the REAL-SDK typecheck with zero compiler
// warnings — the documented parse-only/real-SDK asymmetry).
//
// TWO of the specs here are `it.fails` locks on real, swiftc-verified defects
// found writing this file. Both are silent-wrong-output, both Swift-only
// (the Kotlin emit of the same source is correct), and neither is papered
// over here.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' })

describe('anonymous prop shapes synthesize named structs, nested ones included', () => {
  it('a nested object becomes `<Parent><Field>`, an array-of-object singularizes', () => {
    const { code } = swift(`import { Stack, Text } from '@pyreon/primitives'
export function App(props: { profile: { name: string; meta: { tag: string }; friends: { fid: number }[] } }) {
  return (<Stack><Text>{() => \`\${props.profile.meta.tag}\${props.profile.friends.length}\`}</Text></Stack>)
}`)
    expect(code).toContain('struct AppProfile: Codable')
    expect(code).toContain('struct AppProfileMeta: Codable')
    // the array field's element name is SINGULARIZED (`friends` → Friend)
    expect(code).toContain('struct AppProfileFriend: Codable')
    // and the parent's field types name them, never a degraded tuple/Any
    expect(code).toContain('var meta: AppProfileMeta')
    expect(code).toContain('var friends: [AppProfileFriend]')
  })

  it('a prop with NO declName still gets a deterministic `<Component>Data` name', () => {
    // the `!declName` arm of the name synthesizer
    const { code } = swift(`import { Stack, Text } from '@pyreon/primitives'
export function App(props: { rows: { a: number }[] }) {
  return (<Stack><Text>{String(props.rows.length)}</Text></Stack>)
}`)
    expect(code).toContain('struct AppRow: Codable')
  })

  it('a struct name COLLISION between two distinct nested paths gets a counter', () => {
    const { code } = swift(`import { Stack, Text } from '@pyreon/primitives'
export function App(props: { outer: { inner: { c: number }; inners: { c: number }[] } }) {
  return (<Stack><Text>{() => \`\${props.outer.inner.c}\${props.outer.inners.length}\`}</Text></Stack>)
}`)
    // `inner` → AppOuterInner, `inners` singularized → AppOuterInner too, so
    // the second registration takes the appended counter.
    expect(code).toContain('struct AppOuterInner: Codable')
    expect(code).toContain('struct AppOuterInner2: Codable')
  })
})

describe('object-literal field ORDER is rewritten to the struct’s own order', () => {
  it('a literal written out of order emits in the DECLARED order', () => {
    // Swift's memberwise init is POSITIONAL-by-label but rejects a label
    // sequence that does not match the declaration order.
    const { code } = swift(`import { Stack, Text } from '@pyreon/primitives'
type Named = { alpha: string; beta: number }
export function App() {
  const built: Named = { beta: 2, alpha: 'x' }
  return (<Stack><Text>{built.alpha}</Text></Stack>)
}`)
    expect(code).toContain('Named(alpha: "x", beta: 2)')
  })

  it('a SUBSET literal of a struct with optional fields resolves and still orders', () => {
    // The `subsetStructName` rung: every set field exists, every unset one
    // is optional — so the memberwise init can omit, never reorder.
    const { code } = swift(`import { Stack, Text } from '@pyreon/primitives'
type Card = { title: string; subtitle?: string; badge?: number }
export function App() {
  const c: Card = { badge: 3, title: 'hi' }
  return (<Stack><Text>{c.title}</Text></Stack>)
}`)
    expect(code).toContain('Card(title: "hi", badge: 3)')
  })

  // NOTE (unreachable-by-construction): `orderFieldsByStruct`'s three
  // `pos.get(...) === undefined` comparator arms cannot be reached from the
  // public API. Every rung that produces the `structName` it is called with
  // (`expectedStructFor`, the exact field-set index, `subsetStructName`, the
  // literal synthesizer) requires each literal field to exist on the chosen
  // struct, so `pos` is total over the literal. The source says so at the
  // call site ("unreachable via the resolution rungs, kept total anyway").
})

describe('signal annotations recovered from the VALUE emit', () => {
  it('an object / array-of-object initializer annotates with the synthesized name, not `Any`', () => {
    const { code } = swift(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const a = signal({ q: 1, r: 2 })
  const b = signal([{ q: 3, r: 4 }, { q: 5, r: 6 }])
  return (<Stack><Text>{() => \`\${a().q}\${b().length}\`}</Text></Stack>)
}`)
    // `Any` here is a silent broken build under the real SDK
    expect(code).toContain('@State private var a: AppA = AppA(q: 1, r: 2)')
    expect(code).toContain('@State private var b: [AppA] = [AppA(q: 3, r: 4), AppA(q: 5, r: 6)]')
  })

  it('a SPREAD-bearing literal and an EMPTY array have no single name and keep `Any`', () => {
    const { code } = swift(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App(props: { seed: { name: string } }) {
  const d = signal([])
  const e = signal({ ...props.seed, extra: 1 })
  return (<Stack><Text>{() => \`\${d().length}\${e().extra}\`}</Text></Stack>)
}`)
    expect(code).toContain('@State private var d: Any = []')
    expect(code).toContain('@State private var e: Any = (extra: 1)')
  })
})

describe('KNOWN BUGS — Swift-only, swiftc-verified, silent', () => {
  // Both were found writing this file, both produce code that does not
  // compile with ZERO warnings, and the Kotlin emit of the same source is
  // correct — so neither is an inherent limit of the shared-source model.
  it.fails(
    'KNOWN BUG: a MIXED-shape array literal annotates with the FIRST element’s struct — swiftc: "cannot convert value of type \'__Obj0\' to expected element type \'AppC\'". Fix: when the array’s element shapes differ, the annotation must widen (or the literal must be named as untypeable, the way `warnUntypeableObjectLiteral` names its own bail); Kotlin already emits an un-annotated `listOf(...)` here and compiles.',
    () => {
      const { code, warnings } = swift(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const c = signal([{ q: 3, r: 4 }, { z: 1 }])
  return (<Stack><Text>{() => String(c().length)}</Text></Stack>)
}`)
      // Either the annotation admits both elements, or the shape is NAMED.
      const annotatedToFirst = /@State private var c: \[AppC\] = \[AppC\(q: 3, r: 4\), __Obj0\(z: 1\)\]/.test(
        code,
      )
      expect(annotatedToFirst && warnings.length === 0).toBe(false)
    },
  )

  it.fails(
    'KNOWN BUG: two sibling props whose nested objects share a FIELD NAME but not its TYPE collapse onto ONE synthesized struct — swiftc: "value of type \'AppOneMeta\' has no member \'b\'". The nested registration looks a TYPED shape key up in the NAME-ONLY map (`registerNestedSwiftStruct` → `_structFieldsToName.has(structShapeKey(...))`), so the second shape is judged already-synthesized. Fix: consult `_structTypedKeyToName` there, as `resolveSwiftObjectStructName` does. Kotlin emits AppOne/AppTwo correctly.',
    () => {
      const { code } = swift(`import { Stack, Text } from '@pyreon/primitives'
export function App(props: { one: { meta: { a: number } }; two: { meta: { b: string } } }) {
  return (<Stack><Text>{() => \`\${props.one.meta.a}\${props.two.meta.b}\`}</Text></Stack>)
}`)
      expect(code).toContain('struct AppTwoMeta: Codable')
      expect(code).not.toMatch(/let two: AppOne\b/)
    },
  )
})
