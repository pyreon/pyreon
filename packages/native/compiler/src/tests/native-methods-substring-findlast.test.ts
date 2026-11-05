// JS `.substring(start, end?)` (String) and `.findLast(pred)` (Array) →
// native idiom. Swift has NEITHER method:
//   str.substring(...)  → "value of type 'String' has no member 'substring'"
//   arr.findLast(...)   → "value of type '[Todo]' has no member 'findLast'"
// Both are TYPE errors, so they slip past `swiftc -parse` — only the
// `-typecheck`-vs-real-SwiftUI gate catches them. Kotlin has both natively
// (`String.substring`, `List.findLast`), so only Swift needs a mapping.
//
//   substring(s, e) → Swift String(obj.dropFirst(s).prefix(max(0, e - s)))
//   substring(s)    → Swift String(obj.dropFirst(s))   (Kotlin: pyreonSubstring — its own throws past the end)
//   findLast(p)     → Swift obj.last(where: p)          (Kotlin: native)
//
// `.findLast` returns `T | undefined` (like `.find`), so the inference side
// annotates the result `T?` — not the `Any` it degraded to with no case.

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

const COMPUTEDS = `  const pre = computed(() => name().substring(0, 3))
  const tail = computed(() => name().substring(2))
  const lastDone = computed(() => todos().findLast(t => t.done))`

describe('JS .substring / .findLast → native idiom', () => {
  it('Swift: substring → the UTF-16 runtime; findLast → last(where:) typed T?', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    expect(out).toContain('pyreonSubstring(name, 0, 3)')
    expect(out).toContain('pyreonSubstring(name, 2)')
    expect(out).toContain('todos.last(where: { t in t.done })')
    // findLast is Optional — the computed is annotated Todo?, not Any
    expect(out).toContain('private var lastDone: Todo?')
    expect(out).not.toContain('private var lastDone: Any')
    // no bare JS method survives
    expect(out).not.toContain('.substring(')
    expect(out).not.toContain('.findLast(')
  })

  it('Kotlin: substring goes through pyreonSubstring (Kotlin\'s own throws past the end); findLast passes through', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'kotlin' }).code
    expect(out).toContain('pyreonSubstring(name, (0L).toLong(), (3L).toLong())')
    expect(out).toContain('pyreonSubstring(name, (2L).toLong())')
    expect(out).toContain('todos.findLast(')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    const r = validateSwift(out)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: the OLD `name.substring(0, 3)` / `todos.findLast(…)`
  // emit fails this (`String`/`[Todo]` has no such member) — `-parse` does
  // NOT catch it, only `-typecheck` against real SwiftUI does.
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
