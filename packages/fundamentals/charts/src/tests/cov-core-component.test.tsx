/**
 * `<EChart>` and `useChart` on the config the other suites leave unset: every
 * pass-through init/setOption option, the event-shorthand merge, the loading
 * overlay, and the error paths (a throwing options fn, a throwing init, a
 * rejected module load, a throwing setOption, a non-Error throw).
 *
 * Mocked echarts, same rationale as charts.test.tsx — the wrapper's state
 * machine is under test, not ECharts. The fake instance RECORDS its init args
 * and calls so a spec can read what the wrapper actually passed.
 */
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'

interface FakeInstance {
  __theme: unknown
  __initOpts: Record<string, unknown>
  group: string
  disposed: boolean
  setOptionCalls: [unknown, unknown][]
  loadingCalls: string[]
  onCalls: string[]
  offCalls: string[]
  setOption(o: unknown, so?: unknown): void
  resize(): void
  dispose(): void
  on(n: string, cb?: unknown): void
  off(n: string, cb?: unknown): void
  showLoading(kind?: string, opts?: unknown): void
  hideLoading(): void
}

/**
 * What each fake site throws, if anything. A VALUE rather than a boolean so a
 * spec can throw a non-Error and assert the wrapper still hands the consumer
 * an `Error` — the contract `error()` promises.
 */
const hooks: { initThrows: unknown; setOptionThrows: unknown; useThrows: unknown } = { initThrows: undefined, setOptionThrows: undefined, useThrows: undefined }

vi.mock('echarts/core', () => {
  const init = (_el: unknown, theme: unknown, opts: Record<string, unknown>): FakeInstance => {
    if (hooks.initThrows !== undefined) throw hooks.initThrows
    return {
      __theme: theme ?? null,
      __initOpts: opts,
      group: '',
      disposed: false,
      setOptionCalls: [],
      loadingCalls: [],
      onCalls: [],
      offCalls: [],
      setOption(o: unknown, so?: unknown) {
        if (hooks.setOptionThrows !== undefined) throw hooks.setOptionThrows
        this.setOptionCalls.push([o, so])
      },
      resize() {},
      dispose() {
        this.disposed = true
      },
      on(n: string) {
        this.onCalls.push(n)
      },
      off(n: string) {
        this.offCalls.push(n)
      },
      showLoading(kind?: string) {
        this.loadingCalls.push('show:' + String(kind))
      },
      hideLoading() {
        this.loadingCalls.push('hide')
      },
    }
  }
  const use = (): void => {
    if (hooks.useThrows !== undefined) throw hooks.useThrows
  }
  const connect = (): void => {}
  return { init, use, connect, default: { init, use, connect } }
})

vi.mock('echarts/charts', () => ({ BarChart: { __echartsStub: 'BarChart' }, LineChart: { __echartsStub: 'LineChart' } }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: { __echartsStub: 'CanvasRenderer' }, SVGRenderer: { __echartsStub: 'SVGRenderer' } }))

import { EChart } from '../chart-component'
import { _resetLoader } from '../loader'
import { _throttle, useChart } from '../use-chart'
import type { ChartEventParams } from '../types'

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Child = () => {
    result = fn()
    return null
  }
  const unmount = mount(<Child />, el)
  return { result: result!, unmount: () => { unmount(); el.remove() } }
}

const tick = (ms = 40) => new Promise<void>((r) => setTimeout(r, ms))
const asFake = (i: unknown): FakeInstance => i as FakeInstance

