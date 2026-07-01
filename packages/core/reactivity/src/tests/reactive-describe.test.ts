import { afterEach, describe, expect, it } from 'vitest'
import { computed } from '../computed'
import {
  describeReactiveGraph,
  formatGraphDescription,
} from '../reactive-describe'
import { effect } from '../effect'
import { __resetReactiveDevtoolsForTesting, activateReactiveDevtools } from '../reactive-devtools'
import { signal } from '../signal'

afterEach(() => __resetReactiveDevtoolsForTesting())

describe('describeReactiveGraph — behavioral summary from the graph', () => {
  it('summarizes counts + describes what a signal change does', () => {
    activateReactiveDevtools()
    const qty = signal(1, { name: 'qty' })
    const price = signal(9.99, { name: 'price' })
    const total = computed(() => qty() * price())
    effect(() => {
      total()
    })

    const desc = describeReactiveGraph()
    expect(desc.summary).toMatchObject({ signals: 2, derived: 1, effects: 1 })

    const qtyNode = desc.nodes.find((n) => n.name === 'qty')!
    expect(qtyNode.behavior).toContain('changing it')
    expect(qtyNode.behavior).toContain('re-derives 1 value')
    expect(qtyNode.behavior).toContain('runs 1 effect')

    const totalNode = desc.nodes.find((n) => n.kind === 'derived')!
    // total recomputes when qty, price change (names, order-independent)
    expect(totalNode.behavior).toMatch(/recomputes when .*(qty|price).*change/)

    const effectNode = desc.nodes.find((n) => n.kind === 'effect')!
    expect(effectNode.behavior).toMatch(/runs when .* change/)
  })

  it('flags an orphan signal that nothing depends on', () => {
    activateReactiveDevtools()
    const used = signal(1, { name: 'used' })
    signal(2, { name: 'orphan' }) // created but never read → orphan
    effect(() => {
      used()
    })

    const desc = describeReactiveGraph()
    const orphanNode = desc.nodes.find((n) => n.name === 'orphan')!
    expect(orphanNode.behavior).toContain('nothing reacts to it')
    expect(desc.insights.some((i) => i.kind === 'orphan-signal' && i.name === 'orphan')).toBe(true)
    // `used` is NOT an orphan
    expect(desc.insights.some((i) => i.name === 'used')).toBe(false)
  })

  it('flags a high-fanout (hot) signal', () => {
    activateReactiveDevtools()
    const theme = signal('light', { name: 'theme' })
    // 10 effects all read theme → fan-out well above the HOT_FANOUT threshold
    for (let i = 0; i < 10; i++) {
      effect(() => {
        theme()
      })
    }
    const desc = describeReactiveGraph()
    const hot = desc.insights.find((i) => i.kind === 'high-fanout' && i.name === 'theme')
    expect(hot).toBeDefined()
    expect(hot!.detail).toContain('10 effects')
  })

  it('flags a deep dependency chain', () => {
    activateReactiveDevtools()
    const a = signal(1, { name: 'a' })
    const b = computed(() => a() + 1)
    const c = computed(() => b() + 1)
    const d = computed(() => c() + 1)
    const e = computed(() => d() + 1)
    const f = computed(() => e() + 1)
    effect(() => {
      f() // force the whole chain to subscribe
    })
    const desc = describeReactiveGraph()
    expect(desc.insights.some((i) => i.kind === 'deep-chain')).toBe(true)
  })

  it('formatGraphDescription renders sections + insights', () => {
    activateReactiveDevtools()
    const qty = signal(1, { name: 'qty' })
    signal(0, { name: 'orphan' }) // created but never read → orphan (asserted in output)
    const total = computed(() => qty() * 2)
    effect(() => {
      total()
    })
    const out = formatGraphDescription(describeReactiveGraph())
    expect(out).toContain('Reactive graph —')
    expect(out).toContain('Signals:')
    expect(out).toContain('Derived:')
    expect(out).toContain('Effects:')
    expect(out).toContain('Insights')
    expect(out).toContain('orphan')
  })

  it('returns an empty summary for an empty graph', () => {
    activateReactiveDevtools()
    const desc = describeReactiveGraph()
    expect(desc.summary).toEqual({ signals: 0, derived: 0, effects: 0, edges: 0 })
    expect(desc.nodes).toEqual([])
    expect(desc.insights).toEqual([])
  })
})
