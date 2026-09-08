/**
 * Keyboard + screen-reader accessibility of <Flow> (W2 of the 2026-09 flow
 * audit). Each spec names its bisect. Real-Chromium focus behaviour
 * (:focus-visible, Tab order) lives in a11y.browser.test.tsx — happy-dom does
 * not model focus-visible.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { Background } from '../components/background'
import { Controls } from '../components/controls'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'
import { flowStyles } from '../styles'
import type { FlowConfig } from '../types'

function make(config: Partial<FlowConfig> = {}) {
  return createFlow({
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 200, y: 0 }, data: {}, focusable: false, ariaLabel: 'Second' },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
    ...config,
  })
}

function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(ev)
  return ev
}

describe('flow accessibility', () => {
  let cleanups: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
  })
  function mount(flow: ReturnType<typeof make>, children?: unknown) {
    const r = mountReactive(h(Flow, { instance: flow }, children as never))
    cleanups.push(r.cleanup, () => flow.dispose())
    return r.container
  }

  it('nodes are focus stops by default; focusable:false / nodesFocusable:false opt out', () => {
    // Bisect: drop the node `tabIndex` thunk in NodeLayer → both read null.
    const c = mount(make())
    expect(c.querySelector('[data-nodeid="a"]')!.getAttribute('tabindex')).toBe('0')
    expect(c.querySelector('[data-nodeid="b"]')!.getAttribute('tabindex')).toBe('-1')
    const c2 = mount(make({ nodesFocusable: false }))
    expect(c2.querySelector('[data-nodeid="a"]')!.getAttribute('tabindex')).toBe('-1')
  })

  it('a node carries role, roledescription, its ariaLabel, and instructions that resolve', () => {
    const c = mount(make())
    const a = c.querySelector('[data-nodeid="a"]')!
    const b = c.querySelector('[data-nodeid="b"]')!
    expect(a.getAttribute('role')).toBe('group')
    expect(a.getAttribute('aria-roledescription')).toBe('node')
    expect(a.hasAttribute('aria-label')).toBe(false)
    expect(b.getAttribute('aria-label')).toBe('Second')
    const descId = a.getAttribute('aria-describedby')!
    expect(descId).toBeTruthy()
    const desc = c.querySelector(`#${CSS.escape(descId)}`)!
    expect(desc.textContent).toContain('arrow keys')
    expect(desc.className).toContain('pyreon-flow-a11y-hidden')
  })

  it('Enter / Space select the focused node; Shift adds to the selection', () => {
    // Bisect: drop the Enter/Space branch of handleNodeKeyDown → nothing selected.
    const flow = make()
    const c = mount(flow)
    const a = c.querySelector('[data-nodeid="a"]')!
    const b = c.querySelector('[data-nodeid="b"]')!
    const ev = key(a, 'Enter')
    expect(ev.defaultPrevented).toBe(true)
    expect(flow.selectedNodes()).toEqual(['a'])
    key(b, ' ', { shiftKey: true })
    expect(flow.selectedNodes().sort()).toEqual(['a', 'b'])
  })

  it('arrow keys move a node by 10 (Shift: 100) and record ONE history entry per press', () => {
    // Bisect: drop the ARROW branch → position stays {0,0} and default not prevented.
    const flow = make()
    const c = mount(flow)
    const a = c.querySelector('[data-nodeid="a"]')!
    expect(key(a, 'ArrowRight').defaultPrevented).toBe(true)
    expect(flow.getNode('a')!.position).toEqual({ x: 10, y: 0 })
    key(a, 'ArrowDown', { shiftKey: true })
    expect(flow.getNode('a')!.position).toEqual({ x: 10, y: 100 })
    key(a, 'ArrowDown', { repeat: true })
    expect(flow.getNode('a')!.position).toEqual({ x: 10, y: 110 })
    // Two non-repeat presses → two undo entries; the repeat frame added none.
    flow.undo()
    expect(flow.getNode('a')!.position).toEqual({ x: 10, y: 0 })
    flow.undo()
    expect(flow.getNode('a')!.position).toEqual({ x: 0, y: 0 })
    flow.undo()
    expect(flow.getNode('a')!.position).toEqual({ x: 0, y: 0 })
  })

  it('arrow keys do nothing on a non-draggable node, and keys from an inner input are ignored', () => {
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {}, draggable: false }],
    })
    const c = mount(flow)
    const a = c.querySelector('[data-nodeid="a"]')!
    expect(key(a, 'ArrowRight').defaultPrevented).toBe(false)
    expect(flow.getNode('a')!.position).toEqual({ x: 0, y: 0 })
    const input = document.createElement('input')
    a.appendChild(input)
    expect(key(input, 'Enter').defaultPrevented).toBe(false)
    expect(flow.selectedNodes()).toEqual([])
  })

  it('Delete still reaches the canvas handler from a focused node (bubbling)', () => {
    const flow = make()
    const c = mount(flow)
    const a = c.querySelector('[data-nodeid="a"]')!
    key(a, 'Enter')
    key(a, 'Delete')
    expect(flow.nodes().map((n) => n.id)).toEqual(['b'])
  })

  it('edges are focusable buttons with a name; Enter selects; focusable:false / edgesFocusable:false opt out', () => {
    // Bisect: drop the `tabindex` spread + onKeyDown on the edge path.
    const flow = make()
    const c = mount(flow)
    const path = c.querySelector('path.pyreon-flow-edge-path')!
    expect(path.getAttribute('tabindex')).toBe('0')
    expect(path.getAttribute('role')).toBe('button')
    expect(path.getAttribute('aria-label')).toBe('Edge from a to b')
    expect(c.querySelector(`#${CSS.escape(path.getAttribute('aria-describedby')!)}`)).toBeTruthy()
    expect(key(path, 'Enter').defaultPrevented).toBe(true)
    expect(flow.selectedEdges()).toEqual(['e1'])
    const c2 = mount(make({ edgesFocusable: false }))
    expect(c2.querySelector('path.pyreon-flow-edge-path')!.getAttribute('tabindex')).toBe('-1')
    const flow3 = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b', focusable: false, ariaLabel: 'Link' }],
    })
    const c3 = mount(flow3)
    const p3 = c3.querySelector('path.pyreon-flow-edge-path')!
    expect(p3.getAttribute('tabindex')).toBe('-1')
    expect(p3.getAttribute('aria-label')).toBe('Link')
  })

  it('the edges svg is a named group (role=img would hide the focusable paths)', () => {
    const c = mount(make())
    const svg = c.querySelector('svg.pyreon-flow-edges')!
    expect(svg.getAttribute('role')).toBe('group')
    expect(svg.getAttribute('aria-label')).toBe('Edges')
  })

  it('disableKeyboardA11y removes nodes and edges from the tab order and drops the instructions', () => {
    const c = mount(make({ disableKeyboardA11y: true }))
    expect(c.querySelector('[data-nodeid="a"]')!.getAttribute('tabindex')).toBe('-1')
    expect(c.querySelector('[data-nodeid="a"]')!.hasAttribute('aria-describedby')).toBe(false)
    expect(c.querySelector('path.pyreon-flow-edge-path')!.getAttribute('tabindex')).toBe('-1')
    expect(c.querySelectorAll('.pyreon-flow-a11y-hidden:not(.pyreon-flow-a11y-live)')).toHaveLength(0)
    // The canvas stays a focus stop for Delete / Escape / undo.
    expect(c.querySelector('.pyreon-flow')!.getAttribute('tabindex')).toBe('0')
  })

  it('the live region announces selection changes and keyboard moves, not the mount', () => {
    // Bisect: drop the selection effect → the region stays empty after selectNode.
    const flow = make()
    const c = mount(flow)
    const live = c.querySelector('.pyreon-flow-a11y-live')!
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toBe('')
    flow.selectNode('a')
    expect(live.textContent).toBe('1 node selected')
    flow.selectNode('b', true)
    flow.selectEdge('e1', true)
    expect(live.textContent).toBe('2 nodes and 1 edge selected')
    flow.clearSelection()
    expect(live.textContent).toBe('Selection cleared')
    key(c.querySelector('[data-nodeid="a"]')!, 'ArrowRight')
    expect(live.textContent).toBe('Moved node a to 10, 0')
  })

  it('the canvas has no inline outline:none; flowStyles themes :focus-visible and honours reduced motion', () => {
    // Bisect: restore `outline: none;` to containerStyle → first assertion fails.
    const c = mount(make())
    const canvas = c.querySelector<HTMLElement>('.pyreon-flow')!
    expect(canvas.style.outline).toBe('')
    expect(flowStyles).toContain('.pyreon-flow:focus-visible')
    expect(flowStyles).toContain('.pyreon-flow-node:focus-visible')
    expect(flowStyles).toContain('.pyreon-flow-edge-path:focus-visible')
    expect(flowStyles).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('decorative layers are aria-hidden; Controls buttons are named and the lock is a real toggle', () => {
    const flow = make()
    const c = mount(flow, [h(Background, {}), h(Controls, { showLock: true })])
    expect(c.querySelector('svg.pyreon-flow-background')!.getAttribute('aria-hidden')).toBe('true')
    expect(c.querySelector('svg.pyreon-flow-helper-lines')!.getAttribute('aria-hidden')).toBe('true')
    const buttons = [...c.querySelectorAll<HTMLButtonElement>('.pyreon-flow-controls button')]
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Zoom in',
      'Zoom out',
      'Fit view',
      'Lock the canvas',
    ])
    const lock = buttons[3]!
    // Bisect: restore the empty onClick → pressed stays 'false', pannable stays undefined.
    expect(lock.getAttribute('aria-pressed')).toBe('false')
    lock.click()
    expect(lock.getAttribute('aria-pressed')).toBe('true')
    expect(flow.config.pannable).toBe(false)
    expect(flow.config.zoomable).toBe(false)
    expect(flow.config.nodesDraggable).toBe(false)
    lock.click()
    expect(flow.config.pannable).toBe(true)
  })

  it('animateViewport jumps under prefers-reduced-motion (auto), animates when reducedMotion:false', () => {
    // Bisect: drop the `reducedMotion()` gate in animateViewport → the auto
    // arm reads the START viewport synchronously (the tween has not run).
    const orig = (globalThis as { matchMedia?: unknown }).matchMedia
    ;(globalThis as { matchMedia?: unknown }).matchMedia = (q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })
    try {
      const auto = make()
      auto.animateViewport({ x: 50, y: 60, zoom: 2 })
      expect(auto.viewport()).toEqual({ x: 50, y: 60, zoom: 2 })
      auto.dispose()
      const forced = make({ reducedMotion: true })
      forced.animateViewport({ x: 5, y: 6, zoom: 1.5 })
      expect(forced.viewport()).toEqual({ x: 5, y: 6, zoom: 1.5 })
      forced.dispose()
      const anim = make({ reducedMotion: false })
      anim.animateViewport({ x: 50, y: 60, zoom: 2 })
      expect(anim.viewport().x).not.toBe(50)
      anim.dispose()
    } finally {
      ;(globalThis as { matchMedia?: unknown }).matchMedia = orig
    }
  })
})
