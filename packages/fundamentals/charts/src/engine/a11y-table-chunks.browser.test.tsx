// The accessible table's rows sit in `content-visibility: auto` <tbody> blocks
// so an offscreen 1,000-row table costs a chart's first frame nothing to lay
// out (measured: a 1k-point PlotChart mount 12.5ms → 10.4ms against ECharts'
// flat 4.6ms). `auto`, unlike `hidden`, keeps skipped content in the
// accessibility tree — the table's only reader — so this checks the REAL
// Chromium AX tree over CDP, not just the DOM.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { cdp } from '@vitest/browser/context'
import { describe, expect, it } from 'vitest'
import { PlotChart } from './Chart'
import { line } from './marks'

interface Row { i: string; v: number }
const ROWS: Row[] = Array.from({ length: 1000 }, (_, i) => ({ i: `row${i}`, v: i }))

describe('the accessible table in content-visibility blocks', () => {
  it('splits rows into auto-visibility <tbody> blocks, every row present', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(h(PlotChart<Row>, { data: ROWS, x: (d: Row) => d.i, marks: [line((d: Row) => d.v)], width: 600, height: 300, animate: false }), root)
    const bodies = [...root.querySelectorAll('table tbody')] as HTMLElement[]
    expect(bodies.length).toBe(20)
    expect(bodies.every((b) => b.style.contentVisibility === 'auto')).toBe(true)
    expect(root.querySelectorAll('table tbody tr')).toHaveLength(1000)
    expect(root.querySelector('table tbody:last-of-type tr:last-child th')!.textContent).toBe('row999')
    un()
    root.remove()
  })

  it('a row in a skipped block is still in the accessibility tree', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(h(PlotChart<Row>, { data: ROWS, x: (d: Row) => d.i, marks: [line((d: Row) => d.v)], width: 600, height: 300, animate: false }), root)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const session = cdp() as unknown as { send: (m: string, p?: unknown) => Promise<unknown> }
    await session.send('Accessibility.enable')
    // The spec runs in an iframe of the runner page: read THAT frame's tree.
    type FrameTree = { frame: { id: string; url: string }; childFrames?: FrameTree[] }
    const { frameTree } = (await session.send('Page.getFrameTree')) as { frameTree: FrameTree }
    const all: FrameTree['frame'][] = []
    const walk = (t: FrameTree): void => {
      all.push(t.frame)
      for (const c of t.childFrames ?? []) walk(c)
    }
    walk(frameTree)
    const names: string[] = []
    for (const f of all) {
      const { nodes } = (await session.send('Accessibility.getFullAXTree', { frameId: f.id })) as { nodes: { name?: { value?: string }; ignored?: boolean }[] }
      for (const n of nodes) if (n.ignored !== true) names.push(n.name?.value ?? '')
    }
    // Negative control, run by hand: rendering the chunks `display:none` leaves
    // 21 names in these frames and no `row950`. (`content-visibility:hidden`
    // is NOT a usable control: Chromium keeps its rows in the tree as well.)
    expect(names).toContain('row950')
    un()
    root.remove()
  })
})
