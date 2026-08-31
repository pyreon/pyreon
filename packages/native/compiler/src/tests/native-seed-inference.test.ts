// P1 — the inference SEEDING gaps the charts engine bundle surfaced. Four
// mechanisms, each with its own bisect target:
//   1. helperReturns reaches the module-level infer ctxs (a top-level
//      helper's `const step = niceStep(...)` seeded UNKNOWN — every
//      type-gated lowering downstream went dark: the Int×Double coercion
//      wrapped the PRODUCT `Double(step * i)` instead of the counter).
//   2. seedHandlerLocals prefers the ANNOTATION when the initializer
//      infers unknown (`const out: Double[] = []`).
//   3. `String(x)` infers string (a `const s = String(r)` local otherwise
//      took indexOf's ARRAY branch — `firstIndex ?? -1`, a String.Index
//      vs Int type error — instead of the range(of:) distance form).
//   4. Struct-init coerces an Int-valued arg into a Float-typed field
//      (`Tick(value: i)` over a loop counter).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('P1 — seeding + inference gaps (charts-engine shapes)', () => {
  it('helper-call locals seed the declared return type (coercion placement)', () => {
    const out = transform(`
  function niceStep(raw: Double): Double {
    return raw * 2.0
  }
  function ticks(lo: Double, hi: Double, count: Double): Double[] {
    const out: Double[] = []
    const step = niceStep((hi - lo) / count)
    let i = 0
    while (i < 10) {
      const v = lo + step * i
      out.push(v)
      i = i + 1
    }
    return out
  }
  export function P() { return <Text>{String(ticks(0.0, 10.0, 5.0).length)}</Text> }
`, { target: 'swift' }).code
    expect(out).toContain('step * Double(i)')
    expect(out).not.toContain('Double(step * i)')
  })

  it('String(x) locals infer string — indexOf takes the range(of:) form', () => {
    const out = transform(`
  function fx(v: Double): Double {
    const s = String(v)
    const dot = s.indexOf(".")
    return dot
  }
  export function P() { return <Text>{String(fx(1.25))}</Text> }
`, { target: 'swift' }).code
    expect(out).toContain('range(of: ".")')
    expect(out).not.toContain('firstIndex')
  })

  it('struct-init coerces an Int counter into a Float field', () => {
    const out = transform(`
  type Tick = { value: Double; label: string }
  function make(n: Double): Tick[] {
    const out: Tick[] = []
    let i = 0
    while (i < 3) {
      out.push({ value: i, label: String(i) })
      i = i + 1
    }
    return out
  }
  export function P() { return <Text>{String(make(3.0).length)}</Text> }
`, { target: 'swift' }).code
    expect(out).toContain('Tick(value: Double(i)')
  })

  it('Kotlin: struct-init coerces the Int counter too (named args do not widen)', () => {
    const out = transform(`
  type Tick = { value: Double; label: string }
  function make(n: Double): Tick[] {
    const out: Tick[] = []
    let i = 0
    while (i < 3) {
      out.push({ value: i, label: String(i) })
      i = i + 1
    }
    return out
  }
  export function P() { return <Text>{String(make(3.0).length)}</Text> }
`, { target: 'kotlin' }).code
    expect(out).toContain('value = (i).toDouble()')
  })

  it('a RETURNED closure body seeds both ctxs (dual-seed sweep)', () => {
    const out = transform(`
  type Formatter = (v: Double) => string
  function fixed(places: Double): Formatter {
    const mul = Math.pow(10.0, places)
    return (v: Double): string => {
      const s = String(Math.round(v * mul) / mul)
      const dot = s.indexOf(".")
      return dot < 0 ? s : s
    }
  }
  export function P() { return <Text>{fixed(2.0)(1.25)}</Text> }
`, { target: 'swift' }).code
    expect(out).toContain('range(of: ".")')
    expect(out).not.toContain('firstIndex')
  })

  it('a closure body sees its ANNOTATED params — comparisons coerce', () => {
    const out = transform(`
  type Pt = { x: Double; y: Double }
  function render(progress: Double, data: Pt[]): Pt[] {
    const reveal = (pts: Pt[]): Pt[] => {
      const span = pts.length - 1
      const cut = span * progress
      const whole = Math.floor(cut)
      const frac = cut - whole
      if (frac > 0.0 && whole + 1 < pts.length) {
        return pts
      }
      return pts
    }
    return reveal(data)
  }
  export function P() { return <Text>{String(render(0.5, [{ x: 1.0, y: 2.0 }]).length)}</Text> }
`, { target: 'swift' }).code
    expect(out).toContain('< Double(pts.count)')
  })
})