afterEach(() => {
  hooks.initThrows = undefined
  hooks.setOptionThrows = undefined
  hooks.useThrows = undefined
  _resetLoader()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('_throttle — leading call, coalesced trailing call, cancellable', () => {
  it('fires immediately, coalesces a burst into ONE trailing call, and cancel drops it', async () => {
    let fired = 0
    const t = _throttle(() => { fired += 1 }, 20)
    t.run()
    expect(fired).toBe(1)
    // Inside the window: three calls, one trailing fire.
    t.run()
    t.run()
    t.run()
    expect(fired).toBe(1)
    await tick(50)
    expect(fired).toBe(2)
    // A run AFTER the window fires immediately again, clearing any pending timer.
    t.run()
    expect(fired).toBe(3)
    t.run()
    await tick(5)
    t.run()
    await tick(50)
    expect(fired).toBe(4)
  })

  it('a leading call that finds a LATE pending timer clears it rather than firing twice', async () => {
    let fired = 0
    const t = _throttle(() => { fired += 1 }, 20)
    t.run()
    t.run() // schedules the trailing call
    expect(fired).toBe(1)
    // Block the loop past the window, so the timer is due but has not run.
    const until = Date.now() + 40
    while (Date.now() < until) { /* busy */ }
    t.run()
    expect(fired).toBe(2)
    // The cleared timer does not fire a third time.
    await tick(60)
    expect(fired).toBe(2)
  })

  it('cancel clears a pending trailing call, and is safe with none pending', async () => {
    let fired = 0
    const t = _throttle(() => { fired += 1 }, 20)
    t.run()
    t.run()
    t.cancel()
    await tick(50)
    expect(fired).toBe(1)
    expect(() => t.cancel()).not.toThrow()
  })
})

describe('useChart — every init option reaches echarts.init', () => {
  it('passes locale, devicePixelRatio, width, height and group, and lets initOptions win a collision', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), {
        locale: 'DE',
        devicePixelRatio: 3,
        width: 321,
        height: 123,
        group: 'g1',
        initOptions: { height: 999, useDirtyRect: true },
      }),
    )
    chart.ref(el)
    await tick()
    const inst = asFake(chart.instance())
    expect(inst.__initOpts['locale']).toBe('DE')
    expect(inst.__initOpts['devicePixelRatio']).toBe(3)
    expect(inst.__initOpts['width']).toBe(321)
    // The escape hatch is applied LAST, so it overrides the modelled key.
    expect(inst.__initOpts['height']).toBe(999)
    expect(inst.__initOpts['useDirtyRect']).toBe(true)
    expect(inst.group).toBe('g1')
    unmount()
  })

  it('an UNSET option is simply absent — not passed as undefined', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { result: chart, unmount } = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] })))
    chart.ref(el)
    await tick()
    const opts = asFake(chart.instance()).__initOpts
    for (const k of ['locale', 'devicePixelRatio', 'width', 'height']) expect(k in opts).toBe(false)
    expect(asFake(chart.instance()).group).toBe('')
    unmount()
  })
})

describe('useChart — every setOption flag reaches the instance', () => {
  it('passes replaceMerge, silent and transition, and defaults notMerge/lazyUpdate', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), {
        notMerge: true,
        replaceMerge: ['series'],
        lazyUpdate: false,
        silent: true,
        transition: { to: { dimension: 'x' } },
      }),
    )
    chart.ref(el)
    await tick()
    const [, so] = asFake(chart.instance()).setOptionCalls[0]!
    expect(so).toEqual({ notMerge: true, replaceMerge: ['series'], lazyUpdate: false, silent: true, transition: { to: { dimension: 'x' } } })
    unmount()
  })

  it('with none of them set, only the two defaulted keys are sent', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { result: chart, unmount } = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] })))
    chart.ref(el)
    await tick()
    const [, so] = asFake(chart.instance()).setOptionCalls[0]!
    expect(so).toEqual({ notMerge: false, lazyUpdate: true })
    unmount()
  })
})

describe('useChart — autoresize config', () => {
  it('observes by default, does NOT observe when disabled, and throttles when asked', async () => {
    const seen: unknown[] = []
    class FakeRO {
      constructor(public cb: () => void) { seen.push(cb) }
      observe(): void {}
      disconnect(): void {}
    }
    const original = globalThis.ResizeObserver
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO as never
    try {
      const mk = (autoresize: unknown) => {
        const el = document.createElement('div')
        document.body.appendChild(el)
        const r = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), { autoresize: autoresize as never }))
        r.result.ref(el)
        return r
      }
      const on = mk(undefined)
      await tick()
      expect(seen).toHaveLength(1)
      on.unmount()

      const off = mk(false)
      await tick()
      expect(seen).toHaveLength(1)
      off.unmount()

      const throttled = mk({ throttle: 50 })
      await tick()
      expect(seen).toHaveLength(2)
      throttled.unmount()

      // A zero/absent throttle uses the raw callback, not a throttled one.
      const zero = mk({ throttle: 0 })
      await tick()
      expect(seen).toHaveLength(3)
      zero.unmount()
    } finally {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = original
    }
  })

  it('skips the observer entirely where ResizeObserver does not exist', async () => {
    const original = globalThis.ResizeObserver
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined
    try {
      const el = document.createElement('div')
      document.body.appendChild(el)
      const { result: chart, unmount } = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] })))
      chart.ref(el)
      await tick()
      // The chart still initialises — only the observer is skipped.
      expect(chart.instance()).not.toBeNull()
      expect(() => chart.resize()).not.toThrow()
      unmount()
    } finally {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = original
    }
  })
})

