import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { bars, PlotChart } from '../engine'
import { groupedBars, line, stackedBars } from './marks'
import type { Mark } from './marks'
import type { TestContext } from 'vitest'

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
  return {
    step(now: number) {
      const batch = [...callbacks.values()]
      callbacks.clear()
      for (const callback of batch) callback(now)
    },
    pending: () => callbacks.size,
  }
}

function picture(canvas: HTMLCanvasElement, ctx: TestContext) {
  const context = canvas.getContext('2d')!
  let rects: number[][] = []
  let points: number[][] = []
  const clear = context.clearRect.bind(context)
  const fill = context.fillRect.bind(context)
  const move = context.moveTo.bind(context)
  const line = context.lineTo.bind(context)
  const spies = [
    vi.spyOn(context, 'clearRect').mockImplementation((...args) => {
      rects = []
      points = []
      clear(...args)
    }),
    vi.spyOn(context, 'fillRect').mockImplementation((...args) => {
      if (args[2] > 0 && args[3] > 0) rects.push(args)
      fill(...args)
    }),
    vi.spyOn(context, 'moveTo').mockImplementation((...args) => {
      points.push(args)
      move(...args)
    }),
    vi.spyOn(context, 'lineTo').mockImplementation((...args) => {
      points.push(args)
      line(...args)
    }),
  ]
  ctx.onTestFinished(() => {
    for (const spy of spies) spy.mockRestore()
  })
  return {
    rects: () => rects.map((r) => r.map((v) => Number(v.toFixed(6)))),
    points: () => points.map((p) => p.map((v) => Number(v.toFixed(6)))),
  }
}

