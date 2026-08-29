import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/**
 * A top-level function is a COMPONENT or a HELPER based on what it RETURNS,
 * not on the shape of its parameters.
 *
 * The classifier used `props.length === 0` as its "not a component" signal.
 * `parseProps` populates `props` for any object-typed first parameter, and a
 * helper that takes a struct has one — so the same function kind was
 * classified differently depending on PARAMETER ORDER:
 *
 *     layoutBars(values: Double[], plot: Rect)   -> func    (array first)
 *     hitBar(plot: Rect, x: Double, y: Double)   -> COMPONENT (struct first)
 *
 * Silently, with no warning. Swift emitted `struct hitBar: View`; Kotlin
 * emitted a `@Composable` whose parameters were taken from the struct's FIELDS
 * rather than its own signature, leaving the body referencing names that do not
 * exist. A geometry library is functions over structs, so it could not be
 * written at all.
 *
 * The return is the sound signal: a component renders (JSX, or `null` for
 * "render nothing"), a helper produces a value.
 */
const SRC = `
  type Double = number
  type Box = { x: Double; y: Double }

  function structFirst(b: Box, k: Double): Double { return b.x * k }
  function structSecond(k: Double, b: Box): Double { return b.x * k }
  function scalarsOnly(a: Double, b: Double): Double { return a * b }
  function arrayFirst(vs: Double[], b: Box): Double { return vs.length * b.x }

  export function P() {
    const b: Box = { x: 40.0, y: 8.0 }
    const t = structFirst(b, 2.0) + structSecond(2.0, b) + scalarsOnly(1.0, 2.0) + arrayFirst([1.0], b)
    return <Stack><Text>{String(t)}</Text></Stack>
  }
`

describe('a helper is classified by its return, not its parameter order', () => {
  describe('swift', () => {
    const out = transform(SRC, { target: 'swift' }).code

    it('emits a struct-first helper as a function', () => {
      expect(out).toContain('func structFirst(_ b: Box, _ k: Double) -> Double')
    })

    /**
     * The load-bearing assertion. Before the fix the function was still
     * PRESENT — as `struct structFirst: View` — so asserting only that the name
     * appears passes against the bug. The failure is the wrong KIND.
     */
    it('does NOT emit it as a View', () => {
      expect(out).not.toContain('struct structFirst: View')
    })

    it('leaves the orderings that already worked unchanged', () => {
      expect(out).toContain('func structSecond(_ k: Double, _ b: Box) -> Double')
      expect(out).toContain('func scalarsOnly(_ a: Double, _ b: Double) -> Double')
      expect(out).toContain('func arrayFirst(_ vs: [Double], _ b: Box) -> Double')
    })
  })

  describe('kotlin', () => {
    const out = transform(SRC, { target: 'kotlin' }).code

    it('emits a struct-first helper as a function with its OWN parameters', () => {
      expect(out).toContain('fun structFirst(b: Box, k: Double): Double')
    })

    /** The Kotlin failure took its parameters from the struct's fields. */
    it('does not take the parameters from the struct fields', () => {
      expect(out).not.toContain('fun structFirst(x: Double, y: Double)')
      expect(out).not.toContain('@Composable\nfun structFirst')
    })
  })

  /**
   * A component whose render path returns `null` must stay a COMPONENT — it
   * renders nothing, which is not the same as producing a value. Widening the
   * helper gate without this exception would turn every `return null` render
   * path into a function.
   */
  it('keeps a null-returning component a component', () => {
    const src = `
      type Props = { hidden: boolean }
      export function Maybe(props: Props) {
        if (props.hidden) { return null }
        return <Stack><Text>shown</Text></Stack>
      }
      export function P() { return <Stack><Maybe hidden={false} /></Stack> }
    `
    const out = transform(src, { target: 'swift' }).code
    expect(out).toContain('struct Maybe: View')
    expect(out).not.toContain('func Maybe(')
  })

  /** A real component with a named props type is still a component. */
  it('keeps a component with a named props struct a component', () => {
    const src = `
      type CardProps = { title: string }
      export function Card(props: CardProps) {
        return <Stack><Text>{props.title}</Text></Stack>
      }
      export function P() { return <Stack><Card title="x" /></Stack> }
    `
    const out = transform(src, { target: 'swift' }).code
    expect(out).toContain('struct Card: View')
    expect(out).not.toContain('func Card(')
  })

  /**
   * A RENDER-PROP component returns `props.children(data)` — a value, not JSX
   * and not nullish — so the return alone reads as a helper. `@pyreon/lathe`
   * generates exactly this shape, and a return-only rule reclassified it,
   * whereupon return-type inference could not type it and dropped it with a
   * warning. Caught by lathe's suite, not the compiler's: this compiler change
   * is only observable in a package that CONSUMES the compiler.
   */
  it('keeps a PascalCase render-prop component a component', () => {
    const src = `
      type Props = { id: string; children: (data: string | undefined) => unknown }
      export function BookData(props: Props) {
        return props.children(props.id)
      }
      export function P() { return <Stack><Text>x</Text></Stack> }
    `
    const out = transform(src, { target: 'swift' })
    expect(out.code).not.toContain('func BookData(')
    expect(
      out.warnings.some((w) => String((w as { message?: string }).message ?? w).includes('BookData')),
    ).toBe(false)
  })

  /** The camelCase twin of that shape IS a helper — naming is the signal. */
  it('treats the camelCase twin as a helper', () => {
    const src = `
      type Double = number
      type Box = { x: Double; y: Double }
      function boxWidth(b: Box, k: Double): Double { return b.x * k }
      export function P() { return <Stack><Text>{String(boxWidth({ x: 1.0, y: 2.0 }, 2.0))}</Text></Stack> }
    `
    expect(transform(src, { target: 'swift' }).code).toContain('func boxWidth(')
  })
})
