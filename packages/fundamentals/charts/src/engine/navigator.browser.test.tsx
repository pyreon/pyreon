import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { PlotChart } from './Chart'
import { line } from './marks'

interface Row { k: string; v: number }
const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({ k: String(i), v: (i * 7) % 11 }))
const mouse = (el: Element, type: string, x: number, y: number) => el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))

describe('PlotChart navigator (real browser)', () => {
  it('drags the right handle to narrow the window, then drags the band to move it', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart({ data: rows, x: (d: Row) => d.k, marks: [line((d: Row) => d.v)], width: 400, height: 240, navigator: true, animate: false }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const nav = JSON.parse(c.getAttribute('data-pyreon-nav')!) as { x: number; y: number; w: number; h: number }
    expect(nav.w).toBeGreaterThan(100)
    expect(c.getAttribute('data-pyreon-zoom')).toBe('all')
    const r = c.getBoundingClientRect()
    const midY = r.top + nav.y + nav.h / 2
    // Right handle: from the strip's right edge, 100px to the left.
    mouse(c, 'mousedown', r.left + nav.x + nav.w, midY)
    mouse(c, 'mousemove', r.left + nav.x + nav.w - 100, midY)
    mouse(c, 'mouseup', r.left + nav.x + nav.w - 100, midY)
    await flush()
    const z1 = c.getAttribute('data-pyreon-zoom')!
    expect(z1).not.toBe('all')
    const p1 = z1.split('-').map(Number)
    const s1 = p1[0]!
    const e1 = p1[1]!
    expect(s1).toBeCloseTo(0, 2)
    expect(e1).toBeCloseTo(1 - 100 / nav.w, 1)
    // Band: grab the middle of the window and move it right by 40px.
    const bandMid = r.left + nav.x + nav.w * (e1 / 2)
    mouse(c, 'mousedown', bandMid, midY)
    mouse(c, 'mousemove', bandMid + 40, midY)
    mouse(c, 'mouseup', bandMid + 40, midY)
    await flush()
    const p2 = c.getAttribute('data-pyreon-zoom')!.split('-').map(Number)
    const s2 = p2[0]!
    const e2 = p2[1]!
    expect(s2).toBeCloseTo(40 / nav.w, 1)
    expect(e2 - s2).toBeCloseTo(e1 - s1, 1)
  })
})
