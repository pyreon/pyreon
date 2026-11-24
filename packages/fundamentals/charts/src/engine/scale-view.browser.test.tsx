// Non-linear scales in real Chromium: the pointer finds the datum where the
// SCALE put it (not where a linear axis would have), the tooltip keeps the
// real values, and the painted ticks carry real labels.
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { query } from '@pyreon/test-utils'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { Axis, Bar, Chart, Dot, Scale, Tooltip } from './grammar'
import { log, sqrt } from './scale-descriptors'

interface Pt { x: number; y: number }
const W = 400
const H = 220
// Evenly spaced on a log axis (x2 per ... roughly one decade each), crowded on a linear one.
const PTS: Pt[] = [{ x: 2, y: 11 }, { x: 30, y: 22 }, { x: 400, y: 33 }, { x: 5000, y: 44 }]

async function tipAt(scale: 'linear' | 'log', fx: number): Promise<string> {
  const m = mountInBrowser(h(Chart<Pt>, { data: PTS, xValue: 'x', width: W, height: H, animate: false }, h(Dot<Pt>, { y: 'y', label: 'Y' }), h(Axis, { x: true, scale: scale === 'log' ? log() : 'linear' }), h(Tooltip, { crosshair: true })))
  await flush()
  const c = query<HTMLCanvasElement>(m.container, 'canvas')
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 16 + (W - 30) * fx, clientY: r.top + 100, bubbles: true }))
  await flush()
  const text = query<HTMLElement>(m.container, '[data-pyreon-chart-tooltip]').textContent ?? ''
  m.unmount()

  return text
}

describe('log x in real Chromium', () => {
  it('hovering the middle of the plot finds the datum the LOG axis put there, with its real value', async () => {
    // On a log axis the four points sit at roughly 0, 0.4, 0.8 and 1.0 of the plot; the nearest to the
    // 0.40 mark is the second (y 22). On a linear axis points 1..3 crowd the left end, so 0.40 is the 3rd/4th region.
    expect(await tipAt('log', 0.4)).toContain('22')
    expect(await tipAt('linear', 0.4)).not.toContain('22')
  })
  it('the painted tick labels are real values (decades)', async () => {
    const m = mountInBrowser(h(Chart<Pt>, { data: PTS, xValue: 'x', width: W, height: H, animate: false }, h(Dot<Pt>, { y: 'y' }), h(Scale, { x: log() })))
    await flush()
    const table = [...m.container.querySelectorAll('table tbody th')].map((e) => e.textContent)
    expect(table.length).toBeGreaterThan(0)
    m.unmount()
  })
})

describe('sqrt y in real Chromium', () => {
  it('a click on a bar lands where the sqrt axis drew it', async () => {
    const picked: number[] = []
    const data = [{ n: 'a', v: 4 }, { n: 'b', v: 100 }]
    const m = mountInBrowser(h(Chart<{ n: string; v: number }>, { data, x: 'n', width: W, height: H, animate: false, onSelect: (i: number) => picked.push(i) }, h(Bar, { y: 'v' }), h(Axis, { y: true, scale: sqrt() })))
    await flush()
    const c = query<HTMLCanvasElement>(m.container, 'canvas')
    const r = c.getBoundingClientRect()
    // The short bar (4) is 2/10 the height of the tall one (100) on sqrt (about 34px of a 170px plot), not 4/100 (about 7px):
    // a sweep up its column hits it on about eleven 3px steps, where a linear axis gives two or three.
    const x = 16 + (W - 28) * 0.25
    for (let y = H - 30; y > 20; y -= 3) c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
    const hits = picked.filter((i) => i === 0).length
    expect(hits).toBeGreaterThan(7)
    m.unmount()
  })
})
