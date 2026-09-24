// `<CandlestickChart zoom>`: the slider and the inside gestures move the
// window, in real Chromium. Every `zoom` field is optional.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { CandlestickChart } from './CandlestickChart'
import type { CandlestickZoom } from './CandlestickChart'

interface Row { o: number; h: number; l: number; c: number }
const ROWS: Row[] = Array.from({ length: 120 }, (_, i) => ({ o: 100 + i, c: 101 + i, l: 99 + i, h: 102 + i }))
const ZOOM: CandlestickZoom = { window: { start: 0.5, end: 1.0 } }

function setup(zoom: CandlestickZoom = ZOOM) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const picks: number[] = []
  const un = mount(
    h(CandlestickChart<Row>, {
      data: ROWS,
      open: (d: Row) => d.o,
      high: (d: Row) => d.h,
      low: (d: Row) => d.l,
      close: (d: Row) => d.c,
      x: (_d: Row, i: number) => `D${i + 1}`,
      width: 640,
      height: 340,
      animate: false,
      zoom,
      onSelect: (i: number) => picks.push(i),
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
  const wheel = (x: number, y: number, deltaY: number) =>
    canvas.dispatchEvent(new WheelEvent('wheel', { clientX: r.left + x, clientY: r.top + y, deltaY, bubbles: true, cancelable: true }))
  return { un, root, picks, click, drag, wheel }
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
    // The strip sits ~20px above the bottom; its band is the right half.
    t.drag(470, 150, 340 - 22)
    t.click(340, 150)
    expect(t.picks.at(-1)).toBeLessThan(60)
    t.un()
    t.root.remove()
  })

  it('an empty zoom opens on every row, with the slider and inside gestures on', () => {
    const t = setup({})
    // The whole range is shown, so the left third of the plot is an early candle.
    t.click(150, 150)
    expect(t.picks.at(-1)).toBeLessThan(40)
    t.drag(200, 560, 150)
    t.click(150, 150)
    expect(t.picks.at(-1), 'a full window has nowhere to pan').toBeLessThan(40)
    t.un()
    t.root.remove()
  })

  it('the wheel zooms the window; `lock` fixes the span so it does not', () => {
    const pickAfterWheel = (zoom: CandlestickZoom): [number, number] => {
      const t = setup(zoom)
      t.click(100, 150)
      const before = t.picks.at(-1)!
      t.wheel(340, 150, -400)
      t.click(100, 150)
      const after = t.picks.at(-1)!
      t.un()
      t.root.remove()
      return [before, after]
    }
    const [free0, free1] = pickAfterWheel({})
    expect(free1, 'the wheel never zoomed an unlocked window').not.toBe(free0)
    const [lock0, lock1] = pickAfterWheel({ lock: true })
    expect(lock1, 'a locked window zoomed').toBe(lock0)
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
