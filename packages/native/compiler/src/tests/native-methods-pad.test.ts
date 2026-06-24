// JS `str.padStart(len, pad?)` / `str.padEnd(...)` → native idiom.
//   Swift has NO native pad — build the run manually:
//     padStart → (String(repeating: pad, count: max(0, len - str.count)) + str)
//     padEnd   → (str + String(repeating: pad, count: max(0, len - str.count)))
//   Kotlin's `padStart`/`padEnd` ARE native but take a Char pad-arg (JS
//   passes a String), so a single-char string literal becomes a Char and an
//   omitted pad uses the native default (a space — matches JS).
//
// Only the common cases map exactly: pad OMITTED (→ space) or a SINGLE-char
// string literal. A multi-char pad would over-pad (Swift repeats the whole
// string; JS truncates) and a dynamic pad can't become a Kotlin Char — both
// fall through to the generic emit. Without the mapping `str.padStart(…)`
// was a swiftc TYPE error (`-parse` misses it) and invalid Kotlin (Char arg).

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
  const name = signal<string>('42')
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const COMPUTEDS = `  const padded = computed(() => name().padStart(5, '0'))
  const spaced = computed(() => name().padStart(8))
  const trailing = computed(() => name().padEnd(8, ' '))`

describe('JS .padStart / .padEnd → native idiom (single-char/default pad)', () => {
  it('Swift: manual repeat-and-concat, clamped; typed String', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    expect(out).toContain('(String(repeating: "0", count: max(0, (5) - name.count)) + name)')
    expect(out).toContain('(String(repeating: " ", count: max(0, (8) - name.count)) + name)')
    expect(out).toContain('(name + String(repeating: " ", count: max(0, (8) - name.count)))')
    expect(out).toContain('private var padded: String')
    expect(out).not.toContain('.padStart(')
    expect(out).not.toContain('.padEnd(')
  })

  it('Kotlin: native padStart/padEnd with Char pad-arg (or default)', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'kotlin' }).code
    expect(out).toContain("name.padStart(5, '0')")
    expect(out).toContain('name.padStart(8)') // omitted pad → native default space
    expect(out).toContain("name.padEnd(8, ' ')")
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    const r = validateSwift(out)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: the OLD `name.padStart(5, "0")` emit is a swiftc
  // TYPE error (no native `.padStart`) — `-parse` does NOT catch it.
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
