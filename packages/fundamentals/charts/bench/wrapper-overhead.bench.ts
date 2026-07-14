/**
 * @pyreon/charts vs echarts-for-react — WRAPPER-OVERHEAD benchmark.
 *
 * Both libraries wrap the SAME ECharts engine, so benchmarking "which chart
 * renders faster" would just measure ECharts (identical for both). This bench
 * isolates the ONLY thing that differs: the wrapper's own JS work around the
 * engine — how it mounts, how it turns a data change into a `setOption` call,
 * and how it tears down.
 *
 * Fairness — the engine is IDENTICAL and NEAR-FREE for both sides:
 *   - A single shared `fakeSetOption()` (bumps a counter) stands in for
 *     ECharts' real `setOption`. Both wrappers call it, so per-call engine
 *     cost is byte-identical and near-zero → the measured time is dominated by
 *     the WRAPPER, which is the point.
 *   - React side: the REAL `echarts-for-react` (its `core` entry, injected our
 *     fake `echarts`) driven by the REAL React 19 reconciler + react-dom in a
 *     real DOM (happy-dom), `flushSync` per update (synchronous commit).
 *   - Pyreon side: the REAL `<Chart>` component + `useChart` mounted through
 *     the REAL `@pyreon/runtime-dom`, its lazy ECharts loader mocked to the
 *     same fake. Updates driven by a REAL signal.
 *
 * Protocol (repo convention):
 *   - `NODE_ENV=production` set BEFORE any framework import (React's dev
 *     reconciler + Pyreon's dev devtools registry dominate otherwise).
 *   - Competitor resolved to the build that does the work (real react-dom
 *     reconciler + real echarts-for-react — NOT a stub).
 *   - Per-sample fresh mounts; warm-up; median + p25/p75 over K samples.
 *   - Correctness gate: every phase asserts the wrapper actually issued the
 *     expected number of `setOption` calls (an empty measurement is a bug).
 *   - Author-judge disclosed: the framework author wrote AND runs this bench.
 *     Treat magnitudes/ratios as the signal, not the last digit.
 *
 * Run: NODE_ENV=production bun packages/fundamentals/charts/bench/wrapper-overhead.bench.ts
 */

process.env.NODE_ENV = 'production'

// ─── Real DOM (happy-dom) — react-dom + Pyreon runtime both need it ──────────
import { Window } from 'happy-dom'

const win = new Window({ url: 'http://localhost' })
const g = globalThis as unknown as Record<string, unknown>
g.window = win
g.document = win.document
g.navigator = win.navigator
g.HTMLElement = win.HTMLElement
g.Element = win.Element
g.Node = win.Node
if (!g.MessageChannel) g.MessageChannel = win.MessageChannel
// Pyreon's useChart creates a ResizeObserver; happy-dom may not ship one.
if (!g.ResizeObserver) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ─── Shared fake ECharts engine (identical, near-free for both sides) ────────

let setOptionCount = 0
function fakeSetOption(): void {
  setOptionCount++
}

/** Fake instance surface used by BOTH wrappers. */
function makeFakeInstance() {
  return {
    setOption: fakeSetOption,
    resize() {},
    dispose() {},
    on(ev: string, cb?: () => void) {
      // echarts-for-react awaits a 'finished' event before its instance is
      // "ready"; fire it on the next microtask so its init promise resolves.
      if (ev === 'finished' && cb) queueMicrotask(cb)
    },
    off() {},
    showLoading() {},
    hideLoading() {},
    getOption() {
      return {}
    },
    clear() {},
  }
}

// echarts-for-react's `echarts` prop surface: init/getInstanceByDom/dispose.
function makeFakeEchartsForReact() {
  const byDom = new WeakMap<object, ReturnType<typeof makeFakeInstance>>()
  return {
    init(dom: object) {
      const inst = makeFakeInstance()
      byDom.set(dom, inst)
      return inst
    },
    getInstanceByDom(dom: object) {
      return byDom.get(dom)
    },
    dispose(dom: object) {
      byDom.delete(dom)
    },
  }
}

// Pyreon's loader imports `echarts/core` + subpaths — mock them to the fake.
const { mock } = await import('bun:test')
mock.module('echarts/core', () => ({
  use() {},
  init() {
    return makeFakeInstance()
  },
}))
mock.module('echarts/charts', () => ({ BarChart: {} }))
mock.module('echarts/components', () => ({ GridComponent: {} }))
mock.module('echarts/renderers', () => ({ CanvasRenderer: {} }))

// ─── Option builder (identical shape for both) ───────────────────────────────

function buildOption(n: number) {
  return { series: [{ type: 'bar', data: [n, n + 1, n + 2, n + 3] }] }
}

// ─── React / echarts-for-react driver ────────────────────────────────────────

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')
const EChartsReactCore = (await import('echarts-for-react/lib/core')).default as unknown as (
  props: Record<string, unknown>,
) => unknown

interface Driver {
  mount(): Promise<void>
  update(i: number): void
  dispose(): void
}

