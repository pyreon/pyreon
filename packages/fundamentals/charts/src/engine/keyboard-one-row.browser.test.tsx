// A keyboard focus move announces ONE row, so it must format one row. It used
// to build the chart's whole table — uncapped — per arrow key to read one row
// out of it: on a 100,000-point chart, 100,000 formatted rows per keystroke.
// Counted through the chart's `format`, which every table cell goes through.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { flush } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { PlotChart } from './Chart'
import { line } from './marks'

interface Row { i: string; v: number }
const N = 100_000
const ROWS: Row[] = Array.from({ length: N }, (_, i) => ({ i: `c${i}`, v: i }))

const key = (el: Element, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
}

describe('keyboard focus formats the focused row only', () => {
  it('an arrow key or End on a 100,000-point chart formats a handful of values, not the table', async () => {
    let calls = 0
    const format = (v: number): string => {
      calls++
      return `v${v}`
    }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(h(PlotChart<Row>, { data: ROWS, x: (d: Row) => d.i, marks: [line((d: Row) => d.v)], width: 600, height: 300, animate: false, format }), root)
    await flush()
    const canvas = root.querySelector('canvas')!
    const live = root.querySelector('[aria-live="polite"]')!

    calls = 0
    key(canvas, 'ArrowRight')
    await flush()
    expect(live.textContent).toBe('c0, v0')
    // Measured: 25 with the fix, 100,024 without it.
    expect(calls).toBeLessThan(100)

    calls = 0
    key(canvas, 'End')
    await flush()
    expect(live.textContent).toBe(`c${N - 1}, v${N - 1}`)
    expect(calls).toBeLessThan(100)

    un()
    root.remove()
  })
})
