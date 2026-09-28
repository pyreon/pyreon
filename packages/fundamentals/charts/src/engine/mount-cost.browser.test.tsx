// Two costs measured against uPlot / Chart.js: the accessible description
// walked every row through every accessor a SECOND time, and a large
// accessible table was laid out before the chart's first paint.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { PlotChart } from './Chart'
import { line } from './marks'

interface Row { i: number; v: number }

describe('first-mount cost', () => {
  it('each mark accessor runs once per row, not once for the frame and again for the description', async () => {
    const rows: Row[] = Array.from({ length: 500 }, (_, i) => ({ i, v: i % 17 }))
    let calls = 0
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(h(PlotChart<Row>, { data: rows, marks: [line((d: Row) => { calls++; return d.v })], width: 400, height: 200, animate: false }), root)
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toBe(rows.length)
    un()
    root.remove()
  })

  it('a large accessible table fills after the first paint; a small one at mount', async () => {
    const mk = (n: number): { root: HTMLElement; un: () => void } => {
      const root = document.createElement('div')
      document.body.appendChild(root)
      const data: Row[] = Array.from({ length: n }, (_, i) => ({ i, v: i }))
      const un = mount(h(PlotChart<Row>, { data, x: (d: Row) => String(d.i), marks: [line((d: Row) => d.v)], width: 400, height: 200, animate: false }), root)
      return { root, un }
    }
    const small = mk(50)
    expect(small.root.querySelectorAll('table tbody tr').length).toBe(50)
    const big = mk(1000)
    expect(big.root.querySelectorAll('table tbody tr').length).toBe(0)
    await new Promise((r) => setTimeout(r, 100))
    expect(big.root.querySelectorAll('table tbody tr').length).toBe(1000)
    small.un()
    big.un()
    small.root.remove()
    big.root.remove()
  })

  it('a data update to a large table is written after the next paint, once for a burst of updates', async () => {
    const data = signal<Row[]>(Array.from({ length: 1000 }, (_, i) => ({ i, v: i })))
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(h(PlotChart<Row>, { data: () => data(), x: (d: Row) => String(d.i), marks: [line((d: Row) => d.v)], width: 400, height: 200, animate: false, updateAnimation: false }), root)
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)))
    const firstValue = (): string | null => root.querySelector('table tbody tr td')!.textContent
    expect(firstValue()).toBe('0')
    let writes = 0
    const obs = new MutationObserver((m) => { writes += m.length })
    obs.observe(root.querySelector('table')!, { subtree: true, characterData: true, childList: true })
    data.set(Array.from({ length: 1000 }, (_, i) => ({ i, v: i + 1 })))
    data.set(Array.from({ length: 1000 }, (_, i) => ({ i, v: i + 2 })))
    // Still the old table in the update's own frame.
    expect(firstValue()).toBe('0')
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)))
    expect(firstValue()).toBe('2')
    obs.disconnect()
    // One write per changed cell, for the LATEST data only — not two passes.
    expect(writes).toBeLessThanOrEqual(1000 * 2)
    un()
    root.remove()
  })
})
