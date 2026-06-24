// JS numeric-cast globals → native idiom + precise inference.
//   Number(x)     → Swift (Double(x) ?? 0) / Kotlin ((x).toDoubleOrNull() ?: 0.0)
//   parseInt(x)   → Swift (Int(x) ?? 0)    / Kotlin ((x).toIntOrNull() ?: 0)
//   parseFloat(x) → Swift (Double(x) ?? 0) / Kotlin ((x).toDoubleOrNull() ?: 0.0)
//
// `Number(x)` had NO mapping — emitted verbatim `Number(x)`, a swiftc TYPE
// error (no such global) that slips past `-parse`. `parseInt`/`parseFloat`
// already emitted correctly but the result inferred `Any`, so the computed
// was annotated `Any` instead of `Int`/`Double` — it typechecks (Any accepts
// the value) but loses the precise type for downstream arithmetic / typed
// positions. Now all three infer a number (`Number`/`parseFloat` → Double,
// `parseInt` → Int), which also drives correct Int↔Double coercion.

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
  const s = signal<string>('3.5')
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const COMPUTEDS = `  const num = computed(() => Number(s()))
  const int = computed(() => parseInt(s()))
  const flt = computed(() => parseFloat(s()))
  const scaled = computed(() => Number(s()) * 2)`

describe('JS Number() / parseInt / parseFloat → native idiom + precise type', () => {
  it('Swift: Number→Double cast; all three typed precisely (not Any)', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    expect(out).toContain('(Double(s) ?? 0)') // Number + parseFloat
    expect(out).toContain('(Int(s) ?? 0)') // parseInt
    expect(out).toContain('private var num: Double')
    expect(out).toContain('private var int: Int')
    expect(out).toContain('private var flt: Double')
    // float inference flows into arithmetic coercion
    expect(out).toContain('private var scaled: Double')
    expect(out).toContain('(Double(s) ?? 0) * Double(2)')
    expect(out).not.toContain('Number(s)')
    expect(out).not.toContain('private var num: Any')
  })

  it('Kotlin: Number→toDoubleOrNull; parseInt→toIntOrNull', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'kotlin' }).code
    expect(out).toContain('(s).toDoubleOrNull() ?: 0.0')
    expect(out).toContain('(s).toIntOrNull() ?: 0')
    expect(out).not.toContain('Number(s)')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC(COMPUTEDS), { target: 'swift' }).code
    const r = validateSwift(out)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: the OLD `Number(s)` emit fails this (no such global);
  // `-parse` does NOT catch it, only `-typecheck` vs real SwiftUI does.
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
