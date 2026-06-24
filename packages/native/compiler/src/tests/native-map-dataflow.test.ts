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
// Shared `inferType` → both targets benefit. Member access on a typeRef
// element (`todos().map(t => t.id)` where `t: Todo`) now ALSO resolves —
// the declared `type Todo = { ... }` is threaded into the inference ctx's
// struct registry, so `t.id` infers `Int` and the computed is `[Int]`, not
// the `[Any]` it degraded to before. Falls back to `Array<unknown>` only
// when the element's struct genuinely isn't declared (inline anonymous
// shapes the parser didn't capture as a named struct).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isSwiftcAvailable,
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateSwift,
  validateSwiftTypecheck,
  validateKotlin,
} from '../validate'

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

  it('member access on a typeRef element resolves the field type via the struct registry', () => {
    // `rows().map(r => r.label)` where `r: Row` (a declared module type) —
    // the struct registry resolves `r.label` to String, so the computed is
    // `[String]`, NOT the `[Any]` it degraded to before this fix.
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
    expect(out).toContain('private var labels: [String]')
    expect(out).not.toContain('[Any]')
  })

  it('resolves every scalar field type of a multi-field struct element', () => {
    // The dominant real-app shape: a typed object-array signal + multiple
    // computeds projecting different fields. Each `.map(t => t.FIELD)` infers
    // the field's concrete type — `id`→[Int], `text`→[String], `done`→[Bool].
    const src = `import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; text: string; done: boolean }
function App() {
  const todos = signal<Todo[]>([])
  const ids = computed(() => todos().map(t => t.id))
  const texts = computed(() => todos().map(t => t.text))
  const flags = computed(() => todos().map(t => t.done))
  return (<Stack><Text>x</Text></Stack>)
}`
    const swift = transform(src, { target: 'swift' }).code
    expect(swift).toContain('private var ids: [Int]')
    expect(swift).toContain('private var texts: [String]')
    expect(swift).toContain('private var flags: [Bool]')
    expect(swift).not.toContain('[Any]')
    // Kotlin emits no explicit annotation on `by remember { derivedStateOf {…} }`
    // (the type flows from the body), but the element types must not collapse
    // to `Any` anywhere in the projected expressions.
    const kotlin = transform(src, { target: 'kotlin' }).code
    expect(kotlin).not.toContain('List<Any>')
  })

  it.skipIf(!isSwiftcAvailable())(
    'Swift: typeRef-element .map computeds typecheck via swiftc',
    () => {
      const out = transform(
        `import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; text: string; done: boolean }
function App() {
  const todos = signal<Todo[]>([])
  const ids = computed(() => todos().map(t => t.id))
  const texts = computed(() => todos().map(t => t.text))
  return (<Stack><Text>x</Text></Stack>)
}`,
        { target: 'swift' },
      ).code
      const res = validateSwift(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: typeRef-element .map computeds typecheck via kotlinc',
    () => {
      const out = transform(
        `import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; text: string; done: boolean }
function App() {
  const todos = signal<Todo[]>([])
  const ids = computed(() => todos().map(t => t.id))
  const texts = computed(() => todos().map(t => t.text))
  return (<Stack><Text>x</Text></Stack>)
}`,
        { target: 'kotlin' },
      ).code
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )

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

// `.reduce((acc, x) => body, seed)` inference. Without a `reduce` case in
// the array-method switch it degraded to `Any` → a computed over a reduce
// annotated `Any` → `String(<that>)` failed swiftc (`no exact matches in
// call to initializer 'String'`). Now it infers the accumulator type
// (reducer body, with acc=seed-type + element bound), falling back to the
// seed's type.
describe('.reduce element-type inference', () => {
  it('Swift: reduce over numbers infers the accumulator type (Int, not Any)', () => {
    const out = transform(
      app(`  const sum = computed(() => nums().reduce((a, b) => a + b, 0))`),
      { target: 'swift' },
    ).code
    expect(out).toContain('private var sum: Int')
    expect(out).not.toContain('private var sum: Any')
  })

  it('Swift: reduce over a typed-struct array (field sum) infers Int, not Any', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
type Item = { price: number }
function App() {
  const items = signal<Item[]>([])
  const total = computed(() => items().reduce((s, i) => s + i.price, 0))
  return (<Stack><Text>{String(total())}</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    expect(out).toContain('private var total: Int')
    expect(out).not.toContain('private var total: Any')
  })

  it.skipIf(!isSwiftUIAvailable())(
    'Swift: a reduce-result fed to String() typechecks against real SwiftUI',
    () => {
      // The exact failing shape: String(<reduce result>) — Int now, so
      // `String(Int)` resolves (was `String(Any)` → no matching initializer).
      const out = transform(
        `import { Stack, Text } from '@pyreon/primitives'
type Item = { price: number }
function App() {
  const items = signal<Item[]>([])
  const total = computed(() => items().reduce((s, i) => s + i.price, 0))
  return (<Stack><Text>{String(total())}</Text></Stack>)
}`,
        { target: 'swift' },
      ).code
      const res = validateSwiftTypecheck(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )
})
