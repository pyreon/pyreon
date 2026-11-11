/**
 * The reactive class binding is a NAMED binding in the dev reactive graph.
 *
 * DynamicStyled's reactive path swaps `classList` from a `renderEffect` whose
 * first run writes nothing (the ref has not attached yet; the initial class
 * rides on the props). The runtime's DOM setters therefore never saw it, and
 * it sat in the graph as an anonymous `effect` — so the one binding that
 * carries a rocketstyle component's variant / size / state was missing from
 * every "which bindings updated" view (Atlas's Reactive coverage panel).
 */
import { h } from '@pyreon/core'
import {
  __resetReactiveDevtoolsForTesting,
  activateReactiveDevtools,
  getReactiveGraph,
  signal,
} from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { styled } from '../styled'

const Box = styled('div')`
  color: ${(p: { $element?: { color?: string } }) => p.$element?.color};
` as unknown as (props: Record<string, unknown>) => ReturnType<typeof h>

afterEach(() => {
  __resetReactiveDevtoolsForTesting()
  document.body.innerHTML = ''
})

describe('DynamicStyled class binding in the reactive graph', () => {
  it('is a `class` binding on the element it writes, with an edge from its source, and counts its fires', () => {
    activateReactiveDevtools()
    const color = signal('rgb(1, 2, 3)', { name: 'color' })
    const root = document.createElement('div')
    document.body.appendChild(root)
    mount(h(Box as never, { $element: () => ({ color: color() }) }), root)

    const graph = () => getReactiveGraph()
    const node = () => graph().nodes.find((n) => n.binding === 'class')
    expect(node()?.name).toBe('class on <div>')
    expect(node()?.fires).toBe(1)

    // The edge runs signal → class computed → binding.
    const colorId = graph().nodes.find((n) => n.name === 'color')!.id
    const computedId = graph().edges.find((e) => e.from === colorId)!.to
    expect(graph().edges).toContainEqual({ from: computedId, to: node()!.id })

    color.set('rgb(4, 5, 6)')
    expect(node()?.fires).toBe(2)
  })
})
