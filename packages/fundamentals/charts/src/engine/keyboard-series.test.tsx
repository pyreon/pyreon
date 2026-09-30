// Up/Down pick a series, so a keyboard reader can follow one line across the
// chart instead of hearing every series at every point; the summary says by
// how much a series moved, not only which way.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { describeChart, describeDatum, percentChange } from './a11y'
import { PlotChart } from './Chart'
import { line } from './marks'

interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 100, b: 10 }, { m: 'Feb', a: 145, b: 8 }, { m: 'Mar', a: 320, b: 5 }]
const key = (el: Element, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20))

describe('keyboard: Up/Down step through the series', () => {
  it('announces the focused series datum, walks it with Left/Right, and wraps back to all series', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const un = mount(
      h(PlotChart<Row>, {
        data: ROWS,
        x: (d: Row) => d.m,
        marks: [line((d: Row) => d.a, { label: 'Revenue' }), line((d: Row) => d.b, { label: 'Churn' })],
        width: 400,
        height: 240,
        animate: false,
      }),
      root,
    )
    await tick()
    const canvas = root.querySelector('canvas')!
    const live = root.querySelector('[aria-live="polite"]')!

    key(canvas, 'ArrowRight')
    expect(live.textContent).toBe('Jan, 100, 10')
    key(canvas, 'ArrowDown')
    expect(live.textContent).toBe('Revenue: 100 at Jan, 1 of 3')
    key(canvas, 'ArrowRight')
    expect(live.textContent).toBe('Revenue: 145 at Feb, 2 of 3')
    key(canvas, 'ArrowDown')
    expect(live.textContent).toBe('Churn: 8 at Feb, 2 of 3')
    key(canvas, 'ArrowDown')
    expect(live.textContent).toBe('Feb, 145, 8')
    key(canvas, 'ArrowUp')
    expect(live.textContent).toBe('Churn: 8 at Feb, 2 of 3')
    key(canvas, 'Escape')
    key(canvas, 'ArrowRight')
    expect(live.textContent).toBe('Jan, 100, 10')

    un()
    root.remove()
  })
})

describe('the summary says how much, not only which way', () => {
  it('states a percentage under doubling and a multiple past it', () => {
    expect(percentChange(100, 145)).toBe('45%')
    expect(percentChange(10, 5)).toBe('50%')
    expect(percentChange(100, 320)).toBe('3.2×')
    const text = describeChart({ title: 'T', categories: ['Jan', 'Feb', 'Mar'], series: [{ label: 'Revenue', values: [100, 145, 320], kind: 'line' }, { label: 'Churn', values: [10, 8, 5], kind: 'line' }] })
    expect(text).toContain('Revenue, line: rising 3.2× from 100 to 320')
    expect(text).toContain('Churn, line: falling 50% from 10 to 5')
  })

  it('a zero or negative start has no honest percentage, so none is stated', () => {
    const text = describeChart({ categories: ['a', 'b'], series: [{ label: 'S', values: [0, 5], kind: 'line' }] })
    expect(text).toContain('S, line: rising from 0 to 5')
  })

  it('describeDatum reads a gap and ignores an out-of-range pick', () => {
    const input = { categories: ['a', 'b'], series: [{ label: 'S', values: [Number.NaN, 2], kind: 'line' }] }
    expect(describeDatum(input, 0, 0)).toBe('S: no value at a, 1 of 2')
    expect(describeDatum(input, 1, 0)).toBe('')
    expect(describeDatum(input, 0, 5)).toBe('')
  })
})
