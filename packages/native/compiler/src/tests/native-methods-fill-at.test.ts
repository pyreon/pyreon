// JS array creation + element-access methods → native idiom.
//   Array(n).fill(v) / arr.fill(v) → Swift Array(repeating: v, count: <n>)
//                                  → Kotlin List(<n>) { v }   (immutable)
//   arr.at(i)  → Optional element, NEGATIVE i counts from the end:
//                Swift  (arr.indices.contains(R) ? arr[R] : nil)   R resolves -i
//                Kotlin arr.getOrNull(if (i<0) arr.size+i else i)
//
// Both were emitted verbatim (`.fill`/`.at` — no such Swift member; Kotlin
// `.fill` mutates Unit / `.at` doesn't exist) — swiftc TYPE errors that slip
// past `-parse`. `.at` returns `T | undefined`, so it infers `T?` (like
// find/findLast); `.fill` infers `Array<typeof v>` (handled before the
// array-type gate since `Array(n)` doesn't itself infer as an array).

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
function App() {
  const ids = signal<number[]>([1, 2, 3])
  const n = signal<number>(3)
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const COMPUTEDS = `  const created = computed(() => Array(n()).fill(0))
  const head = computed(() => ids().at(0))
  const last = computed(() => ids().at(-1) ?? 0)`

describe('JS .fill / .at → native idiom', () => {
  it('Swift: fill → Array(repeating:count:); at → bounds-checked Optional', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    expect(out).toContain('Array(repeating: 0, count: n)')
    expect(out).toContain('private var created: [Int]')
    // at: negative index resolves count + i, bounds-checked → nil; typed T?
    expect(out).toContain('ids.indices.contains')
    expect(out).toContain('ids.count + (-1)')
    expect(out).toContain('private var head: Int?')
    expect(out).not.toContain('.fill(')
    expect(out).not.toContain('.at(')
  })

  it('Kotlin: fill → List(n){v}; at → getOrNull with negative-index resolve', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'kotlin' }).code
    expect(out).toContain('List(n) { 0 }')
    expect(out).toContain('ids.getOrNull(if ((0) < 0) ids.size + (0) else (0))')
    expect(out).toContain('ids.size + (-1)')
    expect(out).not.toContain('.fill(')
    expect(out).not.toContain('.at(')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    const r = validateSwift(out)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: the OLD `Array(n).fill(0)` / `ids.at(i)` emit are
  // swiftc TYPE errors (no such members) — `-parse` does NOT catch them.
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
