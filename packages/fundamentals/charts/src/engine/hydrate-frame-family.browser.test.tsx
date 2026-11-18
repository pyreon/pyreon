// The family host (pie, sankey, treemap and every other non-plot chart) has
// the same server first frame as the plot host (`hydrate-frame.browser.test.tsx`):
// a `data-pyreon-chart-frame` sibling after the canvas, removed once the canvas
// paints. In real Chromium the canvas paints DURING hydration, so the frame's
// ref runs after the paint. Removing the element from inside its own ref, while
// the hydration walk is still on it, left the walk with no next sibling: a
// mismatch, and the tooltip, live region and accessible table mounted a second
// time beside the server's.
//
// Server-shaped markup comes from a client mount whose canvas cannot paint
// (see the plot-host test for why `renderToString` cannot run in the page).
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { hydrateRoot, mount, onHydrationMismatch } from '@pyreon/runtime-dom'
import { PieChart } from './PieChart'
import { SankeyChart } from './SankeyChart'
import type { SankeyLink, SankeyNode } from './sankey'

interface Slice { label: string; v: number }
const SLICES: Slice[] = [{ label: 'a', v: 3 }, { label: 'b', v: 6 }, { label: 'c', v: 4 }]
const NODES: SankeyNode[] = [{ name: 'Coal' }, { name: 'Power' }, { name: 'Homes' }]

const LINKS: SankeyLink[] = [
  { source: 'Coal', target: 'Power', value: 10 },
  { source: 'Power', target: 'Homes', value: 8 },
]

const CASES: [string, () => VNode][] = [
  ['PieChart', () => h(() => PieChart<Slice>({ data: SLICES, value: (d) => d.v, label: (d) => d.label, title: 'T', height: 180, animate: false, tooltip: true }), null)],
  ['SankeyChart', () => h(() => SankeyChart({ nodes: NODES, links: LINKS, title: 'T', height: 180, animate: false, tooltip: true }), null)],
]

describe('family host: server first frame → hydrate (real browser)', () => {
  it.each(CASES)('%s adopts the server markup and drops the frame once painted, with no mismatch or duplicate', async (_name, tree) => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof getContext
    const scratch = document.createElement('div')
    document.body.appendChild(scratch)
    const unmount = mount(tree() as never, scratch)
    const html = scratch.innerHTML
    unmount()
    scratch.remove()
    HTMLCanvasElement.prototype.getContext = getContext
    expect(html, 'no first-frame element in the server-shaped markup').toContain('data-pyreon-chart-frame')
    const el = document.createElement('div')
    el.style.width = '480px'
    document.body.appendChild(el)
    el.innerHTML = html
    const canvasBefore = el.querySelector('canvas')
    const mismatches: string[] = []
    const off = onHydrationMismatch((info) => mismatches.push(JSON.stringify(info)))
    const cleanup = hydrateRoot(el, tree() as never)
    off()
    await new Promise((r) => requestAnimationFrame(() => r(null)))

    expect(el.querySelector('canvas'), 'the server canvas was replaced').toBe(canvasBefore)
    expect(el.querySelectorAll('[data-pyreon-chart-tooltip]').length, 'tooltip mounted twice').toBe(1)
    expect(el.querySelectorAll('[role="status"]').length, 'live region mounted twice').toBe(1)
    expect(el.querySelectorAll('table').length, 'accessible table mounted twice').toBe(1)
    expect(el.querySelector('[data-pyreon-chart-frame]'), 'the first frame outlived the paint').toBeNull()
    expect(mismatches, 'hydration mismatches').toEqual([])
    cleanup()
    el.remove()
  })
})
