// A Double-typed value stored into an INTEGER-typed struct field (integer-field-coercion.ts).
//
// `type Todo = { id: number; title: string }` lowers `id` to Swift `Int` / Kotlin `Long`. `Date.now()` and
// `Math.floor` / `ceil` / `round` / `trunc` are whole numbers in JavaScript but Doubles natively, and neither target
// converts at an initializer or `.copy(…)` argument — so `todos.update((t) => [...t, { id: Date.now(), title }])`
// compiled with ZERO warnings and failed both builds (Swift "cannot convert value of type 'TimeInterval' (aka
// 'Double') to expected argument type 'Int'", Kotlin "actual type is 'Double', but 'Long' was expected").
//
// A whole-valued Double converts exactly; any other Double is NAMED (truncating would change the stored value).

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateSwiftTypecheck,
} from '../validate'

const head = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button, For } from '@pyreon/primitives'
type Todo = { id: number; title: string }
`

const whole = `${head}
function App() {
  const todos = signal<Todo[]>([])
  const add = (title: string) => todos.update((t) => [...t, { id: Date.now(), title }])
  const pick = (title: string) => todos.update((t) => [...t, { id: Math.floor(Math.random() * 1000), title }])
  const sec = (title: string) => todos.update((t) => [...t, { id: Math.round(Date.now() / 1000) + 1, title }])
  const halve = () => todos.update((t) => t.map((x) => ({ ...x, id: Math.trunc(x.id / 2) })))
  const stamp = () => todos.update((t) => t.map((x) => ({ ...x, id: Date.now() })))
  const next = (title: string) => todos.update((t) => [...t, { id: t.length + 1, title }])
  return (
    <Stack>
      <For each={todos()} by={(t) => t.id}>{(t) => <Text>{t.title}</Text>}</For>
      <Button onPress={() => { add('a'); pick('b'); sec('c'); halve(); stamp(); next('d') }}>add</Button>
    </Stack>
  )
}`

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })

describe('a whole-valued Double converts into an integer struct field', () => {
  it('Swift: Date.now() in integer ms, Math.floor/round/trunc wrapped in Int(…), at init AND spread override', () => {
    const { code, warnings } = emit(whole, 'swift')
    expect(code).toContain('struct Todo: Codable {\n  var id: Int')
    expect(code).toContain('Todo(id: Int(Date().timeIntervalSince1970 * 1000), title: title)')
    expect(code).toContain(
      'Todo(id: Int(floor(Double(Double.random(in: 0..<1) * Double(1000)))), title: title)',
    )
    expect(code).toMatch(/Todo\(id: Int\(\(\(Double\(.*\) \+ Double\(1\)\), title: title\)/)
    expect(code).toContain('c.id = Int(trunc(Double(Double(x.id) / Double(2))))')
    expect(code).toContain('c.id = Int(Date().timeIntervalSince1970 * 1000)')
    // An integer value is untouched.
    expect(code).toContain('Todo(id: todos.count + 1, title: title)')
    expect(warnings).toEqual([])
  })

  it('Kotlin: Date.now() is System.currentTimeMillis(), Math.* wrapped in .toLong(), at init AND .copy(…)', () => {
    const { code, warnings } = emit(whole, 'kotlin')
    expect(code).toContain('data class Todo(var id: Long, var title: String)')
    expect(code).toContain('Todo(id = System.currentTimeMillis(), title = title)')
    expect(code).toContain('Todo(id = (Math.floor(Math.random() * 1000L)).toLong(), title = title)')
    expect(code).toMatch(/Todo\(id = \(Math\.round\(.*\+ 1L\)\.toLong\(\), title = title\)/)
    expect(code).toContain('x.copy(id = (kotlin.math.truncate(')
    expect(code).toContain('x.copy(id = System.currentTimeMillis())')
    expect(code).not.toContain('System.currentTimeMillis().toDouble(), title')
    expect(warnings).toEqual([])
  })

  it.runIf(isSwiftcAvailable())(
    'swiftc type-checks the Swift (stubs)',
    () => {
      const r = validateSwiftWithStubs(emit(whole, 'swift').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )

  it.runIf(isSwiftUIAvailable())(
    'swiftc type-checks the Swift (real SDK)',
    () => {
      const r = validateSwiftTypecheck(emit(whole, 'swift').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )

  it.runIf(isKotlincAvailable())(
    'kotlinc compiles the Kotlin',
    () => {
      const r = validateKotlin(emit(whole, 'kotlin').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )
})

describe('a fractional Double into an integer struct field is named, not truncated', () => {
  const fractional = `${head}
function App() {
  const todos = signal<Todo[]>([])
  const add = (title: string) => todos.update((t) => [...t, { id: Math.random(), title }])
  const half = () => todos.update((t) => t.map((x) => ({ ...x, id: x.id / 2 })))
  return (<Stack><Text>{todos().length}</Text><Button onPress={() => { add('a'); half() }}>add</Button></Stack>)
}`

  for (const [target, native] of [
    ['swift', 'Int'],
    ['kotlin', 'Long'],
  ] as const) {
    it(`${target}: one warning naming the field and the Double fix; the value is not converted`, () => {
      const { code, warnings } = emit(fractional, target)
      const named = warnings.filter((w) => w.includes('`Todo.id` is `number`'))
      expect(named).toHaveLength(1)
      expect(named[0]).toContain(`\`${native}\``)
      expect(named[0]).toContain('`id: Double`')
      expect(code).not.toMatch(/Int\(Double\.random|\.random\(\)\)\.toLong\(\)/)
    })
  }

  it('a field already Double is untouched', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
type Double = number
type Ev = { at: Double; n: number }
function App() {
  const evs = signal<Ev[]>([])
  const add = () => evs.update((e) => [...e, { at: Date.now(), n: e.length }])
  return (<Stack><Text>{evs().length}</Text><Button onPress={add}>add</Button></Stack>)
}`
    expect(emit(src, 'swift').code).toContain(
      'Ev(at: (Date().timeIntervalSince1970 * 1000), n: evs.count)',
    )
    expect(emit(src, 'kotlin').code).toContain(
      'Ev(at = System.currentTimeMillis().toDouble(), n = ',
    )
    expect(emit(src, 'swift').warnings).toEqual([])
    expect(emit(src, 'kotlin').warnings).toEqual([])
  })
})

// The same evidence the signal-seed refinement already reads, on an ANNOTATED local: `const row: Row = { value: 1.5 }`
// left `value` an `Int` / `Long` beside a `1.5` argument, uncompilable on both targets and (until the warning above)
// silent.
describe('an annotated local with a fractional literal makes the field Double', () => {
  const src = `import { Text } from '@pyreon/primitives'
interface Row { label: string; value: number }
export function C() {
  const row: Row = { label: 'a', value: 1.5 }
  return <Text>{row.label}</Text>
}`

  it('both targets declare the field Double, with no warning', () => {
    const sw = emit(src, 'swift')
    const kt = emit(src, 'kotlin')
    expect(sw.code).toContain('var value: Double')
    expect(kt.code).toContain('data class Row(var label: String, var value: Double)')
    expect(sw.warnings).toEqual([])
    expect(kt.warnings).toEqual([])
  })

  it.runIf(isSwiftcAvailable())(
    'swiftc type-checks the Swift (stubs)',
    () => {
      const r = validateSwiftWithStubs(emit(src, 'swift').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )

  it.runIf(isKotlincAvailable())(
    'kotlinc compiles the Kotlin',
    () => {
      const r = validateKotlin(emit(src, 'kotlin').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )
})