describe('useChart — the error paths', () => {
  it('a THROWING options fn surfaces the error and stops loading', async () => {
    const { result: chart, unmount } = mountWith(() =>
      useChart(() => { throw new Error('bad option') }),
    )
    const el = document.createElement('div')
    document.body.appendChild(el)
    chart.ref(el)
    await tick()
    expect(chart.error()?.message).toBe('bad option')
    expect(chart.loading()).toBe(false)
    unmount()
  })

  it('a NON-Error throw is wrapped so the consumer always gets an Error', async () => {
    const { result: chart, unmount } = mountWith(() =>
      // eslint-disable-next-line no-throw-literal
      useChart(() => { throw 'a string' as never }),
    )
    const el = document.createElement('div')
    document.body.appendChild(el)
    chart.ref(el)
    await tick()
    expect(chart.error()).toBeInstanceOf(Error)
    expect(chart.error()?.message).toBe('a string')
    unmount()
  })

  it('a THROWING init surfaces the error instead of publishing a half-built instance', async () => {
    hooks.initThrows = new Error('init failed')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { result: chart, unmount } = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] })))
    chart.ref(el)
    await tick()
    expect(chart.error()?.message).toBe('init failed')
    expect(chart.instance()).toBeNull()
    expect(chart.loading()).toBe(false)
    unmount()
  })

  it('a THROWING setOption is reported without tearing the instance down', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const data = signal([1])
    const { result: chart, unmount } = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: data() }] })))
    chart.ref(el)
    await tick()
    expect(chart.error()).toBeNull()
    hooks.setOptionThrows = new Error('setOption failed')
    data.set([1, 2])
    await tick()
    expect(chart.error()?.message).toBe('setOption failed')
    expect(chart.instance()).not.toBeNull()
    // Recovering clears the error again.
    hooks.setOptionThrows = undefined
    data.set([1, 2, 3])
    await tick()
    expect(chart.error()).toBeNull()
    unmount()
  })

  it('a theme swap whose re-init throws clears the published instance rather than leaving a disposed one', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const theme = signal<string | null>(null)
    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), { theme: () => theme() }),
    )
    chart.ref(el)
    await tick()
    const first = asFake(chart.instance())
    expect(first.disposed).toBe(false)
    hooks.initThrows = new Error('init failed')
    theme.set('dark')
    await tick()
    expect(first.disposed).toBe(true)
    expect(chart.instance()).toBeNull()
    expect(chart.error()?.message).toBe('init failed')
    unmount()
  })

  it('a theme flip BEFORE the container is bound changes nothing — the value is read at init', async () => {
    const theme = signal<string | null>(null)
    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), { theme: () => theme() }),
    )
    theme.set('dark')
    await tick()
    expect(chart.instance()).toBeNull()
    expect(chart.error()).toBeNull()
    // Binding now picks the LIVE theme up.
    const el = document.createElement('div')
    document.body.appendChild(el)
    chart.ref(el)
    await tick()
    expect(asFake(chart.instance()).__theme).toBe('dark')
    // Re-setting the SAME theme does not dispose and re-init.
    const same = chart.instance()
    theme.set('dark')
    await tick()
    expect(chart.instance()).toBe(same)
    unmount()
  })
})

describe('useChart — a NON-Error at every failing site still reaches the consumer as an Error', () => {
  it('wraps a string thrown by init (sync), by setOption, and by a theme re-init', async () => {
    // 1. init, on the synchronous fast path.
    hooks.initThrows = 'init string'
    const el = document.createElement('div')
    document.body.appendChild(el)
    const first = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] })))
    first.result.ref(el)
    await tick()
    expect(first.result.error()).toBeInstanceOf(Error)
    expect(first.result.error()?.message).toBe('init string')
    first.unmount()

    // 2. setOption, on a live instance.
    hooks.initThrows = undefined
    const el2 = document.createElement('div')
    document.body.appendChild(el2)
    const data = signal([1])
    const second = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: data() }] })))
    second.result.ref(el2)
    await tick()
    hooks.setOptionThrows = 'setOption string'
    data.set([1, 2])
    await tick()
    expect(second.result.error()).toBeInstanceOf(Error)
    expect(second.result.error()?.message).toBe('setOption string')
    second.unmount()

    // 3. the theme-swap re-init.
    hooks.setOptionThrows = undefined
    const el3 = document.createElement('div')
    document.body.appendChild(el3)
    const theme = signal<string | null>(null)
    const third = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), { theme: () => theme() }))
    third.result.ref(el3)
    await tick()
    hooks.initThrows = 'swap string'
    theme.set('dark')
    await tick()
    expect(third.result.error()).toBeInstanceOf(Error)
    expect(third.result.error()?.message).toBe('swap string')
    third.unmount()
  })

  it('a theme flip AFTER the container is released swaps nothing', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const theme = signal<string | null>(null)
    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({ series: [{ type: 'bar', data: [1] }] }), { theme: () => theme() }),
    )
    chart.ref(el)
    await tick()
    const live = chart.instance()
    // Releasing the container leaves the instance published but unbound.
    chart.ref(null)
    theme.set('dark')
    await tick()
    expect(chart.instance()).toBe(live)
    expect(asFake(live).disposed).toBe(false)
    expect(chart.error()).toBeNull()
    unmount()
  })
})

