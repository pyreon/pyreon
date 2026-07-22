/**
 * Reactive theme swap + cached-modules sync fast path + autoresize config —
 * regression locks for the 2026-07 charts audit gaps.
 *
 * Mocked echarts (same rationale as charts.test.tsx — the wrapper's state
 * machine is under test, not ECharts). The REAL-echarts counterpart for the
 * theme swap lives in theme-swap.browser.test.tsx (real Chromium).
 *
 * Bisect-verified specs (see PR body):
 *   - "accessor flip disposes the old instance…" fails against the pre-fix
 *     init-once theme read (instance never changes).
 *   - "warm modules initialize synchronously…" fails against the always-async
 *     promise-chain mount (instance still null synchronously after ref()).
 */
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'

// ─── Mock echarts (recording fakes) ──────────────────────────────────────────
// Plain closures (not vi.fn result-tracking where avoidable) — instances
// record their own init args + calls so specs read them off `chart.instance()`.

interface FakeInstance {
  __theme: unknown
  __initOpts: Record<string, unknown>
  group: string
  disposed: boolean
  setOptionCalls: [option: unknown, opts: unknown][]
  onCalls: string[]
  offCalls: string[]
  setOption(option: unknown, opts?: unknown): void
  resize(): void
  dispose(): void
  on(name: string, cb?: unknown): void
  off(name: string, cb?: unknown): void
  showLoading(): void
  hideLoading(): void
}

vi.mock('echarts/core', () => {
  const init = (_el: unknown, theme: unknown, opts: Record<string, unknown>): FakeInstance => ({
    __theme: theme ?? null,
    __initOpts: opts,
    group: '',
    disposed: false,
    setOptionCalls: [],
    onCalls: [],
    offCalls: [],
    setOption(option: unknown, so?: unknown) {
      this.setOptionCalls.push([option, so])
    },
    resize() {},
    dispose() {
      this.disposed = true
    },
    on(name: string) {
      this.onCalls.push(name)
    },
    off(name: string) {
      this.offCalls.push(name)
    },
    showLoading() {},
    hideLoading() {},
  })
  const use = (): void => {}
  const connect = (): void => {}
  return { init, use, connect, default: { init, use, connect } }
})

vi.mock('echarts/charts', () => ({
  BarChart: { __echartsStub: 'BarChart' },
  LineChart: { __echartsStub: 'LineChart' },
}))

vi.mock('echarts/renderers', () => ({
  CanvasRenderer: { __echartsStub: 'CanvasRenderer' },
  SVGRenderer: { __echartsStub: 'SVGRenderer' },
}))

import { Chart } from '../chart-component'
import { _resetLoader } from '../loader'
import type { ChartEventParams, ECharts } from '../types'
import { _throttle, useChart } from '../use-chart'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Child = () => {
    result = fn()
    return null
  }
  const unmount = mount(<Child />, el)
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

const tick = (ms = 50) => new Promise<void>((r) => setTimeout(r, ms))

const asFake = (inst: unknown): FakeInstance => inst as FakeInstance

afterEach(() => {
  _resetLoader()
  document.body.innerHTML = ''
})

// ─── Reactive theme swap ─────────────────────────────────────────────────────

