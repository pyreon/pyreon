// A local arrow-const's param annotations survive to the emitted closure.
//
// `const growRect = (r: Rect): Rect => …` emitted `let growRect = { r in … }`
// — and a STANDALONE Swift closure cannot infer its parameter types ("cannot
// infer type of closure parameter 'r' without a type annotation"), so every
// such helper-local in the chart engine failed to compile. What the author
// wrote must survive.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftUIAvailable, validateSwiftWithStubs } from '../validate'

const SRC = `
  type Pt = { x: Double; y: Double }
  function build(n: Double): Pt[] {
    const shift = (p: Pt): Pt => {
      const moved: Pt = { x: p.x + n, y: p.y }
      return moved
    }
    const out: Pt[] = []
    out.push(shift({ x: 1.0, y: 2.0 }))
    return out
  }
  export function P() { return <Text>{String(build(1.0).length)}</Text> }
`

const swift = transform(SRC, { target: 'swift' }).code

describe('closure param annotations survive', () => {
  it('emits the typed parenthesized form', () => {
    expect(swift).toContain('let shift = { (p: Pt)')
  })

  it('an UNANNOTATED callback param stays bare — inference contexts still work', () => {
    const sw = transform(
      `
      function f(xs: Double[]): Double[] {
        return xs.map((v) => v * 2.0)
      }
      export function P() { return <Text>{String(f([1.0]).length)}</Text> }
      `,
      { target: 'swift' },
    ).code
    // `.map { v in … }`-style contexts infer from the receiver; forcing a
    // typed form there would need types we do not have.
    expect(sw).not.toContain('(v:')
  })

  it.runIf(isSwiftUIAvailable())('the standalone typed closure type-checks', () => {
    const r = validateSwiftWithStubs(swift)
    expect(r.ok ? [] : [r.error]).toEqual([])
  })
})

describe('kotlin typed lambda params', () => {
  it('emits { p: Pt -> } when all params are annotated', () => {
    const out = transform(
      `
  type Pt = { x: Double; y: Double }
  function build(n: Double): Double {
    const shift = (p: Pt): Double => {
      const m: Double = p.x + n
      return m
    }
    return shift({ x: 1.0, y: 2.0 })
  }
  export function P() { return <Text>{String(build(1.0))}</Text> }
`,
      { target: 'kotlin' },
    )
    expect(out.code).toContain('{ p: Pt ->')
  })
})
