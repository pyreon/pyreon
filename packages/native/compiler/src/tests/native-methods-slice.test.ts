// JS `.slice(start, end?)` → native idiom. Swift arrays AND Strings have
// NO `.slice` method, and Kotlin's `slice` takes a range/indices (not two
// ints) — so the bare emit (`obj.slice(0, 2)`) fails BOTH compilers. The
// failure is a TYPE error on Swift ("[Todo] has no member 'slice'"), so it
// slips past `swiftc -parse` and only the `-typecheck` gate catches it.
//
// Lowering (clamps like JS — no out-of-range crash):
//   slice(s, e) → Swift Array(obj.dropFirst(s).prefix(max(0, e - s)))
//               → Kotlin obj.drop(s).take(maxOf(0, e - s))
//   slice(s)    → dropFirst(s) / drop(s)
// Array<T> rewraps via `Array(...)`, String via `String(...)` (Swift's
// dropFirst/prefix yield ArraySlice/Substring); Kotlin's drop/take are
// uniform across List/String so no wrap is needed there.

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

const SRC = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; text: string; done: boolean }
function App() {
  const todos = signal<Todo[]>([])
  const name = signal<string>('hello world')
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const COMPUTEDS = `  const firstTwo = computed(() => todos().slice(0, 2))
  const rest = computed(() => todos().slice(1))
  const pre = computed(() => name().slice(0, 3))
  const tail = computed(() => name().slice(2))`

describe('JS .slice → native idiom (dropFirst/prefix · drop/take)', () => {
  it('Swift: array slice rewraps via Array(dropFirst.prefix); string via String(...)', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    // array slice, both args → Array(...dropFirst(0).prefix(max(0, ...)))
    expect(out).toContain('Array(todos.dropFirst(0).prefix(max(0, (2) - (0))))')
    // array slice, single arg → Array(...dropFirst(1))
    expect(out).toContain('Array(todos.dropFirst(1))')
    // string slice rewraps via String(...), and the computed is typed String
    expect(out).toContain('String(name.dropFirst(0).prefix(max(0, (3) - (0))))')
    expect(out).toContain('String(name.dropFirst(2))')
    // result type annotations are correct (the array slice keeps [Todo])
    expect(out).toContain('private var firstTwo: [Todo]')
    expect(out).toContain('private var pre: String')
    // no bare `.slice(` survives in the emit
    expect(out).not.toContain('.slice(')
  })

  it('Kotlin: drop/take, uniform across List and String (no type wrap)', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'kotlin' }).code
    expect(out).toContain('todos.drop(0).take(maxOf(0, (2) - (0)))')
    expect(out).toContain('todos.drop(1)')
    expect(out).toContain('name.drop(0).take(maxOf(0, (3) - (0)))')
    expect(out).toContain('name.drop(2)')
    expect(out).not.toContain('.slice(')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    const r = validateSwift(out)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: the OLD bare `todos.slice(0, 2)` emit fails this
  // (`[Todo] has no member 'slice'`) — `-parse` does NOT catch it, only
  // `-typecheck` against real SwiftUI does.
  it.skipIf(!isSwiftUIAvailable())('emitted Swift TYPECHECKS against real SwiftUI', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    const r = validateSwiftTypecheck(out)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('emitted Kotlin compiles on real kotlinc', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'kotlin' }).code
    const r = validateKotlin(out)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
