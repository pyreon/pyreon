// A function-type alias substitutes to its function type at parse.
//
// `type Formatter = (v: Double) => string` was an unresolved name on both
// targets — the second of the two blockers between the chart engine and a
// native compile (the fat-struct union was the first). Substitution rather
// than a `typealias` emit, deliberately: the emitters' existing machinery
// then does everything — the optional form parenthesizes, and
// `typeContainsFunction` sees a REAL function kind and drops Codable /
// @Serializable from structs carrying one, which a name-preserving emit
// could not do without teaching that check to chase aliases.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// The optional-FIELD half (LayoutConfig.yFormat?) and the CALL half are
// exercised separately on purpose: calling through an optional field needs
// the optional-NARROWING lowering (`if (f !== undefined) f(v)` → Swift
// unwrap), which is its own frontier and its own PR — borrowing it here
// would couple this feature's compile spec to that one's absence.
const ENGINE_SHAPE = `
  type Formatter = (v: Double) => string
  type LayoutConfig = {
    width: Double
    yFormat?: Formatter
  }
  function fmt(f: Formatter, v: Double): string {
    return f(v)
  }
  function widthOf(cfg: LayoutConfig): Double {
    return cfg.width
  }
  export function P() {
    return <Text>{fmt((v: Double) => String(v), widthOf({ width: 10.0 }))}</Text>
  }
`

const swift = transform(ENGINE_SHAPE, { target: 'swift' }).code
const kotlin = transform(ENGINE_SHAPE, { target: 'kotlin' }).code

describe('function-type alias substitution', () => {
  it('a struct field typed by the alias carries the function type, parenthesized optional', () => {
    expect(swift).toContain('var yFormat: ((Double) -> String)? = nil')
    expect(kotlin).toContain('var yFormat: ((Double) -> String)? = null')
  })

  it('drops Codable / @Serializable from a struct carrying one — closures cannot decode', () => {
    // The engine's LayoutConfig produced "does not conform to protocol
    // 'Decodable'" for exactly this shape: the field was an unresolved NAME,
    // so typeContainsFunction could not see the function behind it.
    expect(swift).toContain('struct LayoutConfig {')
    expect(swift).not.toContain('struct LayoutConfig: Codable')
    expect(kotlin).not.toMatch(/@Serializable\ndata class LayoutConfig/)
  })

  it('a helper parameter typed by the alias takes the function type', () => {
    const src = `
      type Formatter = (v: Double) => string
      function apply(f: Formatter, v: Double): string { return f(v) }
      export function P() { return <Text>{apply((v: Double) => String(v), 2.0)}</Text> }
    `
    const sw = transform(src, { target: 'swift' }).code
    // No `@escaping`: the parameter is only CALLED, never stored, and a
    // non-escaping closure is Swift's default — the leaner emit is correct.
    expect(sw).toContain('func apply(_ f: (Double) -> String, _ v: Double) -> String')
  })

  it('an alias declared BELOW its use still resolves — the collect is a pre-pass', () => {
    const src = `
      type Cfg = { cb?: Later }
      type Later = (n: Double) => Double
      export function P() { return <Text>x</Text> }
    `
    const sw = transform(src, { target: 'swift' }).code
    expect(sw).toContain('var cb: ((Double) -> Double)? = nil')
  })

  it('a GENERIC function alias stays out of the subset', () => {
    const src = `
      type Mapper<T> = (v: T) => T
      type Cfg = { m?: Mapper<Double> }
      export function P() { return <Text>x</Text> }
    `
    const sw = transform(src, { target: 'swift' }).code
    // Not substituted (the alias is generic); the name passes through as a
    // typeRef exactly as before this feature.
    expect(sw).not.toContain('((Double) -> Double)?')
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
