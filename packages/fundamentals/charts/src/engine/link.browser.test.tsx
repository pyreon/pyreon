import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { PlotChart } from './Chart'
import { createChartLink } from './link'
import { line } from './marks'

interface Row { k: string; v: number }
const rows: Row[] = Array.from({ length: 24 }, (_, i) => ({ k: String(i), v: (i * 7) % 11 }))

describe('linked charts (real browser)', () => {
  it('a shared link syncs the zoom window and the crosshair datum across hosts', async () => {
    const link = createChartLink()
    const { container } = mountInBrowser(() =>
      PlotChart({ data: rows, x: (d: Row) => d.k, marks: [line((d: Row) => d.v)], width: 400, height: 200, dataZoom: true, crosshair: true, link, animate: false }),
    )
    const second = mountInBrowser(() =>
      PlotChart({ data: rows, x: (d: Row) => d.k, marks: [line((d: Row) => d.v * 2)], width: 400, height: 200, dataZoom: true, crosshair: true, link, animate: false }),
    )
    await flush()
    const a = container.querySelector('canvas')!
    const b = second.container.querySelector('canvas')!
    expect(a.getAttribute('data-pyreon-zoom')).toBe('all')
    expect(b.getAttribute('data-pyreon-zoom')).toBe('all')
    const r = a.getBoundingClientRect()
    a.dispatchEvent(new WheelEvent('wheel', { clientX: r.left + 200, clientY: r.top + 100, deltaY: -100, bubbles: true, cancelable: true }))
    await flush()
    const z = a.getAttribute('data-pyreon-zoom')!
    expect(z).not.toBe('all')
    expect(b.getAttribute('data-pyreon-zoom')).toBe(z)
    // Hover on A moves the crosshair datum on B too.
    a.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + 200, clientY: r.top + 100, bubbles: true }))
    await flush()
    const hv = a.getAttribute('data-pyreon-hover')!
    expect(Number(hv)).toBeGreaterThanOrEqual(0)
    expect(b.getAttribute('data-pyreon-hover')).toBe(hv)
    a.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    await flush()
    expect(b.getAttribute('data-pyreon-hover')).toBe('-1')
    // A double-click on B resets both.
    b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flush()
    expect(a.getAttribute('data-pyreon-zoom')).toBe('all')
  })
})
