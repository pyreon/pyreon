/**
 * GC-observable dispose-leak locks for @pyreon/charts (2026-07 audit gap 6).
 *
 * The wrapper must never be a GC root for a disposed ECharts instance:
 *   1. after a reactive-THEME re-init (component still mounted), the OLD
 *      instance must be collectible — the ResizeObserver callback reads
 *      `instance.peek()` per fire (no captured chart), `appliedTheme` holds
 *      the theme VALUE (not the instance), and the update effect reads
 *      `instance()` fresh per run;
 *   2. after unmount, the instance must be collectible — `onUnmount`
 *      disposes and clears the signal.
 *
 * WeakRef + `--expose-gc` pattern from
 * packages/core/runtime-dom/src/tests/for-lis-scratch-release.test.tsx —
 * the flag is wired via this package's vitest config `overrides.test.execArgv`;
 * skips (rather than flakes) when `globalThis.gc` is unavailable.
 *
 * Mocked echarts with PLAIN closures — `vi.fn()` result-tracking would pin
 * every returned instance in `mock.results`, false-failing exactly what this
 * test asserts.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'

vi.mock('echarts/core', () => {
  const init = (_el: unknown, theme: unknown): Record<string, unknown> => ({
    __theme: theme ?? null,
    group: '',
    setOption(): void {},
    resize(): void {},
    dispose(): void {},
    on(): void {},
    off(): void {},
    showLoading(): void {},
    hideLoading(): void {},
  })
  const use = (): void => {}
  return { init, use, default: { init, use } }
})

vi.mock('echarts/charts', () => ({ BarChart: { __echartsStub: 'BarChart' } }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: { __echartsStub: 'CanvasRenderer' } }))

import { _resetLoader } from '../loader'
import { useChart } from '../use-chart'

const hasGc = typeof globalThis.gc === 'function'

async function collectGarbage(): Promise<void> {
  // Two passes with a macrotask between them — finalization of object graphs
  // can need a second sweep after the first pass clears the retaining edges.
  globalThis.gc!()
  await new Promise((r) => setTimeout(r, 0))
  globalThis.gc!()
}

const tick = (ms = 50) => new Promise<void>((r) => setTimeout(r, ms))

afterEach(() => {
  _resetLoader()
  document.body.innerHTML = ''
})

describe.skipIf(!hasGc)('charts dispose-leak (GC-observable)', () => {
  it('the OLD instance is collectible after a theme re-init while the chart stays mounted', async () => {
    const theme = signal<string | null>(null)

    const el = document.createElement('div')
    document.body.appendChild(el)
    const host = document.createElement('div')
    document.body.appendChild(host)

    let chart!: ReturnType<typeof useChart>
    const Child = () => {
      chart = useChart(() => ({ series: [{ type: 'bar', data: [1, 2] }] }), {
        theme: () => theme(),
      })
      return null
    }
    const unmount = mount(h(Child, {}), host)
    chart.ref(el)
    await tick()
    expect(chart.instance()).not.toBeNull()

    // No lasting strong local — the instance flows straight into the WeakRef.
    const oldRef = new WeakRef(chart.instance() as object)

    theme.set('dark')
    expect(chart.instance()).not.toBeNull()
    expect(oldRef.deref()).not.toBe(chart.instance())

    await collectGarbage()
    expect(oldRef.deref()).toBeUndefined()

    unmount()
    el.remove()
    host.remove()
  })

  it('the instance is collectible after unmount', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const host = document.createElement('div')
    document.body.appendChild(host)

    let chart!: ReturnType<typeof useChart>
    const Child = () => {
      chart = useChart(() => ({ series: [{ type: 'bar', data: [1] }] }))
      return null
    }
    const unmount = mount(h(Child, {}), host)
    chart.ref(el)
    await tick()
    expect(chart.instance()).not.toBeNull()

    const ref = new WeakRef(chart.instance() as object)

    unmount()
    expect(chart.instance()).toBeNull()

    await collectGarbage()
    expect(ref.deref()).toBeUndefined()

    el.remove()
    host.remove()
  })
})
