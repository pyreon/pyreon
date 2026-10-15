// A large accessible table is BUILT after the chart's first paint, not only
// written then. Its strings (one formatted value per cell, 1,000 rows) were
// ~100µs of a 10k-point chart's first frame for a table nobody reads before
// the next frame. A counting `format` observes the build: the table formats
// every cell, while the synchronous mount (axis ticks, the spoken summary)
// formats a handful of values.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { PlotChart } from './Chart'
import { line } from './marks'

interface Row { i: string; v: number }
const rowsOf = (n: number, k = 1): Row[] => Array.from({ length: n }, (_, i) => ({ i: `row${i}`, v: i * k }))
const afterPaint = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)))

describe('the accessible table is built after first paint', () => {
  it('formats no table cells during the synchronous mount, then fills every row', async () => {
    let calls = 0
    const format = (v: number): string => {
      calls++
      return String(v)
    }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(h(PlotChart<Row>, { data: rowsOf(1000), x: (d: Row) => d.i, marks: [line((d: Row) => d.v)], format, width: 600, height: 300, animate: false }), root)
    const sync = calls
    expect(sync).toBeLessThan(200)
    await afterPaint()
    expect(calls - sync).toBeGreaterThanOrEqual(1000)
    expect(root.querySelectorAll('table tbody tr')).toHaveLength(1000)
    un()
    root.remove()
  })

  it('still follows a data change and a title change', async () => {
    const data = signal(rowsOf(1000))
    const title = signal('First')
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(
      h(PlotChart<Row>, {
        data: () => data(),
        x: (d: Row) => d.i,
        marks: [line((d: Row) => d.v)],
        get title() {
          return title()
        },
        width: 600,
        height: 300,
        animate: false,
        updateAnimation: false,
      }),
      root,
    )
    await afterPaint()
    expect(root.querySelector('table tbody:last-of-type tr:last-child td')!.textContent).toBe('999')
    data.set(rowsOf(1000, 2))
    await afterPaint()
    expect(root.querySelector('table tbody:last-of-type tr:last-child td')!.textContent).toBe('1,998')
    title.set('Second')
    await afterPaint()
    expect(root.querySelector('table caption')!.textContent).toBe('Second')
    un()
    root.remove()
  })

  it('the spoken description of a large chart also waits for the first paint', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(h(PlotChart<Row>, { data: rowsOf(1000), x: (d: Row) => d.i, marks: [line((d: Row) => d.v)], title: 'Load', width: 600, height: 300, animate: false }), root)
    const canvas = root.querySelector('canvas')!
    expect(canvas.getAttribute('aria-label')).toBe('Load')
    await afterPaint()
    expect(canvas.getAttribute('aria-label')).toContain('rising')
    un()
    root.remove()
  })

  it('a small chart is described at mount', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(h(PlotChart<Row>, { data: rowsOf(20), x: (d: Row) => d.i, marks: [line((d: Row) => d.v)], title: 'Load', width: 600, height: 300, animate: false }), root)
    expect(root.querySelector('canvas')!.getAttribute('aria-label')).toContain('rising')
    un()
    root.remove()
  })
})
