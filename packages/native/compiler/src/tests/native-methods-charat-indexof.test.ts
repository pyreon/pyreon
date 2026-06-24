// JS string-indexing methods → native idiom:
//   str.charAt(i)   → Swift String(Array(str)[i]) / Kotlin str[i].toString()
//                     (JS charAt returns a 1-char STRING; Kotlin str[i] is a
//                     Char, Swift has no `.charAt` — both need a mapping)
//   arr.indexOf(x)  → Swift (arr.firstIndex(of: x) ?? -1)   [Kotlin native -1]
//   str.indexOf(s)  → Swift (str.range(of: s).map { distance } ?? -1)
//                     [Kotlin native]
//
// All three failed `swiftc -typecheck` before (type errors `-parse` misses):
//   - `arr.firstIndex(of:)` is `Int?` annotated `Int` (no `-1` sentinel)
//   - `str.firstIndex(of: "x")` wants a Character + returns `String.Index?`,
//     not the JS Int offset
//   - `str.charAt` / Kotlin Char-vs-String have no/ wrong member
// Kotlin's `indexOf` already returns Int (-1) for both, so only `charAt`
// needs a Kotlin mapping.

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
  const name = signal<string>('hello')
  const ids = signal<number[]>([1, 2, 3])
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const COMPUTEDS = `  const first = computed(() => name().charAt(0))
  const pos = computed(() => ids().indexOf(2))
  const strPos = computed(() => name().indexOf('l'))`

describe('JS .charAt / .indexOf → native idiom', () => {
  it('Swift: charAt → String(Array[i]); indexOf → Int with `?? -1` / range+distance', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    expect(out).toContain('String(Array(name)[0])')
    expect(out).toContain('(ids.firstIndex(of: 2) ?? -1)')
    expect(out).toContain(
      'name.range(of: "l").map { name.distance(from: name.startIndex, to: $0.lowerBound) } ?? -1',
    )
    // result types: charAt→String, both indexOf→Int (not Int? / Any)
    expect(out).toContain('private var first: String')
    expect(out).toContain('private var pos: Int')
    expect(out).toContain('private var strPos: Int')
    expect(out).not.toContain('.charAt(')
  })

  it('Kotlin: charAt → [i].toString(); indexOf passes through (native -1)', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'kotlin' }).code
    expect(out).toContain('name[0].toString()')
    expect(out).toContain('ids.indexOf(2)')
    expect(out).toContain("name.indexOf(\"l\")")
    expect(out).not.toContain('.charAt(')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    const r = validateSwift(out)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: the OLD emit fails this — `arr.firstIndex(of:)` is
  // `Int?`-vs-`Int`, `str.firstIndex(of: "l")` is the wrong type, `charAt`
  // has no member. `-parse` does NOT catch any; `-typecheck` does.
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
