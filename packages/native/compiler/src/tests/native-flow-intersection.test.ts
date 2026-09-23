// React Flow's intersection helpers on the native flow engine:
// `getIntersectingNodes`, `isNodeIntersecting` and `getNodesBounds`. The engine
// behaviour is proven against the web oracle in the flow parity fixture; this
// locks the LOWERING: a rect literal becomes `PyreonFlowRect`, the positional
// `partially` flag gets its native label, and the emit compiles on both
// toolchains.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const APP = `
  import { createFlow } from '@pyreon/flow'
  import { Stack, Text } from '@pyreon/primitives'
  export function Probe() {
    const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
    const w = 120
    return <Stack>
      <Text>{flow.getIntersectingNodes('a').length}</Text>
      <Text>{flow.getIntersectingNodes({ x: 0, y: 0, width: w, height: 50 }, false).length}</Text>
      <Text>{String(flow.isNodeIntersecting('a', { x: 10, y: 10, width: 100, height: 100 }))}</Text>
      <Text>{String(flow.isNodeIntersecting('a', { x: 10, y: 10, width: 100, height: 100 }, false))}</Text>
      <Text>{flow.getNodesBounds().width}</Text>
      <Text>{flow.getNodesBounds(['a']).x}</Text>
    </Stack>
  }
`

describe('flow intersection helpers lower natively', () => {
  it('swift', () => {
    const result = transform(APP, { target: 'swift' })
    expect(result.warnings).toEqual([])
    expect(result.code).toContain('flow.getIntersectingNodes("a")')
    expect(result.code).toContain('flow.getIntersectingNodes(PyreonFlowRect(x: 0, y: 0, width: Double(w), height: 50), partially: false)')
    expect(result.code).toContain('flow.isNodeIntersecting("a", PyreonFlowRect(x: 10, y: 10, width: 100, height: 100), partially: false)')
    expect(result.code).toContain('flow.getNodesBounds().width')
    if (isSwiftcAvailable()) {
      const v = validateSwiftWithStubs(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('kotlin', () => {
    const result = transform(APP, { target: 'kotlin' })
    expect(result.warnings).toEqual([])
    expect(result.code).toContain('flow.getIntersectingNodes(PyreonFlowRect(0.0, 0.0, (w).toDouble(), 50.0), partially = false)')
    expect(result.code).toContain('flow.isNodeIntersecting("a", PyreonFlowRect(10.0, 10.0, 100.0, 100.0))')
    if (isKotlincAvailable()) {
      const v = validateKotlin(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })
})
