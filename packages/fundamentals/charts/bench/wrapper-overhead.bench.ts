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
  mount: number[]
  update: number[] // per single update
  dispose: number[]
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
    mount: mountSamples,
    update: updateSamples,
    dispose: disposeSamples,
  }
}

// ─── Run — per-impl PROCESS ISOLATION (the store/dnd-bench protocol) ─────────
// Child mode: `bun wrapper-overhead.bench.ts <pyreon|react>` runs ONE impl in
// a fresh process and prints raw samples as JSON. Orchestrator (no args)
// spawns K fresh children per impl and pools — impls never share a heap/JIT,
// closing the single-process order-bias caveat the store-bench audit proved
// can inflate ratios.

function fmt(n: number): string {
  if (n >= 1) return `${n.toFixed(2)}ms`
  return `${(n * 1000).toFixed(1)}µs`
}

function median(xs: number[]): number {
  const s2 = [...xs].sort((a, b) => a - b)
  return s2[s2.length >> 1] as number
}

function bootstrapCI(samples: number[], resamples = 2_000): [number, number] {
  const meds: number[] = []
  const n = samples.length
  for (let r = 0; r < resamples; r++) {
    const re: number[] = []
    for (let i = 0; i < n; i++) re.push(samples[(Math.random() * n) | 0] as number)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[(resamples * 0.025) | 0] as number, meds[(resamples * 0.975) | 0] as number]
}
const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1]

const IMPL_ARG = process.argv[2]
if (IMPL_ARG === 'pyreon' || IMPL_ARG === 'react') {
  const result = await benchDriver(IMPL_ARG === 'pyreon' ? makePyreonDriver : makeReactDriver)
  process.stdout.write(JSON.stringify(result))
  process.exit(0)
}

const PROCS = 3
function runImpl(impl: 'pyreon' | 'react'): Result {
  const pooled: Result = { mount: [], update: [], dispose: [] }
  for (let i = 0; i < PROCS; i++) {
    const proc = (globalThis as unknown as { Bun: { spawnSync: (cmd: string[], opts: object) => { stdout: Uint8Array; exitCode: number } } }).Bun.spawnSync(
      ['bun', new URL(import.meta.url).pathname, impl],
      { env: { ...process.env, NODE_ENV: 'production' }, stdout: 'pipe', stderr: 'inherit' },
    )
    if (proc.exitCode !== 0) throw new Error(`[bench] child ${impl}#${i} failed`)
    const out = JSON.parse(new TextDecoder().decode(proc.stdout)) as Result
    pooled.mount.push(...out.mount)
    pooled.update.push(...out.update)
    pooled.dispose.push(...out.dispose)
  }
  return pooled
}

console.log('# @pyreon/charts vs echarts-for-react — wrapper overhead\n')
console.log(
  `NODE_ENV=${process.env.NODE_ENV}  samples=${SAMPLES}×${PROCS} fresh processes/impl  updates/sample=${UPDATES}`,
)
console.log(
  'Shared fake ECharts engine (identical setOption); real react-dom + real echarts-for-react. Per-impl PROCESS ISOLATION (no shared heap/JIT/order bias); pooled median + bootstrap CI95; 🤝 = CI overlap (tie).\n',
)

const pyreon = runImpl('pyreon')
const react = runImpl('react')

function verdict(p: number[], r: number[]): string {
  const ciP = bootstrapCI(p)
  const ciR = bootstrapCI(r)
  if (overlaps(ciP, ciR)) return '🤝 tie (CI95 overlap)'
  const rt = median(r) / median(p)
  return rt >= 1 ? `**${rt.toFixed(2)}× faster**` : `**${(1 / rt).toFixed(2)}× slower**`
}

const rows: [string, number[], number[]][] = [
  ['Mount → ready', pyreon.mount, react.mount],
  ['Reactive update (per update)', pyreon.update, react.update],
  ['Dispose', pyreon.dispose, react.dispose],
]

console.log('| Phase | @pyreon/charts (median [p25–p75]) | echarts-for-react (median [p25–p75]) | Pyreon vs efr |')
console.log('| --- | --- | --- | --- |')
for (const [name, ps, rs] of rows) {
  const st = stats(ps)
  const rt = stats(rs)
  console.log(
    `| ${name} | ${fmt(st.median)} [${fmt(st.p25)}–${fmt(st.p75)}] | ${fmt(rt.median)} [${fmt(rt.p25)}–${fmt(rt.p75)}] | ${verdict(ps, rs)} |`,
  )
}
console.log(
  '\nAuthor-judge: framework author wrote + runs this bench. Engine is stubbed to isolate wrapper JS — this is NOT a claim about chart render speed (identical ECharts for both). Magnitudes are the signal. A vue-echarts driver (the feature-leading competitor) is a tracked follow-up — beating only the React wrapper is a scoped, not universal, claim.',
)
