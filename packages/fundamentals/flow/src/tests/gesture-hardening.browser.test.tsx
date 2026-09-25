/**
 * Real-Chromium locks for the canvas gesture state machine (audit 2026-09):
 *
 *  - an OS-interrupted gesture (`pointercancel` / `lostpointercapture`) ENDS
 *    the gesture — later moves of the same pointer id must not keep dragging;
 *  - a SECOND pointer (a second finger) arriving mid-gesture neither starts a
 *    pan nor drives the active drag;
 *  - redo accepts Ctrl+Shift+Z whatever case `e.key` reports ('Z' with Shift
 *    on Windows / Linux) and Ctrl+Y;
 *  - `onConnect` fires from a real handle drag (the gesture path it is now
 *    reserved for);
 *  - one ResizeObserver delivery covering several nodes commits their
 *    measurements in ONE notify pass (reads first, writes batched).
 */
import { h } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { Handle } from '../components/handle'
import { MiniMap } from '../components/minimap'
import { createFlow } from '../flow'
import type { Connection, NodeComponentProps } from '../types'

function HandledNode(props: NodeComponentProps) {
  return h('div', { style: 'position: relative; width: 150px; height: 40px; background: #eee;' }, [
    h(Handle, { type: 'target', position: 'left' as never }),
    h('span', {}, () => props.id),
    h(Handle, { type: 'source', position: 'right' as never }),
  ])
}

function pev(type: string, x: number, y: number, pointerId = 1, pointerType = 'mouse') {
  return new PointerEvent(type, {
    pointerId,
    pointerType,
    isPrimary: pointerId === 1,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    bubbles: true,
    cancelable: true,
  })
}

function setup() {
  const flow = createFlow({
    nodes: [
      { id: 'a', type: 'h', position: { x: 20, y: 20 }, data: {} },
      { id: 'b', type: 'h', position: { x: 320, y: 220 }, data: {} },
    ],
    edges: [],
  })
  const mounted = mountInBrowser(
    h(
      'div',
      { style: 'width: 800px; height: 600px; position: relative;' },
      h(Flow, { instance: flow, nodeTypes: { h: HandledNode } }),
    ),
  )
  flow.containerSize.set({ width: 800, height: 600 })
  const canvas = mounted.container.querySelector<HTMLElement>('.pyreon-flow')!
  // Synthetic pointers other than the mouse (id 1) are not ACTIVE pointers to
  // the browser, so a real `setPointerCapture(2)` would throw NotFoundError —
  // noise unrelated to what these specs assert. Capture is a no-op here.
  canvas.setPointerCapture = () => {}
  return { flow, canvas, ...mounted }
}

