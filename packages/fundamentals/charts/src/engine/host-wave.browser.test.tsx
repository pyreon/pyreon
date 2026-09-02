import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { PlotChart } from './Chart'
import { bars } from './marks'

interface Row { k: string; v: number }
const rows: Row[] = [{ k: 'a', v: 1 }, { k: 'b', v: 3 }, { k: 'c', v: 2 }, { k: 'd', v: 4 }]
const inked = (c: HTMLCanvasElement): number => {
  const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('PlotChart host wave (real browser)', () => {
  it('keyboard: the canvas is focusable, arrows move a focus datum announced in a live region, Enter selects, Escape clears', async () => {
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart({ data: rows, x: (d: Row) => d.k, marks: [bars((d: Row) => d.v)], width: 400, height: 200, onSelect: (i) => picked.push(i), animate: false }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    expect(c.getAttribute('tabindex')).toBe('0')
    const live = container.querySelector('[role="status"]')!
    c.focus()
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flush()
    expect(live.textContent).toContain('b')
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(picked).toEqual([1])
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await flush()
    expect(live.textContent).toContain('d')
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(live.textContent).toBe('')
  })
  it('zoom presets: a click on a preset button narrows the window; "all" restores it', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart({ data: rows, x: (d: Row) => d.k, marks: [bars((d: Row) => d.v)], width: 400, height: 200, zoomPresets: [{ label: 'last 2', count: 2 }, { label: 'all', count: 0 }], animate: false }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    expect(c.getAttribute('data-pyreon-zoom')).toBe('all')
    const r = c.getBoundingClientRect()
    // Buttons sit in the bottom strip, right-aligned: "all" is the last one.
    const boxes = JSON.parse(c.getAttribute('data-pyreon-presets')!) as { x: number; y: number; w: number; h: number }[]
    expect(boxes).toHaveLength(2)
    const b0 = boxes[0]!
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + b0.x + b0.w / 2, clientY: r.top + b0.y + b0.h / 2, bubbles: true }))
    await flush()
    expect(c.getAttribute('data-pyreon-zoom')).toBe('0.500-1.000')
    const b1 = boxes[1]!
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + b1.x + b1.w / 2, clientY: r.top + b1.y + b1.h / 2, bubbles: true }))
    await flush()
    expect(c.getAttribute('data-pyreon-zoom')).toBe('all')
  })
  it('update animation: a data change of the same shape tweens to the new frame instead of snapping', async () => {
    const data = signal<Row[]>(rows)
    const { container } = mountInBrowser(() =>
      PlotChart({ data: () => data(), x: (d: Row) => d.k, marks: [bars((d: Row) => d.v)], width: 400, height: 200, animate: false }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    data.set(rows.map((d, i) => (i === 0 ? { ...d, v: 3.9 } : d)))
    await flush()
    // Only the first bar grows (1 → 3.9 under the unchanged max of 4), so ink rises monotonically through the tween;
    // tripling every value would re-scale the axis and paint the same picture.
    // The first frame after the change is t=0 (the OLD values, by design); sample a third of the way in.
    await wait(130)
    const mid = inked(c)
    await wait(700)
    const after = inked(c)
    expect(after).not.toBe(before)
    expect(mid).not.toBe(after)
    expect(mid).toBeGreaterThan(before)
    expect(after).toBeGreaterThan(mid)
    // The final frame matches a fresh mount of the new data.
    const fresh = mountInBrowser(() =>
      PlotChart({ data: rows.map((d, i) => (i === 0 ? { ...d, v: 3.9 } : d)), x: (d: Row) => d.k, marks: [bars((d: Row) => d.v)], width: 400, height: 200, animate: false }),
    )
    await flush()
    expect(inked(fresh.container.querySelector('canvas')!)).toBe(after)
  })
})
