import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A number written as a float STAYS a float, even when its value is integral.
 *
 * `10.0` and `0.0` satisfy `Number.isInteger`, so the value alone cannot tell
 * them from `10` and `0` — they emitted as `Int` and poisoned every expression
 * they took part in ("binary operator '*' cannot be applied to operands of type
 * 'Int' and 'Double'"). Writing `10.0` in the source did not help, which is the
 * part that made it hard to work around: there was no spelling that produced a
 * Double.
 *
 * The source text is the only evidence, so the parser reads the literal's raw
 * form. A `Double`-annotated local initialized with a plain `1` is the same
 * problem from the other direction — there the annotation is the evidence.
 */
const SRC = `
  type Double = number

  function g(n: Double): Double {
    let m = 10.0
    const k = 2.5
    const scale: Double = 1
    if (n > 1.0) { m = 1.0 }
    return m * n + k + scale
  }

  export function P() { return <Stack><Text>{String(g(3.5))}</Text></Stack> }
`

describe('float literals keep their type', () => {
  const swift = transform(SRC, { target: 'swift' }).code
  const kotlin = transform(SRC, { target: 'kotlin' }).code

  it('an integral-valued float literal survives as a float', () => {
    expect(swift).toContain('var m = 10.0')
    expect(kotlin).toContain('var m = 10.0')
  })

  it('a reassignment to one survives too', () => {
    expect(swift).toContain('m = 1.0')
    expect(kotlin).toContain('m = 1.0')
  })

  it('a fractional literal is untouched — it never needed help', () => {
    expect(swift).toContain('let k = 2.5')
    expect(kotlin).toContain('val k = 2.5')
  })

  /** From the other direction: the ANNOTATION is the evidence. */
  it('a Double-annotated integer literal widens', () => {
    expect(swift).toContain('let scale = 1.0')
    expect(kotlin).toContain('val scale = 1.0')
  })

  /**
   * A plain integer with no float evidence stays an Int. Widening everything
   * would break indices and counts, which is why Int is the default.
   */
  it('leaves a plain integer alone', () => {
    const src = `
      function idx(n: number): number {
        const base = 2
        return n * base
      }
      export function P() { return <Stack><Text>{String(idx(3))}</Text></Stack> }
    `
    const out = transform(src, { target: 'swift' }).code
    expect(out).toContain('let base = 2')
    expect(out).not.toContain('let base = 2.0')
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