// NOTE: `<EChart>`'s `err instanceof Error ? err.message : String(err)` cannot
// take its else arm — `useChart` already wraps every non-Error failure in an
// `Error` before publishing it, so `chart.error()` is never anything else.

describe('useChart — the SYNC fast path and the module-load failure', () => {
  it('a SECOND chart with warm modules initialises synchronously, and its init failure lands on that path', async () => {
    // Warm the loader with a successful mount.
    const warm = document.createElement('div')
    document.body.appendChild(warm)
    const first = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] })))
    first.result.ref(warm)
    await tick()
    expect(first.result.instance()).not.toBeNull()
    first.unmount()

    // The next chart over the SAME series type initialises in the mount frame.
    const el = document.createElement('div')
    document.body.appendChild(el)
    const second = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [2] }] })))
    second.result.ref(el)
    expect(second.result.instance()).not.toBeNull()
    expect(second.result.loading()).toBe(false)
    second.unmount()

    // A failure on that same synchronous path is reported, as an Error either way.
    hooks.initThrows = new Error('sync init failed')
    const el3 = document.createElement('div')
    document.body.appendChild(el3)
    const third = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [3] }] })))
    third.result.ref(el3)
    expect(third.result.error()?.message).toBe('sync init failed')
    expect(third.result.loading()).toBe(false)
    third.unmount()

    hooks.initThrows = 'sync init string'
    const el4 = document.createElement('div')
    document.body.appendChild(el4)
    const fourth = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [4] }] })))
    fourth.result.ref(el4)
    expect(fourth.result.error()).toBeInstanceOf(Error)
    expect(fourth.result.error()?.message).toBe('sync init string')
    fourth.unmount()
  })

  it('a module load that REJECTS surfaces the failure instead of hanging on `loading`', async () => {
    hooks.useThrows = new Error('module registration failed')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { result: chart, unmount } = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] })))
    chart.ref(el)
    await tick()
    expect(chart.error()?.message).toBe('module registration failed')
    expect(chart.loading()).toBe(false)
    expect(chart.instance()).toBeNull()
    unmount()
  })

  it('a NON-Error module-load rejection is wrapped too', async () => {
    hooks.useThrows = 'module string'
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { result: chart, unmount } = mountWith(() => useChart(() => ({ series: [{ type: 'bar', data: [1] }] })))
    chart.ref(el)
    await tick()
    expect(chart.error()).toBeInstanceOf(Error)
    expect(chart.error()?.message).toBe('module string')
    unmount()
  })
})

