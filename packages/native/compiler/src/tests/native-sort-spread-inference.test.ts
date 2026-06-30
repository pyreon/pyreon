// Two related inference gaps that broke CHAINED array methods on native:
//
//  1. `.sort(cmp)` was MISSING from infer-type's array-method switch, so it
//     inferred `Any` — and any method chained after it (`.slice`, `.map`,
//     `.at`, …) then degraded too, because those lowerings gate on
//     `objType.kind === 'array'`. So `todos().sort(cmp).slice(0, n)` emitted a
//     bare invalid `.slice(...)`. (`.sort` was already in the EMIT switch →
//     `.sorted(by:)` / `.sortedWith` — only inference was missing.)
//
//  2. An array EXPRESSION inside a computed (`[...todos()]`) degraded to
//     `Any`, so the IDIOMATIC non-mutating sort `[...todos()].sort(cmp)`
//     broke the same way. Now an array expression infers its element type:
//     a spread `...x` contributes x's element type, a value its own; a
//     homogeneous result is `[T]`, heterogeneous/empty/un-inferrable → Any.
//
// Both are swiftc TYPE errors that `-parse` misses; Kotlin already inferred
// through the chain (`.sortedWith{…}.let{…}` flows the type), so only Swift
// was broken.

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

// One component exercising the chains — SINGLE source so the compile gates
// run ONE swiftc/kotlinc invocation each (looping cold kotlinc per shape blew
// the 60s test timeout under full-suite parallel load).
const ALL = `import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; text: string; done: boolean }
function App() {
  const todos = signal<Todo[]>([])
  const sortedPage = computed(() => [...todos()].sort((x, y) => x.id - y.id).slice(0, 10))
  const sortedNames = computed(() => [...todos()].sort((x, y) => x.id - y.id).map((t) => t.text).join(","))
  const directSorted = computed(() => todos().sort((x, y) => x.id - y.id).slice(0, 5))
  const copy = computed(() => [...todos()].filter((t) => t.done))
  return (<Stack><Text>{String(sortedPage().length + sortedNames().length + directSorted().length + copy().length)}</Text></Stack>)
}`

describe('sort inference + spread-array element inference (chained methods)', () => {
  it('Swift: sorted chains are typed arrays, downstream methods lower (no bare .slice/.sort)', () => {
    const out = transform(ALL, { target: 'swift' }).code
    expect(out).toContain('.sorted(by:')
    // the chained slice lowered (no bare JS `.slice(`)
    expect(out).not.toContain('.slice(')
    // sortedPage is a concrete [Todo], not Any
    expect(out).toContain('private var sortedPage: [Todo]')
    expect(out).toContain('private var copy: [Todo]')
  })

  it('Kotlin: sorted chains compile (type flows through)', () => {
    const out = transform(ALL, { target: 'kotlin' }).code
    expect(out).toContain('sortedWith')
    expect(out).not.toContain('.slice(')
  })

  it.skipIf(!isSwiftcAvailable())('parses via swiftc', () => {
    const r = validateSwift(transform(ALL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: before the fix `sortedPage` was `Any` and the
  // chained `.slice` emitted bare → swiftc TYPE error (`-parse` misses it).
  it.skipIf(!isSwiftUIAvailable())('TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(ALL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('compiles via kotlinc', () => {
    const r = validateKotlin(transform(ALL, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
