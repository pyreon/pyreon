import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _resetFlowStylesWarning, Flow } from '../components/flow-component'
import { createFlow } from '../flow'
import { flowStyles } from '../styles'

// Two example apps rendered `<Flow>` without injecting `flowStyles`, and the
// screen-reader-only keyboard instructions ("Press Enter or Space to select
// the node…") were painted over the canvas: the visually-hidden rule lived
// ONLY in the optional stylesheet. Real Chromium, because "visible" is a
// layout question.

const graph = () =>
  createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [],
  })

afterEach(() => {
  document.body.innerHTML = ''
  for (const s of document.head.querySelectorAll('style[data-test-flow]')) s.remove()
  _resetFlowStylesWarning()
  vi.restoreAllMocks()
})

describe('<Flow> without flowStyles', () => {
  it('keeps the screen-reader text visually hidden (1x1, clipped) but in the accessibility tree', async () => {
    const { container, unmount } = mountInBrowser(h(Flow, { instance: graph() }))
    await flush()
    const hidden = [...container.querySelectorAll('.pyreon-flow-a11y-hidden')] as HTMLElement[]
    expect(hidden.length).toBeGreaterThanOrEqual(3)
    for (const el of hidden) {
      const r = el.getBoundingClientRect()
      expect(
        r.width <= 1 && r.height <= 1,
        `${el.textContent?.slice(0, 30)} is ${r.width}x${r.height}`,
      ).toBe(true)
      expect(getComputedStyle(el).clip).toBe('rect(0px, 0px, 0px, 0px)')
    }
    // still described for assistive tech
    expect(hidden[0]!.textContent).toContain('Press Enter or Space to select the node')
    unmount()
  })

  it('warns once per page that flowStyles is missing, and not at all when it is loaded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = mountInBrowser(h(Flow, { instance: graph() }))
    const b = mountInBrowser(h(Flow, { instance: graph() }))
    await flush()
    await Promise.resolve()
    const missing = warn.mock.calls.filter(([m]) =>
      String(m).includes('`flowStyles` stylesheet is not loaded'),
    )
    expect(missing).toHaveLength(1)
    a.unmount()
    b.unmount()

    _resetFlowStylesWarning()
    warn.mockClear()
    const style = document.createElement('style')
    style.setAttribute('data-test-flow', '')
    style.textContent = flowStyles
    document.head.appendChild(style)
    const c = mountInBrowser(h(Flow, { instance: graph() }))
    await flush()
    await Promise.resolve()
    expect(warn.mock.calls.filter(([m]) => String(m).includes('flowStyles'))).toHaveLength(0)
    c.unmount()
  })
})
