import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * The accumulate-into-a-local shape:
 *
 *     const out: Tick[] = []
 *     while (…) { out.push(…) }
 *     return out
 *
 * Three things were wrong at once, and all three had to be fixed together for
 * any of them to matter:
 *
 *   1. The declaration's TYPE ANNOTATION was dropped, so an empty literal had
 *      no element type. swiftc rejects that outright ("empty collection literal
 *      requires an explicit type") and Kotlin infers `List<Nothing>`.
 *   2. `.push` had no mapping and emitted verbatim — Array has no `push` on
 *      either target.
 *   3. The mutability tracker only saw `=` and `++`, so a local mutated ONLY by
 *      pushing stayed immutable. A Swift Array is a value type, so `let`
 *      rejects `append`.
 *
 * This is how most non-trivial pure logic is written, so it blocked helper
 * libraries generally rather than an edge case.
 */
const SRC = `
  type Tick = { label: string }

  function makeTicks(names: string[]): Tick[] {
    const out: Tick[] = []
    for (const n of names) {
      out.push({ label: n })
    }
    return out
  }

  export function P() {
    const t = makeTicks(['a', 'b'])
    return <Stack><Text>{String(t.length)}</Text></Stack>
  }
`

describe('an array accumulated by push', () => {
  const swift = transform(SRC, { target: 'swift' }).code
  const kotlin = transform(SRC, { target: 'kotlin' }).code

  it('types the empty array from the annotation (Swift)', () => {
    expect(swift).toContain('var out: [Tick] = []')
  })

  it('is VAR, because appending to a Swift array mutates it', () => {
    expect(swift).not.toContain('let out: [Tick]')
  })

  it('maps push to append', () => {
    expect(swift).toContain('out.append(')
    expect(swift).not.toContain('out.push(')
  })

  it('uses the mutable pair on Kotlin — List has no add, listOf is immutable', () => {
    expect(kotlin).toContain('val out: MutableList<Tick> = mutableListOf()')
    expect(kotlin).toContain('out.add(')
    expect(kotlin).not.toContain('out.push(')
  })

  /**
   * A NON-empty literal types itself from its elements; annotating it would
   * only risk disagreeing with them, so it is deliberately left alone.
   */
  it('leaves a non-empty literal unannotated', () => {
    const src = `
      function f(seed: string): string[] {
        const xs: string[] = [seed, 'b']
        return xs
      }
      export function P() { return <Stack><Text>{String(f('a').length)}</Text></Stack> }
    `
    expect(transform(src, { target: 'swift' }).code).toContain('let xs = [seed, "b"]')
  })

  it('appends several values in one call', () => {
    // A parameter is required: a NO-param function returning a value is a
    // deliberate false-negative in the helper gate (indistinguishable from the
    // component-returning-a-value harness shape), so it would emit as a View.
    const src = `
      function f(seed: string): string[] {
        const xs: string[] = []
        xs.push(seed, 'b')
        return xs
      }
      export function P() { return <Stack><Text>{String(f('a').length)}</Text></Stack> }
    `
    expect(transform(src, { target: 'swift' }).code).toContain('append(contentsOf:')
    expect(transform(src, { target: 'kotlin' }).code).toContain('addAll(listOf(')
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
