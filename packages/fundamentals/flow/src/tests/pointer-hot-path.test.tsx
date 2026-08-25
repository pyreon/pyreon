/**
 * P8 — pointer-gesture hot paths:
 *   • ONE shared ResizeObserver for all node wrappers (was one PER node).
 *   • The container rect is cached per gesture — rubber-band / connection
 *     pointermoves never call getBoundingClientRect (was one forced-layout
 *     read per move); the cache invalidates on a container resize.
 *   • A drag frame is ONE batched reactive drain, and the helper-line write
 *     is value-gated (unchanged guides write nothing).
 *   • The selection box + helper-line svg are statically mounted and patch in
 *     place (they were reactive accessors re-creating their elements per
 *     move/guide change).
 *   • Controls buttons survive a zoom change (the zoom % lives in an inner
 *     text thunk; the mount accessor reads no signals).
 *
 * Bisect notes per spec are inline.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Controls } from '../components/controls'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'

function grid(n: number) {
  return createFlow({
    nodes: Array.from({ length: n }, (_, i) => ({
      id: 'n' + i,
      position: { x: (i % 6) * 250, y: Math.floor(i / 6) * 250 },
      data: {},
    })),
  })
}

function pev(type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  const Ctor = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent
  return new Ctor(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    isPrimary: true,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    buttons: 1,
    ...extra,
  } as PointerEventInit)
}

describe('pointer hot paths (P8)', () => {
  let cleanups: Array<() => void> = []
  beforeEach(() => {
    // happy-dom may lack pointer-capture APIs — stub as no-ops.
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>
    if (typeof proto.setPointerCapture !== 'function') proto.setPointerCapture = () => {}
    if (typeof proto.releasePointerCapture !== 'function') proto.releasePointerCapture = () => {}
  })
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
  })

  it('mounts ONE shared ResizeObserver for all node wrappers (+1 for the container)', () => {
    // Bisect: revert NodeLayer to a per-node `new ResizeObserver(measure)` →
    // constructions = N + 1, this fails.
    const OrigRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    let constructions = 0
    let observed = 0
    class CountingRO {
      constructor(_cb: unknown) {
        constructions++
      }
      observe() {
        observed++
      }
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = CountingRO
    try {
      const flow = grid(30)
      const { cleanup } = mountReactive(h(Flow, { instance: flow }))
      cleanups.push(cleanup)
      expect(constructions).toBe(2) // container + ONE shared node observer
      expect(observed).toBe(31) // every wrapper is still observed
      flow.dispose()
    } finally {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = OrigRO
    }
  })

  it('rubber-band pointermoves never call getBoundingClientRect (gesture-rect cache)', () => {
    // Bisect: revert the sel branch to a per-move `container.getBoundingClientRect()`
    // → count = MOVES, this fails.
    const flow = grid(6)
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow }))
    cleanups.push(cleanup)
    const flowEl = container.querySelector<HTMLElement>('.pyreon-flow')!
    flowEl.dispatchEvent(pev('pointerdown', 5, 5, { shiftKey: true }))

    const orig = Element.prototype.getBoundingClientRect
    let calls = 0
    Element.prototype.getBoundingClientRect = function (...a: unknown[]) {
      calls++
      return (orig as () => DOMRect).apply(this)
    }
    try {
      for (let i = 0; i < 15; i++) flowEl.dispatchEvent(pev('pointermove', 6 + i, 6 + i))
    } finally {
      Element.prototype.getBoundingClientRect = orig
    }
    expect(calls).toBe(0)
    flowEl.dispatchEvent(pev('pointerup', 30, 30))
    flow.dispose()
  })

  it('a drag frame is ONE reactive write when guides are unchanged (value-gated helper lines)', () => {
    // Bisect: revert the drag branch's batch + value gate → 2 signal writes
    // per frame (helperLines object + nodes), this fails.
    // TWO nodes, far apart in BOTH axes → no snap guide can fire during the
    // small drag below, so the helper-line signal must stay untouched.
    const flow = createFlow({
      nodes: [
        { id: 'n0', position: { x: 0, y: 0 }, data: {} },
        { id: 'n1', position: { x: 2000, y: 2000 }, data: {} },
      ],
    })
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow }))
    cleanups.push(cleanup)
    const nodeEl = container.querySelector<HTMLElement>('[data-nodeid="n0"]')!
    const flowEl = container.querySelector<HTMLElement>('.pyreon-flow')!

    nodeEl.dispatchEvent(pev('pointerdown', 10, 10))
    flowEl.dispatchEvent(pev('pointermove', 12, 12)) // warm frame

    const counts: Record<string, number> = {}
    ;(globalThis as { __pyreon_count__?: (n: string) => void }).__pyreon_count__ = (
      name: string,
    ) => {
      counts[name] = (counts[name] ?? 0) + 1
    }
    try {
      for (let i = 0; i < 10; i++) flowEl.dispatchEvent(pev('pointermove', 14 + i, 14 + i))
    } finally {
      delete (globalThis as { __pyreon_count__?: unknown }).__pyreon_count__
    }
    flowEl.dispatchEvent(pev('pointerup', 40, 40))
    expect(counts['reactivity.signalWrite']).toBe(10) // nodes write only, 1/frame
    flow.dispose()
  })

  it('the drag uses a precomputed snap session — getSnapLines is NOT called per move (P5)', () => {
    // Bisect: revert the drag branch to `instance.getSnapLines(drag.nodeId,
    // rawPos)` → getSnapLines fires once per pointermove, this fails.
    const flow = grid(4)
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow }))
    cleanups.push(cleanup)
    let sessionCreates = 0
    let legacyCalls = 0
    const origCreate = flow._createSnapSession
    const origGet = flow.getSnapLines
    ;(flow as { _createSnapSession: typeof origCreate })._createSnapSession = (...a) => {
      sessionCreates++
      return origCreate(...a)
    }
    ;(flow as { getSnapLines: typeof origGet }).getSnapLines = (...a) => {
      legacyCalls++
      return origGet(...a)
    }
    try {
      const nodeEl = container.querySelector<HTMLElement>('[data-nodeid="n0"]')!
      const flowEl = container.querySelector<HTMLElement>('.pyreon-flow')!
      nodeEl.dispatchEvent(pev('pointerdown', 10, 10))
      for (let i = 0; i < 8; i++) flowEl.dispatchEvent(pev('pointermove', 12 + i, 12 + i))
      flowEl.dispatchEvent(pev('pointerup', 30, 30))
    } finally {
      ;(flow as { _createSnapSession: typeof origCreate })._createSnapSession = origCreate
      ;(flow as { getSnapLines: typeof origGet }).getSnapLines = origGet
    }
    expect(sessionCreates).toBe(1) // once, at pointerdown
    expect(legacyCalls).toBe(0) // never on the per-move path
    flow.dispose()
  })

  it('selection box + helper-line svg are statically mounted and patch in place', () => {
    // Bisect: revert either back to a reactive child accessor → identity fails
    // (fresh element per move) or the pre-gesture query returns null.
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 300, y: 0 }, data: {}, width: 80 },
      ],
    })
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow }))
    cleanups.push(cleanup)
    const box = container.querySelector('.pyreon-flow-selection-box')!
    const guides = container.querySelector('svg[aria-label="helper lines"]')!
    expect(box).toBeTruthy()
    expect(guides).toBeTruthy()
    expect(box.getAttribute('style') ?? '').toContain('display: none')
    expect(guides.getAttribute('style') ?? '').toContain('display: none')

    const flowEl = container.querySelector<HTMLElement>('.pyreon-flow')!
    flowEl.dispatchEvent(pev('pointerdown', 5, 5, { shiftKey: true }))
    for (let i = 0; i < 5; i++) flowEl.dispatchEvent(pev('pointermove', 10 + i * 8, 10 + i * 4))
    // Same element, now visible with live geometry.
    expect(container.querySelector('.pyreon-flow-selection-box')).toBe(box)
    expect(box.getAttribute('style') ?? '').not.toContain('display: none')
    expect(box.getAttribute('style') ?? '').toContain('width:')
    flowEl.dispatchEvent(pev('pointerup', 42, 26))
    expect(container.querySelector('.pyreon-flow-selection-box')).toBe(box)
    expect(box.getAttribute('style') ?? '').toContain('display: none')

    // Helper lines: drag 'a' to within snap threshold of b's left edge.
    // b has explicit width 80 so ONLY its left-edge candidate matches at
    // x=299 (center/right targets are 265/230 — out of threshold), making the
    // reported guide line unambiguous.
    const nodeEl = container.querySelector<HTMLElement>('[data-nodeid="a"]')!
    nodeEl.dispatchEvent(pev('pointerdown', 0, 0))
    flowEl.dispatchEvent(pev('pointermove', 299, 40)) // raw x=299 → snaps to 300
    expect(container.querySelector('svg[aria-label="helper lines"]')).toBe(guides)
    expect(guides.getAttribute('style') ?? '').not.toContain('display: none')
    const vline = guides.querySelectorAll('line')[0]!
    expect(vline.getAttribute('x1')).toBe('300')
    flowEl.dispatchEvent(pev('pointerup', 299, 40))
    expect(guides.getAttribute('style') ?? '').toContain('display: none')
    flow.dispose()
  })

  it('Controls buttons survive a zoom change; the % text patches in place', () => {
    // Bisect: revert controls.tsx to computing zoomPercent in the outer
    // accessor → the button identity fails after zoomTo (remount per zoom).
    const flow = grid(2)
    const { container, cleanup } = mountReactive(
      h(Flow, { instance: flow }, h(Controls, {})),
    )
    cleanups.push(cleanup)
    const btn = container.querySelector('.pyreon-flow-controls button')
    expect(btn).toBeTruthy()
    flow.zoomTo(2)
    expect(container.querySelector('.pyreon-flow-controls button')).toBe(btn)
    expect(container.querySelector('.pyreon-flow-controls')!.textContent).toContain('200%')
    flow.dispose()
  })
})