describe('plot updates arriving during a running animation', () => {
  it('retargets from the visible frame and settles once at the newest value', async (ctx) => {
    const rows = signal([{ id: 'a', v: 2 }])
    const mounted = mountInBrowser(
      h(PlotChart<ReturnType<typeof rows>[number]>, {
        data: rows,
        marks: [bars<ReturnType<typeof rows>[number]>((d) => d.v, { color: '#ff0000' })],
        width: 400,
        height: 240,
        animate: false,
        updateDuration: 1000,
        theme: { radius: 0 },
        showXAxis: false,
        showYAxis: false,
        showGrid: false,
        yDomain: { min: 0, max: 10 },
      }),
    )
    ctx.onTestFinished(mounted.unmount)
    await flush()
    const canvas = mounted.container.querySelector('canvas')!
    const fills = vi.spyOn(canvas.getContext('2d')!, 'fillRect')
    ctx.onTestFinished(() => fills.mockRestore())
    let nextId = 1
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
    const step = (now: number): void => {
      const batch = [...callbacks.values()]
      callbacks.clear()
      for (const callback of batch) callback(now)
    }
    const height = (): number => fills.mock.calls.at(-1)![3]
    rows.set([{ id: 'a', v: 8 }])
    await Promise.resolve()
    step(0)
    step(200)
    const visible = height()
    expect(visible).toBeGreaterThan(232 * 0.2)
    expect(visible).toBeLessThan(232 * 0.8)
    rows.set([{ id: 'a', v: 4 }])
    await Promise.resolve()
    expect(height(), 'a new target starts from the frame already on screen').toBeCloseTo(visible, 6)
    step(200)
    step(1200)
    expect(height()).toBeCloseTo(232 * 0.4, 6)
    expect(
      callbacks.size,
      'settling must not start a second tween from the superseded target',
    ).toBe(0)
  })

  for (const kind of ['bars', 'stacked', 'grouped', 'horizontal'] as const) {
    it(`${kind}: repeated keyed slides keep all visible bars and settle without replay`, async (ctx) => {
      const rows = signal<Row[]>([
        { id: 'a', v: 2 },
        { id: 'b', v: 4 },
        { id: 'c', v: 6 },
      ])
      const mark = kind === 'stacked' ? stackedBars : kind === 'grouped' ? groupedBars : bars
      const marks: Mark<Row>[] = [mark<Row>((d) => d.v, { color: '#ff0000' })]
      if (kind === 'stacked' || kind === 'grouped')
        marks.push(mark<Row>((d) => d.v / 2, { color: '#0000ff' }))
      const mounted = mountInBrowser(
        h(PlotChart<Row>, {
          data: rows,
          by: (d) => d.id,
          marks,
          width: 400,
          height: 240,
          horizontal: kind === 'horizontal',
          animate: false,
          updateDuration: 1000,
          theme: { radius: 0 },
          showXAxis: false,
          showYAxis: false,
          showGrid: false,
          yDomain: { min: 0, max: 10 },
        }),
      )
      ctx.onTestFinished(mounted.unmount)
      await flush()
      const shown = picture(mounted.container.querySelector('canvas')!, ctx)
      const clock = frames(ctx)
      rows.set([
        { id: 'b', v: 4 },
        { id: 'c', v: 6 },
        { id: 'd', v: 8 },
      ])
      await Promise.resolve()
      clock.step(0)
      clock.step(200)
      const visible = shown.rects()
      rows.set([
        { id: 'c', v: 6 },
        { id: 'd', v: 8 },
        { id: 'e', v: 5 },
      ])
      await Promise.resolve()
      expect(shown.rects(), 'entering and exiting bars remain where they were at retarget').toEqual(
        visible,
      )
      clock.step(200)
      clock.step(1200)
      expect(shown.rects()).toHaveLength(marks.length * 3)
      const extent = shown.rects().reduce((sum, r) => sum + r[kind === 'horizontal' ? 2 : 3]!, 0)
      expect(extent).toBeCloseTo(
        19 * (kind === 'horizontal' ? 38.8 : 23.2) * (marks.length === 2 ? 1.5 : 1),
        5,
      )
      expect(clock.pending()).toBe(0)
    })
  }

  it('a keyed line retargets surviving points from their displayed positions', async (ctx) => {
    const rows = signal<Row[]>([
      { id: 'a', v: 2 },
      { id: 'b', v: 4 },
      { id: 'c', v: 6 },
    ])
    const mounted = mountInBrowser(
      h(PlotChart<Row>, {
        data: rows,
        by: (d) => d.id,
        marks: [line<Row>((d) => d.v)],
        width: 400,
        height: 240,
        animate: false,
        updateDuration: 1000,
        showXAxis: false,
        showYAxis: false,
        showGrid: false,
        yDomain: { min: 0, max: 10 },
      }),
    )
    ctx.onTestFinished(mounted.unmount)
    await flush()
    const shown = picture(mounted.container.querySelector('canvas')!, ctx)
    const clock = frames(ctx)
    rows.set([
      { id: 'b', v: 4 },
      { id: 'c', v: 6 },
      { id: 'd', v: 8 },
    ])
    await Promise.resolve()
    clock.step(0)
    clock.step(200)
    const visible = shown.points()
    rows.set([
      { id: 'c', v: 6 },
      { id: 'd', v: 8 },
      { id: 'e', v: 5 },
    ])
    await Promise.resolve()
    expect(shown.points().slice(0, 2)).toEqual(visible.slice(1))
    clock.step(200)
    clock.step(1200)
    expect(shown.points()).toEqual([
      [64.666667, 100.8],
      [194, 54.4],
      [323.333333, 124],
    ])
    expect(clock.pending()).toBe(0)
  })

  it('a universal shape morph accepts a newer target and stops when updates are disabled', async (ctx) => {
    const rows = signal<Row[]>([{ id: 'a', v: 2 }])
    const enabled = signal(true)
    const mounted = mountInBrowser(
      h(PlotChart<Row>, {
        data: rows,
        marks: [bars<Row>((d) => d.v)],
        width: 400,
        height: 240,
        animate: false,
        universalTransition: true,
        get updateAnimation() {
          return enabled()
        },
        updateDuration: 1000,
        theme: { radius: 0 },
        showXAxis: false,
        showYAxis: false,
        showGrid: false,
        yDomain: { min: 0, max: 10 },
      }),
    )
    ctx.onTestFinished(mounted.unmount)
    await flush()
    const shown = picture(mounted.container.querySelector('canvas')!, ctx)
    const clock = frames(ctx)
    rows.set([
      { id: 'a', v: 4 },
      { id: 'b', v: 6 },
    ])
    await Promise.resolve()
    clock.step(0)
    clock.step(200)
    const visible = shown.rects()
    rows.set([
      { id: 'a', v: 3 },
      { id: 'b', v: 5 },
      { id: 'c', v: 7 },
    ])
    await Promise.resolve()
    expect(shown.rects()).toEqual(visible)
    clock.step(200)
    clock.step(400)
    expect(shown.rects(), 'the newest third bar grows before the transition settles').toHaveLength(
      3,
    )
    clock.step(1200)
    expect(shown.rects()).toHaveLength(3)
    expect(clock.pending()).toBe(0)
    rows.set([
      { id: 'a', v: 4 },
      { id: 'b', v: 6 },
    ])
    await Promise.resolve()
    clock.step(1200)
    clock.step(1400)
    enabled.set(false)
    await Promise.resolve()
    expect(shown.rects()).toHaveLength(2)
    expect(clock.pending()).toBe(0)
  })
})
