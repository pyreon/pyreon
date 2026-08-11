/**
 * P0 pan/zoom regression: the viewport div is mounted STATICALLY and only its
 * `style` string is reactive.
 *
 * Before the fix, the viewport was rendered by a reactive child accessor that
 * read `instance.viewport()` at its top and returned the whole
 * `.pyreon-flow-viewport` subtree — so EVERY viewport write (each wheel tick,
 * each pan pointermove, each `animateViewport` frame) tore down and re-created
 * all N node divs, their ResizeObservers, and all E edge paths. Invisible in
 * 5-node demos; structurally unusable at 1k nodes.
 *
 * The load-bearing assertion is ELEMENT IDENTITY across viewport writes: the
 * same node/edge/viewport DOM objects must survive a pan and a zoom, and zero
 * new elements may be created by a viewport-only change. Bisect-verified:
 * reverting the viewport div to the accessor form fails every identity
 * assertion here (fresh elements per write) while the style assertion alone
 * would still pass — identity is what makes these specs load-bearing.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'

function makeGraph() {
  return createFlow({
    nodes: [
      { id: 'a', position: { x: 20, y: 40 }, data: { label: 'A' } },
      { id: 'b', position: { x: 260, y: 160 }, data: { label: 'B' } },
      { id: 'c', position: { x: 140, y: 300 }, data: { label: 'C' } },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ],
  })
}

describe('viewport writes do NOT remount the graph subtree (P0)', () => {
  let cleanups: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
  })

  it('keeps node/edge/viewport element identity across pan and zoom', () => {
    const flow = makeGraph()
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow }))
    cleanups.push(cleanup)

    const viewportBefore = container.querySelector('.pyreon-flow-viewport')
    const nodesBefore = [...container.querySelectorAll('.pyreon-flow-node')]
    const svgBefore = container.querySelector('svg.pyreon-flow-edges')
    expect(viewportBefore).toBeTruthy()
    expect(nodesBefore).toHaveLength(3)
    expect(svgBefore).toBeTruthy()

    // A pan burst + a zoom — the shapes a wheel/pointermove handler produces.
    for (let i = 1; i <= 20; i++) {
      flow.viewport.set({ x: i * 7, y: i * 3, zoom: 1 })
    }
    flow.viewport.set({ x: 140, y: 60, zoom: 1.5 })

    const viewportAfter = container.querySelector('.pyreon-flow-viewport')
    const nodesAfter = [...container.querySelectorAll('.pyreon-flow-node')]
    const svgAfter = container.querySelector('svg.pyreon-flow-edges')

    // Identity — the SAME DOM objects, not equivalent re-creations.
    expect(viewportAfter).toBe(viewportBefore)
    expect(svgAfter).toBe(svgBefore)
    expect(nodesAfter).toHaveLength(3)
    for (let i = 0; i < 3; i++) expect(nodesAfter[i]).toBe(nodesBefore[i])

    // …and the transform DID update (the reactive style thunk is live).
    const style = (viewportAfter as HTMLElement).getAttribute('style') ?? ''
    expect(style).toContain('translate(140px, 60px)')
    expect(style).toContain('scale(1.5)')
  })

  it('creates ZERO new elements during a 30-write pan/zoom burst', () => {
    const flow = makeGraph()
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow }))
    cleanups.push(cleanup)
    expect(container.querySelectorAll('.pyreon-flow-node')).toHaveLength(3)

    const originalCreate = document.createElement.bind(document)
    const originalCreateNS = document.createElementNS.bind(document)
    let created = 0
    document.createElement = ((...args: Parameters<typeof document.createElement>) => {
      created++
      return originalCreate(...args)
    }) as typeof document.createElement
    document.createElementNS = ((...args: Parameters<typeof document.createElementNS>) => {
      created++
      return originalCreateNS(...args)
    }) as typeof document.createElementNS
    try {
      for (let i = 1; i <= 30; i++) {
        flow.viewport.set({ x: i, y: -i, zoom: 1 + i / 100 })
      }
    } finally {
      document.createElement = originalCreate
      document.createElementNS = originalCreateNS
    }

    // Pre-fix this was ~(nodes + edges + layers) PER WRITE (hundreds here,
    // thousands at real graph sizes). A viewport-only change builds nothing.
    expect(created).toBe(0)
  })
})
