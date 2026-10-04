import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { line, PlotChart } from '../engine'

describe('keyed line gaps during updates', () => {
  it('never hands a non-finite point to the real canvas during a keyed slide', async (ctx) => {
    const values = [1, 2, 3, 5, 6, 4, 5, NaN]
    const rows = signal(values.map((v, i) => ({ id: String(i), v })))
    const mark = {
      ...line<ReturnType<typeof rows>[number]>((d) => d.v, { color: '#ff0000' }),
      // Derived marks may overflow after the accessor has been normalised.
      transform: (values: number[]) =>
        values.map((v) => (v === 3 ? Infinity : v === 4 ? -Infinity : v)),
    }
    const mounted = mountInBrowser(
      h(PlotChart<ReturnType<typeof rows>[number]>, {
        data: rows,
        x: (d) => d.id,
        by: (d) => d.id,
        width: 400,
        height: 240,
        animate: false,
        updateDuration: 1000,
        yDomain: { min: 0, max: 5 },
        showXAxis: false,
        showYAxis: false,
        showGrid: false,
        marks: [mark],
      }),
    )
    ctx.onTestFinished(mounted.unmount)
    await flush()
    const canvas = mounted.container.querySelector('canvas')!
    const context = canvas.getContext('2d')!
    const moves = vi.spyOn(context, 'moveTo')
    const lines = vi.spyOn(context, 'lineTo')
    ctx.onTestFinished(() => {
      moves.mockRestore()
      lines.mockRestore()
    })
    rows.set([...rows.peek().slice(1), { id: '8', v: 4 }])
    await flush()
    // Includes the synchronous first morph frame and a real rAF frame. A
    // settled picture alone misses the bug because the ordinary renderer
    // already splits Infinity out of its line runs.
    const points = [...moves.mock.calls, ...lines.mock.calls]
    expect(points.length).toBeGreaterThan(0)
    expect(points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  })
})
