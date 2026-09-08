/**
 * Real-Chromium half of the flow accessibility suite: focus order, the
 * `:focus-visible` ring, and a keyboard move landing in the rendered
 * transform. happy-dom cannot answer any of these (no focus-visible, no
 * computed style, no real tab order).
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'
import { flowStyles } from '../styles'

describe('flow accessibility in real browser', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.querySelector('#flow-a11y-styles')?.remove()
  })

  function setup() {
    const style = document.createElement('style')
    style.id = 'flow-a11y-styles'
    style.textContent = flowStyles
    document.head.appendChild(style)
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: 'b', position: { x: 200, y: 0 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    })
    const mounted = mountInBrowser(h(Flow, { instance: flow }))
    return { flow, ...mounted }
  }

  it('nodes and the edge are in the tab order after the canvas', async () => {
    const { container, unmount, flow } = setup()
    await flush()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    const a = container.querySelector<HTMLElement>('[data-nodeid="a"]')!
    const path = container.querySelector<SVGPathElement>('path.pyreon-flow-edge-path')!
    canvas.focus()
    expect(document.activeElement).toBe(canvas)
    a.focus()
    expect(document.activeElement).toBe(a)
    path.focus()
    // Bisect: revert the lowercase `tabindex` spread to a JSX `tabIndex` prop
    // → Chromium ignores the camelCase attribute on SVG and focus() is a no-op.
    expect(document.activeElement).toBe(path)
    expect(flow.selectedEdges()).toEqual([])
    unmount()
  })

  it('keyboard focus draws the themed :focus-visible ring on a node', async () => {
    const { container, unmount } = setup()
    await flush()
    const a = container.querySelector<HTMLElement>('[data-nodeid="a"]')!
    // Programmatic focus with no prior pointer interaction matches
    // :focus-visible in Chromium (the last input modality is not pointer).
    a.focus()
    await flush()
    expect(a.matches(':focus-visible')).toBe(true)
    const outline = getComputedStyle(a).outlineStyle
    // Bisect: remove the `.pyreon-flow-node:focus-visible` rule → 'none'.
    expect(outline).not.toBe('none')
    expect(getComputedStyle(a).outlineColor).toBe('rgb(59, 130, 246)')
    unmount()
  })

  it('an arrow key press moves the focused node in the rendered transform', async () => {
    const { container, unmount, flow } = setup()
    await flush()
    const a = container.querySelector<HTMLElement>('[data-nodeid="a"]')!
    const path = container.querySelector<SVGPathElement>('path.pyreon-flow-edge-path')!
    const before = path.getAttribute('d')!
    a.focus()
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    await flush()
    expect(flow.getNode('a')!.position).toEqual({ x: 10, y: 0 })
    expect(a.style.transform).toBe('translate(10px, 0px)')
    // Edge geometry followed the MEASURED node: the source anchor sits at the
    // node's right edge, i.e. x = 10 + its real rendered width.
    const d = path.getAttribute('d')!
    expect(d).not.toBe(before)
    expect(d.startsWith(`M${10 + a.offsetWidth},`)).toBe(true)
    unmount()
  })
})
