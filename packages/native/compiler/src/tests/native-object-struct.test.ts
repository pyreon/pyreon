// Anonymous object-literal → synthesized struct/data-class (subset widening).
//
// An object literal matching no DECLARED struct used to degrade to a labelled
// tuple — and a single-field labelled tuple `(id: 1)` is illegal Swift, while
// tuple key-paths break `ForEach(items, id: \.id)` and Codable/Saver bridges.
// Now an ALL-SCALAR-LITERAL object literal synthesizes a module-scope struct
// (Swift `Codable`) / data class (Kotlin), deduped by field name:type SHAPE:
//
//   { id: 1, name: 'a' }  -> __Obj0(id: 1, name: "a")   + struct/data class __Obj0
//
// Cross-target deterministic — the shared `synthLiteralStructName` helper +
// identical source traversal mean `__Obj0`/`__Obj1`/… line up across Swift and
// Kotlin. NON-literal or nested-object fields keep the tuple emit (unchanged).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (decls: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const count = signal(0)
${decls}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('anonymous object-literal → synthesized struct', () => {
  it('Swift: a literal object synthesizes a Codable struct + struct-init', () => {
    const out = transform(app(`  const a = { id: 1, name: 'x' }`), { target: 'swift' }).code
    expect(out).toContain('struct __Obj0: Codable {')
    expect(out).toContain('var id: Int')
    expect(out).toContain('var name: String')
    expect(out).toContain('let a = __Obj0(id: 1, name: "x")')
    // NOT the broken labelled tuple
    expect(out).not.toContain('let a = (id: 1, name: "x")')
  })

  it('Kotlin: a literal object synthesizes a data class + constructor call', () => {
    const out = transform(app(`  const a = { id: 1, name: 'x' }`), { target: 'kotlin' }).code
    expect(out).toContain('data class __Obj0(var id: Int, var name: String)')
    expect(out).toContain('val a = __Obj0(id = 1, name = "x")')
    expect(out).not.toContain('val a = (id = 1, name = "x")')
  })

  it('a single-field literal object becomes a struct (was an illegal Swift tuple)', () => {
    const sw = transform(app(`  const c = { count: 5 }`), { target: 'swift' }).code
    expect(sw).toContain('struct __Obj0: Codable {')
    expect(sw).toContain('let c = __Obj0(count: 5)')
    expect(sw).not.toContain('let c = (count: 5)')
  })

  it('same-shape literals SHARE one synthesized struct (dedup)', () => {
    const sw = transform(
      app(`  const a = { id: 1, name: 'x' }
  const b = { id: 2, name: 'y' }`),
      { target: 'swift' },
    ).code
    // exactly one __Obj0 struct, both literals use it
    expect(sw.match(/struct __Obj\d+: Codable/g)?.length).toBe(1)
    expect(sw).toContain('let a = __Obj0(')
    expect(sw).toContain('let b = __Obj0(')
  })

  it('same field-NAMES but different scalar TYPES get distinct structs', () => {
    const sw = transform(
      app(`  const a = { id: 1, name: 'x' }
  const d = { id: 'str', name: 'z' }`),
      { target: 'swift' },
    ).code
    // id:Int,name:String  vs  id:String,name:String → two structs
    expect(sw.match(/struct __Obj\d+: Codable/g)?.length).toBe(2)
    expect(sw).toContain('let a = __Obj0(')
    expect(sw).toContain('let d = __Obj1(')
  })

  it('cross-target synthesized names line up (Swift __Obj0 == Kotlin __Obj0)', () => {
    const decls = `  const a = { id: 1, name: 'x' }
  const c = { count: 5 }`
    const sw = transform(app(decls), { target: 'swift' }).code
    const kt = transform(app(decls), { target: 'kotlin' }).code
    expect(sw).toContain('let a = __Obj0(')
    expect(sw).toContain('let c = __Obj1(')
    expect(kt).toContain('val a = __Obj0(')
    expect(kt).toContain('val c = __Obj1(')
  })

  it('a non-literal SCALAR field now synthesizes a struct (inferred field type)', () => {
    // Widened: `count()` is a non-literal whose type INFERS to a scalar
    // (number) → a struct is synthesized (was: kept as an Any-tuple). See
    // native-objlit-nonliteral-fields.test.ts for the full both-target +
    // kotlinc-typecheck coverage.
    const sw = transform(app(`  const x = { id: count() }`), { target: 'swift' }).code
    expect(sw).toContain('__Obj0(id: count)')
  })

  it('a non-SCALAR-inferred field still keeps the tuple emit (no over-reach)', () => {
    // An array-typed field can't be distinguished on the lossy shapeKey, so
    // it bails to the tuple — only scalar-inferred fields synthesize.
    const sw = transform(
      `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const arr = signal<number[]>([1, 2])
  const x = { tags: arr() }
  return (<Stack><Text>x</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    expect(sw).not.toContain('__Obj')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: synthesized structs typecheck via swiftc', () => {
    const out = transform(
      app(`  const a = { id: 1, name: 'x' }
  const c = { count: 5 }
  const d = { id: 'str', name: 'z' }`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: synthesized data classes typecheck via kotlinc', () => {
    const out = transform(
      app(`  const a = { id: 1, name: 'x' }
  const c = { count: 5 }
  const d = { id: 'str', name: 'z' }`),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
