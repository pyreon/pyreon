// A template literal prints a number with JavaScript's `String(number)`. Swift
// and Kotlin interpolation print a whole-valued Double as `7.0`, so a label
// built from arithmetic read `Total: 7.0` on iOS/Android and `Total: 7` on the
// web. Double interpolands now go through the runtime's `pyreonNumberString`.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const src = `import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function C() {
  const price = signal(2.5)
  const count = signal(3)
  return <Text>{\`total \${price() * 2} for \${count()} items\`}</Text>
}
`

describe('template literals print numbers as JavaScript does', () => {
  it('Swift: a Double goes through pyreonNumberString, an Int does not', () => {
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('\\(pyreonNumberString(price * Double(2)))')
    expect(r.code).not.toContain('pyreonNumberString(count')
  })

  it('Kotlin: the same', () => {
    const r = transform(src, { target: 'kotlin' })
    // Kotlin whole-number literals default to Long (the Int-to-Long pass),
    // so the multiplier carries the `L` suffix — still not routed through
    // pyreonNumberString, which is Double-only.
    expect(r.code).toContain('${pyreonNumberString(price * 2L)}')
    expect(r.code).not.toContain('pyreonNumberString(count')
  })

  it('compiles on both targets', () => {
    const s = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
    if (!s.skipped) expect(s.ok, s.error).toBe(true)
    const k = validateKotlin(transform(src, { target: 'kotlin' }).code)
    if (!k.skipped) expect(k.ok, k.error).toBe(true)
  })
})
