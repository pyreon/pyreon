// connectionMode, elevateNodesOnSelect / elevateEdgesOnSelect and node / edge
// zIndex lower from createFlow on both targets. The behaviour is proven by the
// web browser specs and the native fixtures; this locks the lowering and that
// the emit compiles.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const APP = `
  import { createFlow, Flow } from '@pyreon/flow'
  export function Diagram() {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' }, zIndex: 5 },
        { id: 'b', position: { x: 200, y: 0 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', zIndex: 2 }],
      connectionMode: 'loose',
      elevateNodesOnSelect: false,
      elevateEdgesOnSelect: true,
    })
    return <Flow instance={flow} />
  }
`

describe('connectionMode, elevation and zIndex lower natively', () => {
  it('swift', () => {
    const result = transform(APP, { target: 'swift' })
    expect(result.warnings.filter((w) => /connectionMode|elevate|zIndex/.test(w))).toEqual([])
    expect(result.code).toContain('connectionMode: "loose"')
    expect(result.code).toContain('elevateNodesOnSelect: false, elevateEdgesOnSelect: true')
    expect(result.code).toContain('zIndex: 5)')
    expect(result.code).toContain('zIndex: 2)')
    if (isSwiftcAvailable()) {
      const v = validateSwiftWithStubs(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('kotlin', () => {
    const result = transform(APP, { target: 'kotlin' })
    expect(result.warnings.filter((w) => /connectionMode|elevate|zIndex/.test(w))).toEqual([])
    expect(result.code).toContain('connectionMode = "loose"')
    expect(result.code).toContain('elevateNodesOnSelect = false')
    expect(result.code).toContain('elevateEdgesOnSelect = true')
    expect(result.code).toContain('zIndex = 5.0')
    expect(result.code).toContain('zIndex = 2.0')
    if (isKotlincAvailable()) {
      const v = validateKotlin(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('an unknown connectionMode is reported, not silently defaulted', () => {
    const src = APP.replace("connectionMode: 'loose'", "connectionMode: 'sideways'")
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.join('\n'), target).toContain('connectionMode (expected "strict" or "loose")')
    }
  })

  it('a non-literal zIndex is reported, not silently dropped', () => {
    const src = APP.replace("data: { label: 'A' }, zIndex: 5", "data: { label: 'A' }, zIndex: Math.max(1, 2)")
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.join('\n'), target).toContain('zIndex (not a numeric literal)')
    }
  })
})
