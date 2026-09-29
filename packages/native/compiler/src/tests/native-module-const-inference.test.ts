// A FILE-SCOPE `const` receiver typed `unknown`, so every receiver-typed
// lowering went dark on it. `const NAMES = ['a', 'b', 'c']` above a component,
// then `NAMES.indexOf('b', 1)` inside it, re-emitted VERBATIM on both targets
// (`NAMES.indexOf("b", 1)` — no such method on a Swift Array or a Kotlin
// List) with none of #3728's method-shape handling and no warning;
// `GREETING.toUpperCase('tr')` the same; and `GREETING.length` picked Swift's
// untyped `.count` (grapheme clusters) where every typed string gets
// `.utf16.count` (UTF-16 units, as JS counts) — so `'hi👍'.length` read 3 on
// iOS and 4 on web and Android. The computeds over them annotated `Any`.
//
// The fix types file-scope bindings once per file (`buildModuleConstTypes`)
// and looks them up LAST for a bare identifier, so every narrower binding
// shadows them, as in JS.
//
// Bisect: the `moduleConsts` identifier lookup neutered →
//   `expected 'NAMES.indexOf("b", 1)' …` on both targets, the warning spec
//   fails with `expected [] …`, the length spec reads `GREETING.count`, and
//   swiftc/kotlinc reject the emit ("value of type '[String]' has no member
//   'indexOf'" / "too many arguments for 'fun indexOf(element: String)'").
//   The module-decl float widening neutered alone → `expected 'private let
//   RATE: Int = 0.5' to contain 'private let RATE: Double = 0.5'`.
//   Restored → all green.
//
// Found alongside: an ANNOTATED file-scope `const RATE: number = 0.5` was
// declared `Int = 0.5` on both targets — the annotation overriding the
// fractional evidence beside it, the same shape `refineSignalNumberFloats`
// already fixed for signals, now applied to module bindings too.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const SRC = `import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
const NAMES = ['a', 'b', 'c']
const GREETING = 'hi👍'
const LIMIT: number = 3
export function A() {
  const i = computed(() => NAMES.indexOf('b', 1))
  const up = computed(() => GREETING.toUpperCase('tr'))
  const n = computed(() => GREETING.length + LIMIT)
  return <Stack><Text>{i()}</Text><Text>{up()}</Text><Text>{n()}</Text></Stack>
}
`

describe('a file-scope const is a typed receiver', () => {
  it('Swift: the positioned indexOf lowers, the ignored arg is dropped, length counts UTF-16', () => {
    const r = swift(SRC)
    expect(r.code).not.toContain('NAMES.indexOf(')
    expect(r.code).toContain('__pyRecv[__pyFrom...].firstIndex(of: "b")')
    expect(r.code).toContain('private var up: String { GREETING.uppercased() }')
    expect(r.code).toContain('private var n: Int { GREETING.utf16.count + LIMIT }')
    expect(r.code).toContain('private var i: Int {')
  })

  it('Kotlin: the positioned indexOf lowers and the ignored arg is dropped', () => {
    const r = kotlin(SRC)
    expect(r.code).not.toContain('NAMES.indexOf("b", 1)')
    expect(r.code).toContain('__pyRecv.subList(__pyFrom, __pyRecv.size).indexOf("b")')
    expect(r.code).toContain('GREETING.uppercase()')
  })

  it('both targets NAME the dropped argument', () => {
    for (const r of [swift(SRC), kotlin(SRC)]) {
      expect(r.warnings.some((w) => w.startsWith('`.toUpperCase(…)` on a string'))).toBe(true)
    }
  })

  it.skipIf(!isSwiftcAvailable())('swiftc accepts the emit', () => {
    const r = validateSwiftWithStubs(swift(SRC).code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the emit', () => {
    const r = validateKotlin(kotlin(SRC).code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
})

describe('scoping and the shapes that stay untyped', () => {
  it('a component const of the same name SHADOWS the file-scope one', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
const X = 'file'
export function A() {
  const X = 7
  const y = computed(() => X + 1)
  return <Stack><Text>{y()}</Text></Stack>
}
`
    expect(swift(src).code).toContain('private var y: Int {')
  })

  // Found by native-examples-compile (native-tasks): typed as a map, a
  // file-scope SizedMap's `.size` became `.count` — PyreonSizedMap has none.
  it('a file-scope SizedMap keeps its own `.size` (it is a class, not a dictionary)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
import { SizedMap } from '@pyreon/sized-map'
const seen = new SizedMap<string, number>({ maxEntries: 8 })
export function A() {
  return <Stack><Text>{String(seen.size)}</Text></Stack>
}
`
    const code = swift(src).code
    expect(code).not.toContain('seen.count')
    if (isSwiftcAvailable()) {
      const v = validateSwiftWithStubs(code)
      expect(v.ok, v.error).toBe(true)
    }
  }, 240_000)

  it('a file-scope OBJECT literal stays untyped (its value is a synthesized struct, not a tuple)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
const CFG = { a: 1, b: 'x' }
export function A() {
  const c = computed(() => CFG)
  return <Stack><Text>{c().b}</Text></Stack>
}
`
    const before = swift(src).code
    expect(before).not.toMatch(/private var c: \(/)
  })

  it('an annotated binding takes its annotation — widened by a fractional initializer', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
const RATE: number = 0.5
const STEPS: number[] = [1, 2.5]
export function A() {
  const r = computed(() => RATE * 2)
  const s = computed(() => STEPS.length)
  return <Stack><Text>{r()}</Text><Text>{s()}</Text></Stack>
}
`
    // A \`: number\` annotation cannot say Int or Double; the 0.5 beside it can.
    // Before, both targets declared \`RATE: Int = 0.5\` — rejected by both.
    const sw = swift(src).code
    expect(sw).toContain('private let RATE: Double = 0.5')
    expect(sw).toContain('private let STEPS: [Double] = [1.0, 2.5]')
    expect(sw).toContain('private var r: Double {')
    const kt = kotlin(src).code
    expect(kt).toContain('private val RATE: Double = 0.5')
    if (isSwiftcAvailable()) {
      const v = validateSwiftWithStubs(sw)
      expect(v.ok, v.error).toBe(true)
    }
    if (isKotlincAvailable()) {
      const v = validateKotlin(kt)
      expect(v.ok, v.error).toBe(true)
    }
  }, 240_000)
})
