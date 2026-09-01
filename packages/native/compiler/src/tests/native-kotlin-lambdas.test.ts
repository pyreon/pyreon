// P1 — the Kotlin lambda/collection classes the charts engine bundle
// surfaced (44 kotlinc errors after Serializable-classpath artifacts).
// Four mechanisms, each bisect-targeted:
//   1. A top-level fn used as a VALUE in `??` needs the reference operator
//      (`format ?: ::plainF` — "function invocation expected" bare).
//   2. An array-literal local mutated via push/pop/shift/unshift/splice
//      emits `mutableListOf` (Kotlin List has no `add`); non-empty
//      literals self-infer, the empty branch keys on the annotation.
//   3. A return-bearing standalone lambda emits the ANONYMOUS FUNCTION
//      form (`fun(v: Double): String { ... }`) — plain `return` is legal
//      there; the labeled-return bail previously DROPPED the body.
//   4. The single-EXPRESSION arrow branch routes through ktLambdaParams —
//      it bypassed the typed form entirely (`{ n -> }` where kotlinc
//      demands an explicit param type on a standalone lambda).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kt = (src: string) => transform(src, { target: 'kotlin' })

describe('P1 — Kotlin lambda/collection lowerings', () => {
  it('fn-as-value in ?? emits the :: reference', () => {
    const r = kt(`
  type Formatter = (v: Double) => string
  function plainF(v: Double): string { return String(v) }
  function pick(format?: Formatter): Formatter {
    const fmt = format ?? plainF
    return fmt
  }
  export function P() { return <Text>{pick(undefined)(1.0)}</Text> }
`)
    expect(r.code).toContain('format ?: ::plainF')
    expect(r.warnings).toHaveLength(0)
  })

  it('a push-mutated NON-empty array literal emits mutableListOf', () => {
    const r = kt(`
  function mono(slope: Double[]): Double[] {
    const m = [slope[0]!]
    m.push(0.0)
    return m
  }
  export function P() { return <Text>{String(mono([1.0]).length)}</Text> }
`)
    expect(r.code).toContain('val m = mutableListOf(slope[0])')
  })

  it('a push-mutated EMPTY annotated array emits MutableList without reassignment', () => {
    const r = kt(`
  function seq(n: Double): Double[] {
    const out: Double[] = []
    out.push(n)
    return out
  }
  export function P() { return <Text>{String(seq(1.0).length)}</Text> }
`)
    expect(r.code).toContain('MutableList<Double> = mutableListOf()')
  })

  it('a return-bearing standalone lambda emits an anonymous function', () => {
    const r = kt(`
  type Formatter = (v: Double) => string
  function fixed(places: Double): Formatter {
    const mul = Math.pow(10.0, places)
    return (v: Double): string => {
      const s = String(Math.round(v * mul) / mul)
      if (s.length > 10.0) { return s }
      return s
    }
  }
  export function P() { return <Text>{fixed(2.0)(1.25)}</Text> }
`)
    expect(r.code).toContain('fun(v: Double): String {')
    expect(r.code).toContain('return s')
    expect(r.warnings).toHaveLength(0)
  })

  it('a single-EXPRESSION standalone lambda takes the typed form', () => {
    const r = kt(`
  function fmt2(x: Double): string {
    const p2 = (n: Double): string => (n < 10.0 ? "0" : "1")
    return p2(x)
  }
  export function P() { return <Text>{fmt2(1.0)}</Text> }
`)
    expect(r.code).toContain('{ n: Double ->')
  })

  it('an object-literal return keeps its return (named args are not assignments)', () => {
    const r = kt(`
  type Pt = { x: Double; y: Double }
  function pt(a: Double): Pt {
    return { x: a, y: a }
  }
  export function P() { return <Text>{String(pt(1.0).x)}</Text> }
`)
    expect(r.code).toContain('fun pt(a: Double): Pt = Pt(x = a, y = a)')
  })

  it('Math.max with mixed Int/Double args coerces the int side', () => {
    const r = kt(`
  function steps(sweep: Double): Double {
    return Math.max(2, Math.ceil(sweep * 64.0))
  }
  export function P() { return <Text>{String(steps(1.0))}</Text> }
`)
    expect(r.code).toContain('Math.max((2).toDouble()')
  })

  it('a count-loop counter coerces into Double fields; a Double bound wraps toInt', () => {
    const r = kt(`
  type Tick = { value: Double; label: string }
  function band(n: Double): Tick[] {
    const out: Tick[] = []
    for (let i = 0; i < n; i++) {
      out.push({ value: i, label: String(i) })
    }
    return out
  }
  export function P() { return <Text>{String(band(3.0).length)}</Text> }
`)
    expect(r.code).toContain('until Math.ceil(n).toInt()')
    expect(r.code).toContain('value = (i).toDouble()')
  })
})
