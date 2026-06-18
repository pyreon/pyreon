// Correctness fix — JS `/` is ALWAYS float division (`7 / 2 === 3.5`).
// Swift/Kotlin integer `/` truncates (`7 / 2 == 3`), even when the result is
// assigned to a Double — so `computed(() => a() / b())` over two integer
// signals silently rendered 3 instead of 3.5 on both native targets (a
// "1 code, different value" divergence that COMPILES). Now `/` infers Double
// and the emit coerces both operands to float division. Other ops
// (`+ - * %`) match JS for integers and stay verbatim.
//
// Adversarially verified at the VALUE level (not just compile): real
// `swift` and `kotlin` both print `OLD a/b = 3`, `NEW Double(a)/Double(b) = 3.5`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const SRC = `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
function C() {
  const a = signal(7)
  const b = signal(2)
  const avg = computed(() => a() / b())
  const sum = computed(() => a() + b())
  const prod = computed(() => a() * b())
  const rem = computed(() => a() % b())
  return (<Stack><Text>{avg()}</Text></Stack>)
}`

describe('JS `/` → float division on native (matches `7 / 2 === 3.5`)', () => {
  it('Swift: division coerces operands to Double + result type is Double', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('private var avg: Double { Double(a) / Double(b) }')
    // other ops are NOT coerced — they match JS for integers
    expect(out).toContain('var sum: Int { a + b }')
    expect(out).toContain('var prod: Int { a * b }')
    expect(out).toContain('var rem: Int { a % b }')
  })

  it('Kotlin: division coerces operands with .toDouble()', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('(a).toDouble() / (b).toDouble()')
    // other ops stay verbatim
    expect(out).toContain('a + b')
    expect(out).toContain('a * b')
    expect(out).toContain('a % b')
    expect(out).not.toContain('(a).toDouble() + (b)')
  })

  it('literal division also coerces (`9 / 2`)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
function C() { const h = computed(() => 9 / 2); return (<Stack><Text>{h()}</Text></Stack>) }`
    expect(transform(src, { target: 'swift' }).code).toContain('Double(9) / Double(2)')
    expect(transform(src, { target: 'kotlin' }).code).toContain('(9).toDouble() / (2).toDouble()')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC, { target: 'swift' }).code
    const r = validateSwift(out)
    if (!r.ok) throw new Error(`swiftc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('emitted Kotlin compiles on real kotlinc', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    const r = validateKotlin(out)
    if (!r.ok) throw new Error(`kotlinc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })
})