function makeReactDriver(): Driver {
  const container = win.document.createElement('div')
  win.document.body.appendChild(container)
  const root = createRoot(container)
  let setN: ((n: number) => void) | null = null
  let readyResolve: (() => void) | null = null
  const fake = makeFakeEchartsForReact()

  function App() {
    const [state, set] = React.useState(0)
    setN = set
    return React.createElement(EChartsReactCore, {
      echarts: fake,
      option: buildOption(state),
      style: { width: '300px', height: '200px' },
      notMerge: false,
      lazyUpdate: true,
      autoResize: false, // skip size-sensor (not the wrapper cost under test)
      onChartReady: () => readyResolve?.(),
    })
  }

  return {
    async mount() {
      const ready = new Promise<void>((r) => {
        readyResolve = r
      })
      flushSync(() => root.render(React.createElement(App)))
      await ready
    },
    update(i: number) {
      flushSync(() => setN!(i))
    },
    dispose() {
      root.unmount()
      container.remove()
    },
  }
}

// ─── Pyreon / <Chart> driver ──────────────────────────────────────────────────

const { h } = await import('@pyreon/core')
const { signal } = await import('@pyreon/reactivity')
const { mount } = await import('@pyreon/runtime-dom')
const { Chart } = await import('../src/index.ts')

function makePyreonDriver(): Driver {
  const container = win.document.createElement('div')
  win.document.body.appendChild(container)
  const n = signal(0)
  let unmount: (() => void) | null = null
  let readyResolve: (() => void) | null = null

  return {
    async mount() {
      const ready = new Promise<void>((r) => {
        readyResolve = r
      })
      unmount = mount(
        h(Chart, {
          options: () => buildOption(n()),
          style: 'width:300px;height:200px',
          notMerge: false,
          lazyUpdate: true,
          onInit: () => readyResolve?.(),
        }),
        container as unknown as Element,
      ) as unknown as () => void
      await ready
    },
    update(i: number) {
      n.set(i)
    },
    dispose() {
      unmount?.()
      container.remove()
    },
  }
}

// ─── Bench harness ────────────────────────────────────────────────────────────

interface Stat {
  median: number
  p25: number
  p75: number
}

function stats(samples: number[]): Stat {
  const s = [...samples].sort((a, b) => a - b)
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(s.length * q))]
  return { median: at(0.5), p25: at(0.25), p75: at(0.75) }
}

const SAMPLES = 25
const UPDATES = 200
const WARMUP_UPDATES = 40

interface Result {
  mount: Stat
  update: Stat // per single update
  dispose: Stat
}

async function benchDriver(make: () => Driver): Promise<Result> {
  const mountSamples: number[] = []
  const updateSamples: number[] = []
  const disposeSamples: number[] = []

  // Warm up the JIT with a few full lifecycles first.
  for (let w = 0; w < 3; w++) {
    const d = make()
    await d.mount()
    for (let i = 0; i < WARMUP_UPDATES; i++) d.update(i)
    d.dispose()
  }

  for (let sample = 0; sample < SAMPLES; sample++) {
    const d = make()

    const preCount = setOptionCount
    const tMount = performance.now()
    await d.mount()
    mountSamples.push(performance.now() - tMount)
    if (setOptionCount <= preCount) throw new Error('mount issued no setOption')

    // warm this instance's update path
    for (let i = 0; i < WARMUP_UPDATES; i++) d.update(i)

    const beforeUpd = setOptionCount
    const tUpd = performance.now()
    for (let i = 0; i < UPDATES; i++) d.update(WARMUP_UPDATES + i)
    const updTotal = performance.now() - tUpd
    if (setOptionCount - beforeUpd !== UPDATES) {
      throw new Error(
        `expected ${UPDATES} setOption calls, got ${setOptionCount - beforeUpd}`,
      )
    }
    updateSamples.push(updTotal / UPDATES)

    const tDisp = performance.now()
    d.dispose()
    disposeSamples.push(performance.now() - tDisp)
  }

  return {
    mount: stats(mountSamples),
    update: stats(updateSamples),
    dispose: stats(disposeSamples),
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1) return `${n.toFixed(2)}ms`
  return `${(n * 1000).toFixed(1)}µs`
}

console.log('# @pyreon/charts vs echarts-for-react — wrapper overhead\n')
console.log(`NODE_ENV=${process.env.NODE_ENV}  samples=${SAMPLES}  updates/sample=${UPDATES}`)
console.log('Shared fake ECharts engine (identical setOption); real react-dom + real echarts-for-react.\n')

// Order matters little (per-sample fresh mounts), but run each fully.
const pyreon = await benchDriver(makePyreonDriver)
const react = await benchDriver(makeReactDriver)

function ratio(a: number, b: number): string {
  const r = b / a
  return r >= 1 ? `${r.toFixed(2)}× faster` : `${(1 / r).toFixed(2)}× slower`
}

const rows: [string, Stat, Stat][] = [
  ['Mount → ready', pyreon.mount, react.mount],
  ['Reactive update (per update)', pyreon.update, react.update],
  ['Dispose', pyreon.dispose, react.dispose],
]

console.log('| Phase | @pyreon/charts (median [p25–p75]) | echarts-for-react (median [p25–p75]) | Pyreon vs efr |')
console.log('| --- | --- | --- | --- |')
for (const [name, p, r] of rows) {
  console.log(
    `| ${name} | ${fmt(p.median)} [${fmt(p.p25)}–${fmt(p.p75)}] | ${fmt(r.median)} [${fmt(r.p25)}–${fmt(r.p75)}] | **${ratio(p.median, r.median)}** |`,
  )
}
console.log(
  '\nAuthor-judge: framework author wrote + runs this bench. Engine is stubbed to isolate wrapper JS — this is NOT a claim about chart render speed (identical ECharts for both). Magnitudes are the signal.',
)