describe('<EChart> — the props it forwards and the DOM it renders', () => {
  const mountChart = (props: Record<string, unknown>) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const unmount = mount(h(EChart as never, props), host)
    return { host, unmount: () => { unmount(); host.remove() } }
  }

  it('forwards every init/update option it is given', async () => {
    let captured: unknown = null
    const { unmount } = mountChart({
      options: () => ({ series: [{ type: 'bar', data: [1] }] }),
      renderer: 'svg',
      locale: 'FR',
      group: 'grp',
      initOptions: { useDirtyRect: true },
      autoresize: false,
      notMerge: true,
      replaceMerge: ['series'],
      lazyUpdate: false,
      silent: true,
      transition: { to: { dimension: 'y' } },
      onInit: (i: unknown) => { captured = i },
    })
    await tick()
    const inst = asFake(captured)
    expect(inst).not.toBeNull()
    expect(inst.__initOpts['locale']).toBe('FR')
    expect(inst.__initOpts['renderer']).toBe('svg')
    expect(inst.__initOpts['useDirtyRect']).toBe(true)
    expect(inst.group).toBe('grp')
    expect(inst.setOptionCalls[0]![1]).toEqual({ notMerge: true, replaceMerge: ['series'], lazyUpdate: false, silent: true, transition: { to: { dimension: 'y' } } })
    unmount()
  })

  it('binds the event shorthands and the general map, skipping an empty entry, and unbinds on dispose', async () => {
    let captured: FakeInstance | null = null
    const clicks: number[] = []
    const { unmount } = mountChart({
      options: () => ({ series: [{ type: 'bar', data: [1] }] }),
      onClick: (p: ChartEventParams) => clicks.push(Number(p.dataIndex ?? -1)),
      onMouseover: () => {},
      onMouseout: () => {},
      onEvents: { legendselectchanged: () => {}, brushEnd: undefined },
      onInit: (i: unknown) => { captured = asFake(i) },
    })
    await tick()
    const inst = captured as unknown as FakeInstance
    expect(inst.onCalls.sort()).toEqual(['click', 'legendselectchanged', 'mouseout', 'mouseover'])
    // The `undefined` entry bound nothing.
    expect(inst.onCalls).not.toContain('brushEnd')
    unmount()
    await tick()
    expect(inst.offCalls.sort()).toEqual(inst.onCalls.sort())
  })

  it('accepts a theme as a plain VALUE and as an accessor', async () => {
    let captured: FakeInstance | null = null
    const flat = mountChart({ options: () => ({ series: [{ type: 'bar', data: [1] }] }), theme: 'dark', onInit: (i: unknown) => { captured = asFake(i) } })
    await tick()
    expect((captured as unknown as FakeInstance).__theme).toBe('dark')
    flat.unmount()

    captured = null
    const live = signal('midnight')
    const accessor = mountChart({ options: () => ({ series: [{ type: 'bar', data: [1] }] }), theme: () => live(), onInit: (i: unknown) => { captured = asFake(i) } })
    await tick()
    expect((captured as unknown as FakeInstance).__theme).toBe('midnight')
    // The accessor form stays live: a flip re-inits with the new theme.
    live.set('daylight')
    await tick()
    expect((captured as unknown as FakeInstance).__theme).toBe('daylight')
    accessor.unmount()
  })

  it('a chart with NO handlers binds nothing at all', async () => {
    let captured: FakeInstance | null = null
    const { unmount } = mountChart({
      options: () => ({ series: [{ type: 'bar', data: [1] }] }),
      onInit: (i: unknown) => { captured = asFake(i) },
    })
    await tick()
    expect((captured as unknown as FakeInstance).onCalls).toEqual([])
    unmount()
  })

  it('showLoading toggles the built-in overlay as the signal flips', async () => {
    let captured: FakeInstance | null = null
    const busy = signal(true)
    const { unmount } = mountChart({
      options: () => ({ series: [{ type: 'bar', data: [1] }] }),
      // `_rp` is what the compiler emits for `showLoading={busy()}` — a live
      // getter, so the effect re-runs on the flip. A bare function would be
      // permanently truthy and the overlay would never hide.
      showLoading: _rp(() => busy()),
      loadingOption: { text: 'Loading…' },
      onInit: (i: unknown) => { captured = asFake(i) },
    })
    await tick()
    const inst = captured as unknown as FakeInstance
    expect(inst.loadingCalls[0]).toBe('show:default')
    busy.set(false)
    await tick()
    expect(inst.loadingCalls[inst.loadingCalls.length - 1]).toBe('hide')
    unmount()
  })

  it('renders role="img" ONLY with an accessible name', async () => {
    const named = mountChart({ options: () => ({ series: [{ type: 'bar', data: [1] }] }), ariaLabel: 'Revenue by month' })
    await tick()
    const div = named.host.querySelector('div')!
    expect(div.getAttribute('role')).toBe('img')
    expect(div.getAttribute('aria-label')).toBe('Revenue by month')
    named.unmount()

    const bare = mountChart({ options: () => ({ series: [{ type: 'bar', data: [1] }] }) })
    await tick()
    const plain = bare.host.querySelector('div')!
    expect(plain.hasAttribute('role')).toBe(false)
    bare.unmount()
  })

  it('an error is logged ONCE per distinct error and rendered inline in dev', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = signal(true)
    const { host, unmount } = mountChart({
      options: () => {
        if (bad()) throw new Error('boom')
        return { series: [{ type: 'bar', data: [1] }] }
      },
      class: 'my-chart',
    })
    await tick()
    expect(err).toHaveBeenCalledTimes(1)
    const panel = host.querySelector('[data-pyreon-chart-error="true"]')
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain('boom')
    expect(panel!.getAttribute('class')).toBe('my-chart')
    // The SAME error object re-read logs nothing further.
    bad.set(true)
    await tick()
    expect(err).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('a NON-Error failure is stringified into the inline panel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { host, unmount } = mountChart({
      // eslint-disable-next-line no-throw-literal
      options: () => { throw 'plain string failure' as never },
    })
    await tick()
    expect(host.querySelector('[data-pyreon-chart-error="true"]')!.textContent).toContain('plain string failure')
    unmount()
  })
})
