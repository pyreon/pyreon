import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'

/**
 * Layout verified through the RENDER path, in a real browser.
 *
 * The engine's own suite asserts the maths — no overlaps, layer ordering,
 * honoured spacing — on the returned `{ x, y }` values. That is not the same
 * as the diagram being right: `flow.layout()` measures each node's real
 * rendered box, writes positions back through signals, and the DOM applies
 * them as transforms. Any of those steps can be wrong while the arithmetic is
 * perfect.
 *
 * This is also the check that was missing when the engine replaced elkjs:
 * every number was measured and nothing had been LOOKED at.
 *
 * NOTE: `{ animate: false }` is load-bearing. `flow.layout()` ANIMATES by
 * default over 300ms, so awaiting it returns once the animation has STARTED —
 * assertions made straight after read a half-finished transition. The first
 * draft of this suite did exactly that and produced two tests that passed for
 * the wrong reason.
 */
const NODE_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

function makeFlow() {
  return createFlow({
    nodes: NODE_IDS.map((id) => ({ id, position: { x: 0, y: 0 }, data: { label: id } })),
    edges: [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'c' },
      { id: 'e3', source: 'b', target: 'd' },
      { id: 'e4', source: 'b', target: 'e' },
      { id: 'e5', source: 'c', target: 'f' },
      { id: 'e6', source: 'c', target: 'g' },
    ],
  })
}

/** Rendered boxes, read from the real DOM rather than from the layout result. */
function renderedBoxes(container: HTMLElement): Array<{ id: string; r: DOMRect }> {
  return [...container.querySelectorAll('.pyreon-flow-node')].map((el) => ({
    id: el.getAttribute('data-nodeid') ?? '',
    r: el.getBoundingClientRect(),
  }))
}

function overlapping(boxes: Array<{ id: string; r: DOMRect }>): string[] {
  const bad: string[] = []
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!.r
      const b = boxes[j]!.r
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
        bad.push(`${boxes[i]!.id}/${boxes[j]!.id}`)
    }
  return bad
}

describe('layout through the render path (real Chromium)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lays a tree out with no node visually overlapping another', async () => {
    const flow = makeFlow()
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    await flow.layout('layered', { animate: false })
    await flush()

    const boxes = renderedBoxes(container)
    expect(boxes).toHaveLength(NODE_IDS.length)
    // Every node must have a real rendered box — a zero-size node would make
    // the overlap check vacuously pass.
    for (const b of boxes) expect(b.r.width).toBeGreaterThan(0)
    expect(overlapping(boxes)).toEqual([])
    unmount()
  })

  it('puts children BELOW their parent on screen, not merely in the data', async () => {
    const flow = makeFlow()
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    await flow.layout('layered', { animate: false })
    await flush()

    const box = new Map(renderedBoxes(container).map((b) => [b.id, b.r]))
    expect(box.get('b')!.top).toBeGreaterThan(box.get('a')!.top)
    expect(box.get('d')!.top).toBeGreaterThan(box.get('b')!.top)
    unmount()
  })

  it('RIGHT direction lays out across the screen instead of down it', async () => {
    const flow = makeFlow()
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    await flow.layout('layered', { direction: 'RIGHT', animate: false })
    await flush()

    const box = new Map(renderedBoxes(container).map((b) => [b.id, b.r]))
    expect(box.get('b')!.left).toBeGreaterThan(box.get('a')!.left)
    expect(Math.abs(box.get('b')!.top - box.get('a')!.top)).toBeLessThan(
      Math.abs(box.get('b')!.left - box.get('a')!.left),
    )
    unmount()
  })

  it('every algorithm renders without overlap — the switch a user actually makes', async () => {
    for (const algo of ['layered', 'tree', 'force', 'stress', 'radial', 'box', 'rectpacking'] as const) {
      const flow = makeFlow()
      const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
      await flush()
      await flow.layout(algo, { animate: false })
      await flush()

      const boxes = renderedBoxes(container)
      expect(boxes, `${algo} rendered no nodes`).toHaveLength(NODE_IDS.length)
      expect(overlapping(boxes), `${algo} overlapped`).toEqual([])
      unmount()
      document.body.innerHTML = ''
    }
  })

  it('measures the REAL box — a tall node pushes the next layer further down', async () => {
    // `flow.layout()` feeds each node's measured size to the engine. If it fed
    // the 150x40 default instead, a 200px-tall node would be overlapped by the
    // layer beneath it.
    const flow = createFlow({
      nodes: [
        { id: 'tall', position: { x: 0, y: 0 }, height: 200, data: { label: 'tall' } },
        { id: 'below', position: { x: 0, y: 0 }, data: { label: 'below' } },
      ],
      edges: [{ id: 'e', source: 'tall', target: 'below' }],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    await flow.layout('layered', { animate: false })
    await flush()

    const box = new Map(renderedBoxes(container).map((b) => [b.id, b.r]))
    expect(box.get('below')!.top).toBeGreaterThanOrEqual(box.get('tall')!.bottom)
    unmount()
  })
})
