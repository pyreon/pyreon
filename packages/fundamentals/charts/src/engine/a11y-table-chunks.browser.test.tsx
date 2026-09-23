// The accessible table's rows go in 50-row <tbody> blocks, which builds a
// 1,000-row table ~1.7ms faster than one row group. The AX-tree spec guards the
// tempting next step: `content-visibility: auto` on the table's wrapper skips
// ~5ms of layout but makes Chromium drop every row from the accessibility tree
// (measured: 9 nodes left). The table's only reader is assistive technology,
// so this reads the REAL Chromium AX tree over CDP, not just the DOM.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { cdp } from '@vitest/browser/context'
import { describe, expect, it } from 'vitest'
import { PlotChart } from './Chart'
import { line } from './marks'

interface Row { i: string; v: number }
const ROWS: Row[] = Array.from({ length: 1000 }, (_, i) => ({ i: `row${i}`, v: i }))

describe('the accessible table in row blocks', () => {
  it('puts rows in 50-row <tbody> blocks, every row present', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(h(PlotChart<Row>, { data: ROWS, x: (d: Row) => d.i, marks: [line((d: Row) => d.v)], width: 600, height: 300, animate: false }), root)
    const bodies = [...root.querySelectorAll('table tbody')] as HTMLElement[]
    expect(bodies.length).toBe(20)
    expect(root.querySelectorAll('table tbody tr')).toHaveLength(1000)
    expect(root.querySelector('table tbody:last-of-type tr:last-child th')!.textContent).toBe('row999')
    un()
    root.remove()
  })

  it('every row is in the accessibility tree, as a table row', async () => {
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
      const { nodes } = (await session.send('Accessibility.getFullAXTree', { frameId: f.id })) as { nodes: { name?: { value?: string }; role?: { value?: string }; ignored?: boolean }[] }
      for (const n of nodes) if (n.ignored !== true) names.push(`${n.role?.value ?? ''}:${n.name?.value ?? ''}`)
    }
    // Negative controls, run by hand: `content-visibility: auto` on the wrapper
    // and `display: none` on the blocks each drop row950 from the tree.
    expect(names).toContain('rowheader:row950')
    expect(names).toContain('cell:950')
    un()
    root.remove()
  })
})
