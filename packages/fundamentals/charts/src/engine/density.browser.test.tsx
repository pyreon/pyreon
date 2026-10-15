// `density` reaches the engine through both chart forms. On a 1× surface,
// `'device'` decimates to one M4 column per pixel and so paints a DIFFERENT
// (coarser) picture of a noisy line than the default — the observable proof
// the prop is wired, through <PlotChart> and the <Chart> facade alike.
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { Chart, Line } from '../engine'
import { PlotChart } from './Chart'
import { line } from './marks'

const values = Array.from({ length: 20_000 }, (_, i) => Math.sin(i / 37) * 50 + ((i * 7919) % 23))
const rows = values.map((v) => ({ v }))

const pixels = (c: HTMLElement): Uint8ClampedArray => {
  const canvas = c.querySelector('canvas')!
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
}
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  let n = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++
  return n
}

describe('density (real browser, 1× surface)', () => {
  it('<PlotChart density="device"> paints a different picture than the default; "fine" is the default', async () => {
    expect(globalThis.devicePixelRatio).toBe(1)
    const base = { marks: [line(values)], width: 600, height: 200, animate: false, accessibleTable: false }
    const def = mountInBrowser(() => PlotChart(base))
    const fine = mountInBrowser(() => PlotChart({ ...base, density: 'fine' }))
    const dev = mountInBrowser(() => PlotChart({ ...base, density: 'device' }))
    await flush()
    expect(diff(pixels(def.container), pixels(fine.container))).toBe(0)
    expect(diff(pixels(def.container), pixels(dev.container))).toBeGreaterThan(1000)
  })

  it('the <Chart> facade forwards density', async () => {
    const make = (density?: 'fine' | 'device') =>
      mountInBrowser(() => h(Chart, { data: rows, width: 600, height: 200, animate: false, accessibleTable: false, ...(density ? { density } : {}) }, h(Line, { y: 'v' })))
    const def = make()
    const dev = make('device')
    await flush()
    expect(diff(pixels(def.container), pixels(dev.container))).toBeGreaterThan(1000)
  })
})
