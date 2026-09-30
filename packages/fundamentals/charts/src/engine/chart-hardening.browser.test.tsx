import { describe, expect, it, vi } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { bars, line } from './marks'
import { PieChart } from './PieChart'
import { PlotChart } from './Chart'
import { prepareCanvas } from './canvas-web'

// Capture every MediaQueryList the chart subscribes to, so the DPR spec can
// fire its `change` without a real display change.
const registeredQueries: MediaQueryList[] = []
const realMatchMedia = window.matchMedia.bind(window)
window.matchMedia = (q: string): MediaQueryList => {
  const mql = realMatchMedia(q)
  if (q.startsWith('(resolution:')) registeredQueries.push(mql)
  return mql
}

const click = (c: HTMLCanvasElement, x: number, y: number) => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

/** Pixels of (roughly) pure red in the TOP third of the canvas. */
function redInTopThird(c: HTMLCanvasElement): number {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, Math.floor(c.height / 3))
  let n = 0
  for (let i = 0; i < data.length; i += 4) if (data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60 && data[i + 3]! > 0) n++
  return n
}

describe('PlotChart hardening (real browser)', () => {
  it('maxPoints decimation keeps a spike that exists only in the SECOND series', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ a: (i * 7) % 11, b: i === 1003 ? 100 : 0 }))
    const { container } = mountInBrowser(() =>
      PlotChart<{ a: number; b: number }>({
        data: rows,
        marks: [line((d) => d.a, { color: '#0000ff' }), line((d) => d.b, { color: '#ff0000' })],
        width: 400,
        height: 240,
        animate: false,
        maxPoints: 60,
        showGrid: false,
      }),
    )
    await flush()
    expect(redInTopThird(container.querySelector('canvas')!)).toBeGreaterThan(0)
  })

  it('legend entries toggle from the keyboard (digit keys) and the change is announced', async () => {
    const changes: number[][] = []
    const { container } = mountInBrowser(() =>
      PlotChart<{ v: number }>({
        data: [{ v: 1 }, { v: 3 }, { v: 2 }],
        marks: [bars((d) => d.v, { label: 'Alpha' }), bars((d) => d.v / 2, { label: 'Beta' })],
        width: 400,
        height: 200,
        animate: false,
        showLegend: true,
        onLegendChange: (h) => changes.push(h),
      }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    c.focus()
    c.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))
    await flush()
    expect(changes.at(-1)).toEqual([1])
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Beta hidden')
    c.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))
    await flush()
    expect(changes.at(-1)).toEqual([])
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Beta shown')
  })

  it('the toolbox data view is capped like the accessible table', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ v: i }))
    const { container } = mountInBrowser(() =>
      PlotChart<{ v: number }>({ data: rows, marks: [line((d) => d.v)], width: 400, height: 200, animate: false, toolbox: { dataView: true } }),
    )
    await flush()
    click(container.querySelector('canvas')!, 390.5, 9)
    await flush()
    const view = container.querySelector('[data-pyreon-dataview]')!
    expect(view).not.toBeNull()
    expect(view.querySelectorAll('tbody tr').length).toBeLessThanOrEqual(1001)
  })

  it('warns when maxPoints is below 3', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mountInBrowser(() =>
      PlotChart<{ v: number }>({ data: [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }], marks: [line((d) => d.v)], width: 200, height: 100, animate: false, maxPoints: 2 }),
    )
    await flush()
    expect(warn.mock.calls.some((c) => String(c[0]).includes('maxPoints=2'))).toBe(true)
    warn.mockRestore()
  })

  it('redraws when the devicePixelRatio changes with no CSS resize', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<{ v: number }>({ data: [{ v: 1 }, { v: 2 }], marks: [bars((d) => d.v)], width: 200, height: 100, animate: false }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = c.width
    const original = globalThis.devicePixelRatio
    Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: original * 2 })
    try {
      // Real Chromium fires the matchMedia `change` only on an actual ratio
      // change, so drive the listener the chart registered directly.
      // A snapshot: the chart re-subscribes a fresh query on every change,
      // which appends to `registeredQueries` — iterating it live never ends.
      for (const q of [...registeredQueries]) q.dispatchEvent(new Event('change'))
      await flush()
      expect(c.width).toBe(Math.round(200 * original * 2))
      expect(c.width).not.toBe(before)
    } finally {
      Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: original })
    }
  })
})

describe('prepareCanvas', () => {
  it('does not reallocate the backing store when the size is unchanged', () => {
    const c = document.createElement('canvas')
    prepareCanvas(c, 100, 50)
    let sets = 0
    const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')!
    Object.defineProperty(c, 'width', {
      configurable: true,
      get: () => desc.get!.call(c),
      set: (v: number) => {
        sets++
        desc.set!.call(c, v)
      },
    })
    const ctx = prepareCanvas(c, 100, 50)!
    ctx.fillStyle = '#f00'
    ctx.fillRect(0, 0, 10, 10)
    const ctx2 = prepareCanvas(c, 100, 50)!
    expect(sets).toBe(0)
    // Still starts blank with default state.
    expect(ctx2.getImageData(0, 0, 1, 1).data[3]).toBe(0)
    expect(ctx2.fillStyle).toBe('#000000')
    prepareCanvas(c, 120, 50)
    expect(sets).toBe(1)
  })
})

describe('the server first-frame placeholder', () => {
  it('is gone once the canvas has painted', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<{ v: number }>({ data: [{ v: 1 }, { v: 2 }], marks: [bars((d) => d.v)], width: 200, height: 100, animate: false }),
    )
    await flush()
    expect(container.querySelector('[data-pyreon-chart-frame]')).toBeNull()
  })

  it('a canvas-hosted family removes it too, once the canvas has painted', async () => {
    const { container } = mountInBrowser(() =>
      PieChart<{ v: number }>({ data: [{ v: 1 }, { v: 2 }], value: (d) => d.v, label: (_d, i) => String(i), width: 200, height: 100 }),
    )
    await flush()
    expect(container.querySelector('canvas')).not.toBeNull()
    expect(container.querySelector('[data-pyreon-chart-frame]')).toBeNull()
  })
})
