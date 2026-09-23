// The context-menu and hover listeners lower to the native engine's own
// listeners (a long-press and pointer hover natively), and the emit compiles.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const APP = `
  import { signal } from '@pyreon/reactivity'
  import { onMount } from '@pyreon/core'
  import { createFlow, Flow } from '@pyreon/flow'
  import { Stack, Text } from '@pyreon/primitives'
  export function Diagram() {
    const last = signal('')
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }, { id: 'b', position: { x: 200, y: 0 }, data: { label: 'B' } }],
      edges: [{ id: 'ab', source: 'a', target: 'b' }],
    })
    onMount(() => {
      flow.onNodeContextMenu((n) => last.set('node ' + n.id))
      flow.onEdgeContextMenu((e) => last.set('edge ' + e.id))
      flow.onPaneContextMenu((p) => last.set(\`pane \${p.x}\`))
      flow.onNodeMouseEnter((n) => last.set('enter ' + n.id))
      flow.onNodeMouseLeave((n) => last.set('leave ' + n.id))
      flow.onEdgeMouseEnter((e) => last.set('enter ' + e.id))
      flow.onEdgeMouseLeave((e) => last.set('leave ' + e.id))
    })
    return <Stack><Text>{last()}</Text><Flow instance={flow} /></Stack>
  }
`

const NAMES = ['onNodeContextMenu', 'onEdgeContextMenu', 'onPaneContextMenu', 'onNodeMouseEnter', 'onNodeMouseLeave', 'onEdgeMouseEnter', 'onEdgeMouseLeave']

describe('flow context-menu and hover listeners lower natively', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(target, () => {
      const result = transform(APP, { target })
      expect(result.warnings).toEqual([])
      for (const name of NAMES) expect(result.code, name).toContain(`flow.${name}`)
      if (target === 'swift' && isSwiftcAvailable()) {
        const v = validateSwiftWithStubs(result.code)
        expect(v.ok, v.error ?? '').toBe(true)
      }
      if (target === 'kotlin' && isKotlincAvailable()) {
        const v = validateKotlin(result.code)
        expect(v.ok, v.error ?? '').toBe(true)
      }
    })
  }
})
