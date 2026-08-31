// P1 — a HELPER-body destructure must not be rewritten through a stale
// component-scope alias.
//
// The component classifier may parse a helper's body first (before the
// helper path wins) and register `const { center, radius } = mk(v)` in the
// component-LIFETIME `hookFieldAliases` map (`center -> __pyDestr0.center`).
// The helper body walker then re-expands the destructure into real
// block-scoped locals (`let __pyDestr1 = mk(v); let center = ...`), but
// parseExpr's Identifier case consulted the alias map FIRST — so the
// function's later reads emitted `__pyDestr0.center`: a container that is
// referenced but never declared ("cannot find '__pyDestr0' in scope" on both
// toolchains, found on the charts engine bundle where radar.ts destructures
// fitCircle's result). A block-scoped local must SHADOW the alias — the
// walker deletes the name from the map when it binds the real local.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftUIAvailable, validateSwiftWithStubs } from '../validate'

const SRC = `
  type Pt = { x: Double; y: Double }
  type Circle = { center: Pt; radius: Double }
  function mk(v: Double): Circle {
    const c: Circle = { center: { x: v, y: v }, radius: v }
    return c
  }
  function use(v: Double): Double {
    const { center, radius } = mk(v)
    return center.x + radius
  }
  export function P() { return <Text>{String(use(1.0))}</Text> }
`

const ARR = `
  function pick(v: Double): Double {
    const pair: Double[] = [v, v + 1.0]
    const [a, b] = pair
    return a + b
  }
  export function P() { return <Text>{String(pick(1.0))}</Text> }
`

describe('P1 — helper-body destructure vs stale component-scope alias', () => {
  it('Swift: reads resolve to the walker locals, not a stale container', () => {
    const out = transform(SRC, { target: 'swift' }).code
    // every referenced container is also declared
    const referenced = new Set(out.match(/__pyDestr\d+/g) ?? [])
    for (const name of referenced) {
      expect(out).toContain(`let ${name} = `)
    }
    // the return reads the shadowing locals
    expect(out).toContain('return center.x + radius')
  })

  it('Kotlin: same shadowing', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    const referenced = new Set(out.match(/__pyDestr\d+/g) ?? [])
    for (const name of referenced) {
      expect(out).toContain(`val ${name} = `)
    }
    expect(out).toContain('return center.x + radius')
  })

  it('Swift: ARRAY-destructure arm shadows too', () => {
    const out = transform(ARR, { target: 'swift' }).code
    const referenced = new Set(out.match(/__pyDestr\d+/g) ?? [])
    for (const name of referenced) {
      expect(out).toContain(`let ${name} = `)
    }
  })

  it.skipIf(!isSwiftUIAvailable())('the emitted Swift type-checks', () => {
    const out = transform(SRC, { target: 'swift' }).code
    const res = validateSwiftWithStubs(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe('P1 — Math.PI lowers as a constant member read', () => {
  const PI_SRC = `
  function circ(r: Double): Double {
    return 2.0 * Math.PI * r
  }
  export function P() { return <Text>{String(circ(1.0))}</Text> }
`
  it('Swift: Double.pi', () => {
    const out = transform(PI_SRC, { target: 'swift' }).code
    expect(out).toContain('Double.pi')
    expect(out).not.toContain('Math.PI')
  })
  it('Kotlin: kotlin.math.PI', () => {
    const out = transform(PI_SRC, { target: 'kotlin' }).code
    expect(out).toContain('kotlin.math.PI')
    expect(out).not.toContain('Math.PI')
  })
})

describe('P1 — charCodeAt lowers (was a silent verbatim emit)', () => {
  const SRC_CC = `
  function code(s: string): Double {
    const c = s.charCodeAt(0)
    return c >= 48.0 ? c - 48.0 : 0.0
  }
  export function P() { return <Text>{String(code("a"))}</Text> }
`
  it('Swift: UTF-16 code unit as Double', () => {
    const out = transform(SRC_CC, { target: 'swift' }).code
    expect(out).toContain('Double(Array(s.utf16)[Int(0)])')
    expect(out).not.toContain('charCodeAt')
  })
  it('Kotlin: Char.code as Double', () => {
    const out = transform(SRC_CC, { target: 'kotlin' }).code
    expect(out).toContain('s[(0).toInt()].code.toDouble()')
    expect(out).not.toContain('charCodeAt')
  })
  it.skipIf(!isSwiftUIAvailable())('the emitted Swift type-checks', () => {
    const out = transform(SRC_CC, { target: 'swift' }).code
    const res = validateSwiftWithStubs(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
