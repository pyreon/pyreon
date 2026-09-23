// Two ways a 400-node flow screen failed to build on both targets.
//
// 1. `createFlow<{ label: string }>({ nodes: [], … })` — the explicit generic
//    the compiler's own warning recommends for an empty graph — emitted
//    `PyreonFlowState<String>` on Swift and `PyreonFlowState<Any>` on Kotlin,
//    while every `data: { label }` literal resolved to the synthesized
//    `__Obj0`. The two sides named different types.
// 2. `flow.addNode({ position: { x: col * 200, y: row * 100 } })` inside a
//    loop passed an Int EXPRESSION where `PyreonXYPosition` takes Doubles. The
//    coordinate rewrite only knew about literals.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = `import { computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
import { Flow, createFlow } from '@pyreon/flow'
function Grid() {
  const flow = createFlow<{ label: string }>({ nodes: [], edges: [] })
  const total = computed(() => \`\${flow.nodes().length}\`)
  return (
    <Stack>
      <Text>{total}</Text>
      <Button
        onPress={() => {
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              const index = row * 3 + col
              flow.addNode({ id: \`g\${index}\`, position: { x: col * 200, y: row * 100 }, data: { label: \`N\${index}\` } })
            }
          }
        }}
      >
        Load
      </Button>
      <Flow instance={flow} />
    </Stack>
  )
}`

const out = (target: 'swift' | 'kotlin') => transform(APP, { target })

describe('an inline-object flow generic names the data literals struct', () => {
  it('Swift: the state is generic over the struct the data literal constructs', () => {
    const code = out('swift').code
    const state = code.match(/PyreonFlowState<(\w+)>/)?.[1]
    const data = code.match(/data: (\w+)\(label:/)?.[1]
    expect(state).toBeDefined()
    expect(state).toBe(data)
  })

  it('Kotlin: the state is generic over the data class, not Any', () => {
    const code = out('kotlin').code
    const state = code.match(/PyreonFlowState<(\w+)>/)?.[1]
    const data = code.match(/data = (\w+)\(label =/)?.[1]
    expect(state).not.toBe('Any')
    expect(state).toBe(data)
  })

  it('emits no warnings on either target', () => {
    expect(out('swift').warnings).toEqual([])
    expect(out('kotlin').warnings).toEqual([])
  })
})

describe('an integer coordinate expression reaches the Double position', () => {
  it('Swift wraps it in Double(_:)', () => {
    expect(out('swift').code).toContain('PyreonXYPosition(x: Double(col * 200), y: Double(row * 100))')
  })

  it('Kotlin converts it with toDouble()', () => {
    expect(out('kotlin').code).toContain('PyreonXYPosition((col * 200).toDouble(), (row * 100).toDouble())')
  })
})

describe('the grid screen survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: type-checks against the stub', () => {
    const r = validateSwiftWithStubs(out('swift').code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: compiles on kotlinc', () => {
    const r = validateKotlin(out('kotlin').code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