describe('reactive theme swap', () => {
  it('accessor flip disposes the old instance and re-inits with the new theme, option re-applied', async () => {
    const theme = signal<string | null>(null)
    const data = signal([1, 2, 3])

    const el = document.createElement('div')
    document.body.appendChild(el)

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: data() }] }), {
        theme: () => theme(),
      }),
    )
    chart.ref(el)
    await tick()

    const inst1 = asFake(chart.instance())
    expect(inst1).not.toBeNull()
    expect(inst1.__theme).toBeNull()
    expect(inst1.setOptionCalls.length).toBe(1)

    theme.set('dark')

    const inst2 = asFake(chart.instance())
    expect(inst2).not.toBe(inst1)
    expect(inst1.disposed).toBe(true)
    expect(inst2.disposed).toBe(false)
    expect(inst2.__theme).toBe('dark')

    // Option preserved — the NEW instance received the current option via
    // the reactive-update effect re-running on the instance publish.
    expect(inst2.setOptionCalls.length).toBe(1)
    const [opt] = inst2.setOptionCalls[0]!
    expect((opt as { series: { data: number[] }[] }).series[0]!.data).toEqual([1, 2, 3])

    // Reactivity survives the swap — a data change updates the NEW instance.
    data.set([9])
    expect(inst2.setOptionCalls.length).toBe(2)
    expect(inst1.setOptionCalls.length).toBe(1)

    unmount()
    el.remove()
  })

  it('re-run with the SAME resolved theme value does not swap', async () => {
    const mode = signal<'a' | 'b'>('a')
    // Both modes resolve to the SAME theme string — the accessor re-runs on
    // the flip (it reads mode()) but Object.is(resolved, applied) skips the
    // swap.
    const THEMES = { a: 'dark', b: 'dark' } as const

    const el = document.createElement('div')
    document.body.appendChild(el)

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), {
        theme: () => THEMES[mode()],
      }),
    )
    chart.ref(el)
    await tick()

    const inst1 = asFake(chart.instance())
    expect(inst1.__theme).toBe('dark')

    mode.set('b')
    expect(asFake(chart.instance())).toBe(inst1)
    expect(inst1.disposed).toBe(false)

    unmount()
    el.remove()
  })

  it('preserves the live group across a swap (runtime-assigned group wins)', async () => {
    const theme = signal<string>('light-ish')

    const el = document.createElement('div')
    document.body.appendChild(el)

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), {
        theme: () => theme(),
        group: 'sales',
      }),
    )
    chart.ref(el)
    await tick()

    const inst1 = asFake(chart.instance())
    expect(inst1.group).toBe('sales')
    // Runtime mutation (e.g. re-grouping for connect()) must survive too.
    inst1.group = 'q3-dashboard'

    theme.set('dark')

    const inst2 = asFake(chart.instance())
    expect(inst2).not.toBe(inst1)
    expect(inst2.group).toBe('q3-dashboard')

    unmount()
    el.remove()
  })

  it('re-fires onInit for the re-created instance', async () => {
    const theme = signal<string | null>(null)
    const seen: unknown[] = []

    const el = document.createElement('div')
    document.body.appendChild(el)

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), {
        theme: () => theme(),
        onInit: (inst) => seen.push(inst),
      }),
    )
    chart.ref(el)
    await tick()
    expect(seen.length).toBe(1)

    theme.set('dark')
    expect(seen.length).toBe(2)
    expect(seen[1]).toBe(chart.instance())

    unmount()
    el.remove()
  })

  it('a theme VALUE (non-accessor) stays static — applied once at init', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), { theme: 'dark' }),
    )
    chart.ref(el)
    await tick()

    expect(asFake(chart.instance()).__theme).toBe('dark')

    unmount()
    el.remove()
  })

  it('<Chart> rebinds event handlers + a signal-read theme VALUE prop is live', async () => {
    const theme = signal<string>('one')
    const clicks: string[] = []

    const container = document.createElement('div')
    document.body.appendChild(container)

    let instance: (() => unknown) | null = null
    // `theme={_rp(() => theme())}` is the exact shape the REAL compiler emits
    // for `theme={theme()}` (this test file compiles through the automatic
    // JSX runtime, which would pass a captured static value instead) — the
    // mount pipeline's makeReactiveProps converts the _rp brand to a live
    // getter, and <Chart>'s accessor normalization re-reads it per swap
    // check. Locks the "signal-read VALUE prop is live" claim in ChartProps.
    const unmount = mount(
      h(Chart, {
        options: () => ({ series: [{ type: 'bar', data: [1] }] }),
        theme: _rp(() => theme()),
        onEvents: { click: (p: ChartEventParams) => clicks.push(String(p.name)) },
        onInit: (inst: ECharts) => {
          instance = () => inst
        },
      }),
      container,
    )
    await tick()

    const inst1 = asFake(instance!())
    expect(inst1.__theme).toBe('one')
    expect(inst1.onCalls).toContain('click')

    theme.set('two')
    await tick(10)

    const inst2 = asFake(instance!())
    expect(inst2).not.toBe(inst1)
    expect(inst2.__theme).toBe('two')
    // Event effect unbound from the disposed instance and rebound to the new
    // one (it subscribes to instance() — the publish re-runs it).
    expect(inst1.offCalls).toContain('click')
    expect(inst2.onCalls).toContain('click')

    unmount()
    container.remove()
  })
})