function nodeCenter(container: HTMLElement, id: string) {
  const el = container.querySelector<HTMLElement>(`[data-nodeid="${id}"] span`)!
  const r = el.getBoundingClientRect()
  return { el, x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

describe('flow gesture hardening (real Chromium)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  for (const ending of ['pointercancel', 'lostpointercapture'] as const) {
    it(`a ${ending} ends a node drag — later moves of that pointer do not drag`, async () => {
      const { flow, canvas, container, unmount } = setup()
      await flush()
      const ends: string[] = []
      flow.onNodeDragEnd((node) => ends.push(node.id))
      const a = nodeCenter(container, 'a')
      a.el.dispatchEvent(pev('pointerdown', a.x, a.y))
      canvas.dispatchEvent(pev('pointermove', a.x + 30, a.y))
      await flush()
      const moved = flow.getNode('a')!.position.x
      expect(moved).toBeGreaterThan(20)

      canvas.dispatchEvent(pev(ending, a.x + 30, a.y))
      expect(ends).toEqual(['a'])
      canvas.dispatchEvent(pev('pointermove', a.x + 200, a.y + 100))
      await flush()
      expect(flow.getNode('a')!.position.x).toBe(moved)
      unmount()
    })
  }

  it('a cancelled connection draw leaves no edge and reports connectEnd(null)', async () => {
    const { flow, canvas, container, unmount } = setup()
    await flush()
    const ends: Array<Connection | null> = []
    flow.onConnectEnd((c) => ends.push(c))
    const src = container.querySelector<HTMLElement>(
      '[data-nodeid="a"] .pyreon-flow-handle-source',
    )!
    const r = src.getBoundingClientRect()
    src.dispatchEvent(pev('pointerdown', r.left + r.width / 2, r.top + r.height / 2))
    canvas.dispatchEvent(pev('pointermove', 300, 300))
    expect(container.querySelector('.pyreon-flow-connection-line')).toBeTruthy()
    canvas.dispatchEvent(pev('pointercancel', 300, 300))
    await flush()
    expect(container.querySelector('.pyreon-flow-connection-line')).toBeNull()
    expect(ends).toEqual([null])
    expect(flow.edges()).toHaveLength(0)
    unmount()
  })

  it('a second pointer during a node drag neither pans nor drives the drag', async () => {
    const { flow, canvas, container, unmount } = setup()
    await flush()
    const a = nodeCenter(container, 'a')
    a.el.dispatchEvent(pev('pointerdown', a.x, a.y, 1, 'touch'))
    const vp = { ...flow.viewport() }

    // Second finger lands on empty canvas and moves.
    canvas.dispatchEvent(pev('pointerdown', 600, 500, 2, 'touch'))
    canvas.dispatchEvent(pev('pointermove', 700, 580, 2, 'touch'))
    await flush()
    expect(flow.viewport()).toEqual(vp)
    expect(flow.getNode('a')!.position).toEqual({ x: 20, y: 20 })

    // The first finger still drags.
    canvas.dispatchEvent(pev('pointermove', a.x + 40, a.y, 1, 'touch'))
    await flush()
    expect(flow.getNode('a')!.position.x).toBeGreaterThan(20)
    canvas.dispatchEvent(pev('pointerup', a.x + 40, a.y, 1, 'touch'))
    unmount()
  })

  it('redo accepts Ctrl+Shift+Z (key "Z") and Ctrl+Y', async () => {
    const { flow, canvas, unmount } = setup()
    await flush()
    flow.addNode({ id: 'c', position: { x: 0, y: 300 }, data: {} })
    flow.addNode({ id: 'd', position: { x: 0, y: 400 }, data: {} })
    const key = (init: KeyboardEventInit) =>
      canvas.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
      )

    key({ key: 'z', ctrlKey: true })
    key({ key: 'z', ctrlKey: true })
    expect(flow.nodes()).toHaveLength(2)
    // Windows / Linux report the SHIFTED key.
    key({ key: 'Z', ctrlKey: true, shiftKey: true })
    expect(flow.nodes()).toHaveLength(3)
    key({ key: 'y', ctrlKey: true })
    expect(flow.nodes()).toHaveLength(4)
    unmount()
  })

  it('a real handle drag fires onConnect exactly once', async () => {
    const { flow, canvas, container, unmount } = setup()
    await flush()
    const seen: Connection[] = []
    flow.onConnect((c) => seen.push(c))
    const src = container.querySelector<HTMLElement>(
      '[data-nodeid="a"] .pyreon-flow-handle-source',
    )!
    const tgt = container.querySelector<HTMLElement>(
      '[data-nodeid="b"] .pyreon-flow-handle-target',
    )!
    const s = src.getBoundingClientRect()
    const t = tgt.getBoundingClientRect()
    src.dispatchEvent(pev('pointerdown', s.left + s.width / 2, s.top + s.height / 2))
    canvas.dispatchEvent(pev('pointermove', t.left + t.width / 2, t.top + t.height / 2))
    canvas.dispatchEvent(pev('pointerup', t.left + t.width / 2, t.top + t.height / 2))
    await flush()
    expect(flow.edges()).toHaveLength(1)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ source: 'a', target: 'b' })
    unmount()
  })

  it('a ResizeObserver delivery for several nodes commits in ONE notify pass', async () => {
    const { flow, container, unmount } = setup()
    await flush()
    const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
    await raf()
    await raf()
    let runs = 0
    const e = effect(() => {
      flow.measurements()
      runs++
    })
    const before = runs
    for (const id of ['a', 'b']) {
      const inner = container.querySelector<HTMLElement>(`[data-nodeid="${id}"] > div`)!
      inner.style.width = '220px'
    }
    await expect.poll(() => flow.measurements.peek().get('b')?.width, { timeout: 2000 }).toBe(220)
    expect(flow.measurements.peek().get('a')?.width).toBe(220)
    // Both nodes resized in the same frame → one observer callback → ONE batch.
    expect(runs - before).toBe(1)
    e.dispose()
    unmount()
  })

  it('a pointercancel ends a MiniMap pan — later moves of that pointer do not pan', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 600, y: 400 }, data: {} },
      ],
    })
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { style: 'width: 800px; height: 600px; position: relative;' },
        h(Flow, { instance: flow }, h(MiniMap, {})),
      ),
    )
    flow.containerSize.set({ width: 800, height: 600 })
    await flush()
    const mini = container.querySelector<HTMLElement>('.pyreon-flow-minimap')!
    mini.setPointerCapture = () => {}
    const r = mini.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    mini.dispatchEvent(pev('pointerdown', x, y))
    mini.dispatchEvent(pev('pointercancel', x, y))
    const vp = { ...flow.viewport() }
    mini.dispatchEvent(pev('pointermove', x + 30, y + 30))
    await flush()
    expect(flow.viewport()).toEqual(vp)
    unmount()
  })
})
