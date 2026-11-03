import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { bars, PlotChart } from '../engine'
import type { TestContext } from 'vitest'

// A data update tweens the VALUES; the value domain must follow the tweened
// frame. #3898 resolved the domain once inside `buildSpec` — before the tween —
// so every interpolated frame was scaled by the NEW data's domain: shrinking
// 1000/900/800 to 10/9/8 drew mid-tween bars ~50× taller than the plot.

interface Row {
  id: string
  v: number
}

function frames(ctx: TestContext) {
  let nextId = 1_000_000
  const callbacks = new Map<number, FrameRequestCallback>()
  const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((fn) => {
    const id = nextId++
    callbacks.set(id, fn)
    return id
  })
  const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    callbacks.delete(id)
  })
  ctx.onTestFinished(() => {
    raf.mockRestore()
    cancel.mockRestore()
  })
  return (now: number): void => {
    const batch = [...callbacks.values()]
    callbacks.clear()
    for (const callback of batch) callback(now)
  }
}

describe('update tween keeps the value domain consistent with the painted frame', () => {
  for (const [label, from, to] of [
    ['shrinking range', [1000, 900, 800], [10, 9, 8]],
    ['growing range', [10, 9, 8], [1000, 900, 800]],
  ] as const) {
    it(`${label}: every mid-tween bar stays inside the plot`, async (ctx) => {
      const rows = signal<Row[]>(from.map((v, i) => ({ id: String(i), v })))
      const mounted = mountInBrowser(
        h(PlotChart<Row>, {
          data: rows,
          marks: [bars<Row>((d) => d.v, { color: '#ff0000' })],
          width: 400,
          height: 240,
          animate: false,
          updateDuration: 2000,
          theme: { radius: 0 },
        }),
      )
      ctx.onTestFinished(mounted.unmount)
      await flush()
      const canvas = mounted.container.querySelector('canvas')!
      const context = canvas.getContext('2d')!
      const fill = context.fillRect.bind(context)
      // The bar fills are the ones drawn in the mark colour, read at call time.
      let drawn: number[][] = []
      const fills = vi.spyOn(context, 'fillRect').mockImplementation((x, y, w, hh) => {
        if (String(context.fillStyle) === '#ff0000' && w > 0 && hh > 0) drawn.push([x, y, w, hh])
        fill(x, y, w, hh)
      })
      ctx.onTestFinished(() => fills.mockRestore())
      const red = (): number[][] => drawn
      // The settled extremes: a nice domain puts the largest bar's top at the
      // plot top, and every bar shares the plot bottom as its base.
      rows.set([...rows()])
      const step = frames(ctx)
      drawn = []
      rows.set(to.map((v, i) => ({ id: String(i), v })))
      await Promise.resolve()
      step(0)
      step(5000)
      const settled = red().slice(-3)
      expect(settled).toHaveLength(3)
      const plotTop = Math.min(...settled.map((r) => r[1]!))
      const plotBottom = Math.max(...settled.map((r) => r[1]! + r[3]!))
      // Restart the same update and sample it mid-flight.
      rows.set(from.map((v, i) => ({ id: String(i), v })))
      await Promise.resolve()
      step(0)
      step(5000)
      rows.set(to.map((v, i) => ({ id: String(i), v })))
      await Promise.resolve()
      for (const now of [0, 400, 1000, 1600]) {
        drawn = []
        step(now)
        const mid = red()
        expect(mid.length, `frame at ${now}ms painted bars`).toBe(3)
        for (const [, y, , hh] of mid) {
          expect(y!, `bar top at ${now}ms`).toBeGreaterThanOrEqual(plotTop - 0.5)
          expect(y! + hh!, `bar base at ${now}ms`).toBeLessThanOrEqual(plotBottom + 0.5)
        }
      }
    })
  }

  it('a magicType stack switch rescales the domain to the stack totals', async (ctx) => {
    const rows: Row[] = [10, 5, 8].map((v, i) => ({ id: String(i), v }))
    const mounted = mountInBrowser(
      h(PlotChart<Row>, {
        data: rows,
        marks: [bars<Row>((d) => d.v, { color: '#ff0000' }), bars<Row>((d) => d.v, { color: '#0000ff' })],
        width: 400,
        height: 240,
        animate: false,
        theme: { radius: 0 },
        toolbox: { magicType: ['stack', 'tiled'] },
      }),
    )
    ctx.onTestFinished(mounted.unmount)
    await flush()
    const canvas = mounted.container.querySelector('canvas')!
    const context = canvas.getContext('2d')!
    const fill = context.fillRect.bind(context)
    let drawn: number[][] = []
    const fills = vi.spyOn(context, 'fillRect').mockImplementation((x, y, w, hh) => {
      const style = String(context.fillStyle)
      if ((style === '#ff0000' || style === '#0000ff') && w > 0 && hh > 0) drawn.push([x, y, w, hh])
      fill(x, y, w, hh)
    })
    ctx.onTestFinished(() => fills.mockRestore())
    const click = (x: number, y: number): void => {
      const r = canvas.getBoundingClientRect()
      canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
    }
    // Tools right-aligned, 25px apart: stack, tiled.
    click(390.5, 9)
    await flush()
    const tiled = drawn
    expect(tiled.length).toBeGreaterThan(0)
    const plotTop = Math.min(...tiled.map((r) => r[1]!))
    drawn = []
    click(365.5, 9)
    await flush()
    expect(drawn.length).toBeGreaterThan(0)
    // Stacked 10+10 tops out at a 0..20 domain: the tallest stack reaches the
    // plot top and no segment climbs past it.
    expect(Math.min(...drawn.map((r) => r[1]!))).toBeCloseTo(plotTop, 0)
  })
})
