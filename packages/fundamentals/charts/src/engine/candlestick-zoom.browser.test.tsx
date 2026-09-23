// A candlestick with ECharts' dataZoom: the slider and the inside gestures
// move the window, in real Chromium. Before, the window was fixed at the
// option's start / end and no slider was drawn.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { CandlestickChart } from './CandlestickChart'

interface Row { o: number; h: number; l: number; c: number }
const ROWS: Row[] = Array.from({ length: 120 }, (_, i) => ({ o: 100 + i, c: 101 + i, l: 99 + i, h: 102 + i }))
const ZOOM = { inside: true, slider: true, window: { start: 0.5, end: 1.0 }, keepY: false, lock: false, minSpan: 0.0, maxSpan: 1.0, wheel: true, move: true }

function setup() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const picks: number[] = []
  const un = mount(
    h(CandlestickChart<Row>, {
      data: ROWS,
      open: (d) => d.o,
      high: (d) => d.h,
      low: (d) => d.l,
      close: (d) => d.c,
      x: (_d, i) => `D${i + 1}`,
      width: 640,
      height: 340,
      animate: false,
      zoom: ZOOM,
      onSelect: (i) => picks.push(i),
    }),
    root,
  )
  const canvas = root.querySelector('canvas')!
  const r = canvas.getBoundingClientRect()
  const at = (x: number, y: number) => ({ clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true, isPrimary: true })
  const click = (x: number, y: number) => canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
  const drag = (x0: number, x1: number, y: number) => {
    canvas.dispatchEvent(new PointerEvent('pointerdown', at(x0, y)))
    for (let k = 1; k <= 8; k++) canvas.dispatchEvent(new PointerEvent('pointermove', at(x0 + ((x1 - x0) * k) / 8, y)))
    canvas.dispatchEvent(new PointerEvent('pointerup', at(x1, y)))
    // The click a browser fires on release, which the host swallows after a drag.
    canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + x1, clientY: r.top + y, bubbles: true }))
  }
  return { un, root, picks, click, drag }
}

describe('<CandlestickChart zoom>', () => {
  it('opens on the window, and a click reports a GLOBAL index', () => {
    const t = setup()
    t.click(340, 150)
    expect(t.picks.at(-1)).toBeGreaterThanOrEqual(60)
    t.un()
    t.root.remove()
  })

  it('dragging the slider band left moves the window to the earlier candles', () => {
    const t = setup()
    // The strip sits ~20px above the bottom (ECharts' slider box); its band is the right half.
    t.drag(470, 150, 340 - 22)
    t.click(340, 150)
    expect(t.picks.at(-1)).toBeLessThan(60)
    t.un()
    t.root.remove()
  })

  it('a drag inside the plot pans the window', () => {
    const t = setup()
    t.drag(200, 560, 150)
    t.click(340, 150)
    expect(t.picks.at(-1)).toBeLessThan(90)
    t.un()
    t.root.remove()
  })
})