// ─── Cached-modules sync fast path ───────────────────────────────────────────

describe('cached-modules sync fast path', () => {
  it('a chart whose modules are already warm initializes SYNCHRONOUSLY after ref()', async () => {
    const elA = document.createElement('div')
    const elB = document.createElement('div')
    document.body.append(elA, elB)

    // Chart A — cold path: async module load.
    const { result: chartA, unmount: unmountA } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] })),
    )
    chartA.ref(elA)
    expect(chartA.instance()).toBeNull() // cold = async, not ready yet
    await tick()
    expect(chartA.instance()).not.toBeNull()

    // Chart B — same module needs → warm → SYNCHRONOUS init, no promise hop.
    const { result: chartB, unmount: unmountB } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [2] }] })),
    )
    chartB.ref(elB)
    expect(chartB.instance()).not.toBeNull()
    expect(chartB.loading()).toBe(false)
    // The first setOption also landed synchronously.
    expect(asFake(chartB.instance()).setOptionCalls.length).toBe(1)

    unmountA()
    unmountB()
    elA.remove()
    elB.remove()
  })

  it('a warm-cache chart with an UNREGISTERED module still takes the async path', async () => {
    const elA = document.createElement('div')
    const elB = document.createElement('div')
    document.body.append(elA, elB)

    const { result: chartA, unmount: unmountA } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] })),
    )
    chartA.ref(elA)
    await tick()

    // line is NOT registered yet — must not fake a sync init.
    const { result: chartB, unmount: unmountB } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'line', data: [2] }] })),
    )
    chartB.ref(elB)
    expect(chartB.instance()).toBeNull()
    await tick()
    expect(chartB.instance()).not.toBeNull()

    unmountA()
    unmountB()
    elA.remove()
    elB.remove()
  })
})

// ─── Autoresize config ───────────────────────────────────────────────────────

describe('autoresize', () => {
  let observed: Element[]
  let constructed: number
  const RealRO = globalThis.ResizeObserver

  beforeEach(() => {
    observed = []
    constructed = 0
    class SpyResizeObserver {
      constructor(_cb: ResizeObserverCallback) {
        constructed++
      }
      observe(el: Element) {
        observed.push(el)
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = SpyResizeObserver as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    globalThis.ResizeObserver = RealRO
  })

  it('observes the container by default', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] })),
    )
    chart.ref(el)
    await tick()
    expect(constructed).toBe(1)
    expect(observed).toContain(el)
    unmount()
    el.remove()
  })

  it('autoresize: false skips the ResizeObserver entirely', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), { autoresize: false }),
    )
    chart.ref(el)
    await tick()
    expect(chart.instance()).not.toBeNull() // chart still initialized
    expect(constructed).toBe(0)
    unmount()
    el.remove()
  })

  it('_throttle fires leading + ONE trailing call and cancel() clears the pending timer', async () => {
    let calls = 0
    const t = _throttle(() => {
      calls++
    }, 30)

    t.run() // leading — immediate
    expect(calls).toBe(1)
    t.run()
    t.run()
    t.run() // coalesced into one trailing (synchronous — same window)
    expect(calls).toBe(1)

    // Poll for the trailing fire instead of a fixed sleep — under CI load
    // the trailing timer can land late, and a fixed-offset `run()` would
    // race the window boundary (observed flake).
    const start = Date.now()
    while (calls < 2 && Date.now() - start < 2000) {
      await tick(5)
    }
    expect(calls).toBe(2)

    // Let the window fully elapse SINCE the observed trailing invoke, so the
    // next run() is deterministically leading.
    await tick(40)
    t.run() // leading again (window elapsed)
    expect(calls).toBe(3)
    t.run() // schedules trailing (same tick — inside the window)
    t.cancel()
    await tick(60)
    expect(calls).toBe(3)
  })
})
