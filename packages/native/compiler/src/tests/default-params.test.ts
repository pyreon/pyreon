// A defaulted helper parameter (`places: number = 0`) CROSSES as a native
// default parameter — Swift and Kotlin both have them, so nothing needs
// desugaring. Previously the AssignmentPattern case was unhandled and the
// parameter silently VANISHED from the signature while the body kept reading
// it: `func currency(_ symbol: String)` with `places` unresolved inside —
// the exact 'cannot find places in scope' the chart engine's formatters hit.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `
  function pad(s: string, width: number = 4, fill: string = 'x'): string {
    if (s.length >= width) return s
    return fill + s
  }
  export function P() {
    return <Text>{pad('a') + pad('b', 8) + pad('c', 2, 'y')}</Text>
  }
`

const swift = transform(SRC, { target: 'swift' }).code
const kotlin = transform(SRC, { target: 'kotlin' }).code

describe('defaulted helper parameters', () => {
  it('keeps the parameter AND its default in the Swift signature', () => {
    expect(swift).toContain('func pad(_ s: String, _ width: Int = 4, _ fill: String = "x") -> String')
  })

  it('emits the Kotlin twin', () => {
    expect(kotlin).toMatch(/fun pad\(s: String, width: Int = 4, fill: String = "x"\)/)
  })

  it('call sites omit, partially supply, or fully supply — all verbatim', () => {
    expect(swift).toContain('pad("a")')
    expect(swift).toContain('pad("b", 8)')
    expect(swift).toContain('pad("c", 2, "y")')
  })

  it('a fractional default stays a Double', () => {
    const sw = transform(
      `
      function scale2(v: Double, k: Double = 1.5): Double { return v * k }
      export function P() { return <Text>{String(scale2(2.0))}</Text> }
      `,
      { target: 'swift' },
    ).code
    expect(sw).toContain('_ k: Double = 1.5')
  })

  it.runIf(isSwiftUIAvailable())('the emitted Swift type-checks', () => {
    const r = validateSwiftWithStubs(swift)
    expect(r.ok ? [] : [r.error]).toEqual([])
  })

  it.runIf(isKotlincAvailable())('the emitted Kotlin compiles', async () => {
    const r = await validateKotlin(kotlin)
    expect(r.ok ? [] : [r.error]).toEqual([])
  })
})
