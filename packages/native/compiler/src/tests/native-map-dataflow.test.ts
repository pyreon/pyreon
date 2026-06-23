// `.map(cb)` element-type dataflow (type-inference widening).
//
// `inferType` returned `Array<unknown>` for `xs.map(cb)` (it didn't walk the
// callback body), so a computed over a `.map` degraded to `[Any]` / unknown —
// fine for interpolation, wrong the moment it feeds a typed position (a
// `ForEach` id-path, arithmetic, a Codable bridge). Now the callback's param
// is bound to the source's element type and its body is inferred, so the
// computed gets the precise element type:
//
//   computed(() => nums().map(n => n * 2))  -> Swift  var x: [Int]  { … }
//   computed(() => nums().map(n => n > 0))  -> Swift  var x: [Bool] { … }
//
// Shared `inferType` → both targets benefit. Falls back to `Array<unknown>`
// when the body can't be inferred (e.g. member access on a typeRef element
// whose struct fields aren't in the inference ctx).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const nums = signal<number[]>([1, 2, 3])
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('.map element-type dataflow', () => {
  it('Swift: a scalar .map body infers the element type on the computed', () => {
    const out = transform(
      app(`  const doubled = computed(() => nums().map(n => n * 2))
  const flags = computed(() => nums().map(n => n > 0))`),
      { target: 'swift' },
    ).code
    expect(out).toContain('private var doubled: [Int]')
    expect(out).toContain('private var flags: [Bool]')
  })

  it('an identity .map preserves the element type', () => {
    const out = transform(app(`  const same = computed(() => nums().map(n => n))`), {
      target: 'swift',
    }).code
    expect(out).toContain('private var same: [Int]')
  })

  it('an un-inferable .map body falls back to no precise type (no regression)', () => {
    // member access on a typeRef element (no struct fields in ctx) → unknown
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
type Row = { label: string }
function App() {
  const rows = signal<Row[]>([])
  const labels = computed(() => rows().map(r => r.label))
  return (<Stack><Text>x</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    // doesn't crash; the computed emits (type may be Any — the fallback)
    expect(out).toContain('var labels')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: scalar .map computeds typecheck via swiftc', () => {
    const out = transform(
      app(`  const doubled = computed(() => nums().map(n => n * 2))
  const flags = computed(() => nums().map(n => n > 0))`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: scalar .map computeds typecheck via kotlinc', () => {
    const out = transform(
      app(`  const doubled = computed(() => nums().map(n => n * 2))`),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
