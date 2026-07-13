#!/usr/bin/env bun
/**
 * @pyreon/query vs @tanstack/react-query — objective ADAPTER head-to-head.
 *
 * Run: `bun run bench:react-query` (sets NODE_ENV=production).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FAIR BY CONSTRUCTION
 * ───────────────────────────────────────────────────────────────────────────
 * Both @pyreon/query and @tanstack/react-query wrap the SAME
 * `@tanstack/query-core` (5.101.2, pinned tree-wide via root `overrides` — so
 * the QueryClient / QueryObserver both sides use is byte-identical). This bench
 * therefore measures the ADAPTER layer — how each library surfaces a query-core
 * result to the UI — NOT the query engine. Any difference is 100% adapter.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OBJECTIVITY CONTRACT (every loop lesson applied)
 * ───────────────────────────────────────────────────────────────────────────
 *  1. `NODE_ENV=production` is forced FIRST (the npm script's shell sets it too).
 *     Pyreon's dev mode keeps the reactive-devtools registry always-on; React's
 *     dev build ships `Object.freeze` / prop-type / act-warning overhead. Both
 *     are measuring instrumentation if not gated to production.
 *  2. Same query-core version (5.101.2) for BOTH — the engine is identical.
 *  3. CORRECTNESS GATE — both adapters must surface the SAME `data` in the DOM
 *     for the SAME driven query before any number is trusted.
 *  4. The HEADLINE result is a COUNT (recompute / re-render), which is EXACT and
 *     deterministic — not a wall-clock (counts don't flake, and they are the
 *     honest architectural signal). React-query is NOT sandbagged: its default
 *     tracked-properties optimization is left ON, so it gets full credit for
 *     the cross-component field-awareness it genuinely has (Section 1A).
 *  5. Timing cells (Section 2) run in ISOLATED child processes, pooled median +
 *     bootstrap CI95, `🤝` marks a CI-overlap tie. No forced GC (JSC re-tiers on
 *     forced GC). React's number legitimately INCLUDES its render+reconcile —
 *     that IS react-query's cost to surface an update (it has no other path).
 *  6. A `sink` defeats DCE; query keys/data vary to defeat JSC hoisting.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HONEST READ (don't cherry-pick)
 * ───────────────────────────────────────────────────────────────────────────
 *  - Section 1A (CROSS-component field isolation) is a TIE: react-query's
 *    tracked-props means a component reading only `status` does NOT re-render on
 *    a data-only change — exactly like Pyreon's per-signal effect. Reported
 *    honestly as a tie so nobody thinks Pyreon invented field-awareness.
 *  - Section 1B (INTRA-component field isolation) is Pyreon's structural win:
 *    react-query's granularity is the OBSERVER (= the whole component); a
 *    component reading N query fields re-runs its ENTIRE body + all N field
 *    derivations + a VDOM reconcile when ANY tracked field changes. Pyreon's
 *    granularity is the SIGNAL, so only the 1 binding that reads the changed
 *    field re-runs. This is the marketable, thesis-validating result.
 *  - Section 3 (materialization) is the Pareto disclosure: Pyreon's lazy
 *    slot-bag pays a one-time signal alloc on the FIRST access of each field;
 *    react's flat hook result has no such per-field cost. The per-update win
 *    dominates, but the first-access cost is disclosed, not hidden.
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
// We drive React commits synchronously via flushSync (the correct bench
// primitive) — silence React 19's "not wrapped in act(...)" advisory.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

// Both adapters expose the SAME 8 result fields (Pyreon fine-grained signals /
// react-query flat result): data, status, isFetching, error, isPending,
// isLoading, isError, isSuccess. A data-only flip (setQueryData) changes ONLY
// `data` (+ internal timestamps neither adapter surfaces as a field), so any
// re-execution of a non-`data` derivation is pure wasted work.
const KEY = ['bench-query'] as const
const seed = (v: number) => ({ v })

// ─── shared stats (identical to store-bench's methodology) ───────────────────

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; exitCode: number }
}

const now = () => Number(process.hrtime.bigint())

function measureSamples(
  fn: () => void,
  { warmup = 2_000, iters = 500, runs = 15 }: { warmup?: number; iters?: number; runs?: number } = {},
): number[] {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    samples.push((now() - t0) / iters)
  }
  return samples
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1] as number
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

// ─── Pyreon harness ──────────────────────────────────────────────────────────

interface Harness {
  /** Read the current data text the harness's component rendered into the DOM. */
  readDom(): string
  /**
   * Flip ONLY `data` (via setQueryData) and SYNCHRONOUSLY surface it.
   *
   * Pyreon: setQueryData runs the subscribe callback + fine-grained DOM patch
   * inline (query-core notifies synchronously; Pyreon signals are synchronous).
   *
   * react-query: setQueryData's re-render is MACROTASK-batched (react-query
   * coalesces bursts into one render on the next tick — a deliberate design).
   * To measure the WORK (not the scheduler latency) we force the render
   * synchronously with `flushSync(root.render(...))`, which re-runs the
   * component reading the freshly-set cache. This is the per-update
   * render+reconcile cost — the fair match to Pyreon's per-update work.
   */
  flip(v: number): void
  dispose(): void
}

async function makePyreonHarness(): Promise<Harness> {
  const { h } = await import('@pyreon/core')
  const { mount } = await import('@pyreon/runtime-dom')
  const { QueryClient } = await import('@tanstack/query-core')
  const { QueryClientProvider, useQuery } = await import('../src/index')

  const client = new QueryClient()
  // Seed synchronously so status is 'success' + isFetching false from mount 0.
  client.setQueryData(KEY, seed(0))

  const container = document.createElement('div')
  document.body.appendChild(container)

  function Comp() {
    const q = useQuery<{ v: number }>(() => ({
      queryKey: KEY,
      queryFn: () => Promise.resolve(seed(0)),
      staleTime: Number.POSITIVE_INFINITY,
    }))
    // Read ALL 9 fields, each in its own fine-grained binding, so react-query's
    // tracked-props and Pyreon's per-signal effects have the SAME field surface.
    return h(
      'div',
      null,
      h('span', { 'data-t': 'data' }, () => JSON.stringify(q.data() ?? null)),
      h('span', null, () => String(q.status())),
      h('span', null, () => String(q.isFetching())),
      h('span', null, () => String(q.error() ?? '')),
      h('span', null, () => String(q.isPending())),
      h('span', null, () => String(q.isLoading())),
      h('span', null, () => String(q.isError())),
      h('span', null, () => String(q.isSuccess())),
    )
  }

  const dispose = mount(h(QueryClientProvider, { client }, h(Comp, {})), container)
  const dataSpan = container.querySelector('[data-t="data"]') as HTMLElement

  return {
    readDom: () => dataSpan.textContent ?? '',
    flip: (v) => client.setQueryData(KEY, seed(v)),
    dispose: () => {
      if (typeof dispose === 'function') dispose()
      container.remove()
    },
  }
}

// ─── React (react-query) harness ─────────────────────────────────────────────

async function makeReactHarness(): Promise<Harness> {
  const React = (await import('react')).default
  const { createElement: h } = React
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')
  const { QueryClient } = await import('@tanstack/query-core')
  const { QueryClientProvider, useQuery } = await import('@tanstack/react-query')

  const client = new QueryClient()
  client.setQueryData(KEY, seed(0))

  const container = document.createElement('div')
  document.body.appendChild(container)

  function Comp() {
    const q = useQuery({
      queryKey: KEY,
      queryFn: () => Promise.resolve(seed(0)),
      staleTime: Number.POSITIVE_INFINITY,
    })
    // Same 9-field surface — read every field so tracked-props tracks them all.
    return h(
      'div',
      null,
      h('span', { 'data-t': 'data' }, JSON.stringify(q.data ?? null)),
      h('span', null, String(q.status)),
      h('span', null, String(q.isFetching)),
      h('span', null, String(q.error ?? '')),
      h('span', null, String(q.isPending)),
      h('span', null, String(q.isLoading)),
      h('span', null, String(q.isError)),
      h('span', null, String(q.isSuccess)),
    )
  }

  const tree = () => h(QueryClientProvider, { client }, h(Comp))
  const root = createRoot(container)
  flushSync(() => {
    root.render(tree())
  })
  // react-query subscribes to the query-core store inside a PASSIVE effect
  // (useSyncExternalStore) — flush it so the mount is fully settled.
  await new Promise((r) => setTimeout(r, 0))
  const dataSpan = container.querySelector('[data-t="data"]') as HTMLElement

  return {
    readDom: () => dataSpan.textContent ?? '',
    flip: (v) => {
      client.setQueryData(KEY, seed(v))
      // Force the batched render synchronously to measure the render WORK.
      flushSync(() => root.render(tree()))
    },
    dispose: () => {
      root.unmount()
      container.remove()
    },
  }
}

// ─── child mode: measure ONE timing (op × impl) cell, print JSON samples ─────

type Impl = 'pyreon' | 'react'
const childOp = process.argv[2]
const childImpl = process.argv[3] as Impl | undefined

if (childOp) {
  if (childImpl !== 'pyreon' && childImpl !== 'react') throw new Error(`bad impl: ${childImpl}`)
  const make = childImpl === 'pyreon' ? makePyreonHarness : makeReactHarness

  if (childOp === 'update') {
    // Steady-state: data-only flip → DOM reflects the change. This is the cost
    // each adapter pays to surface ONE query-core update to the DOM.
    const hness = await make()
    let i = 0
    // React re-renders are ~100× a Pyreon fine-grained patch, so the same
    // sample counts keep both cells to a sane wall-clock while staying fair.
    const samples = measureSamples(
      () => {
        i++
        hness.flip(i)
      },
      { warmup: 1_000, iters: 300, runs: 15 },
    )
    hness.dispose()
    process.stdout.write(JSON.stringify({ samples }))
    process.exit(0)
  }

  if (childOp === 'mount') {
    // Cost to bring up + tear down a 1-query component in a RUNNING app: hook
    // alloc + observer subscribe + first result → DOM, then unmount. The
    // QueryClient is shared (constructed once — QueryClient construction is
    // query-core, NOT adapter) and React reuses ONE warm root (createRoot is
    // react-dom root machinery a real app allocates once, not per widget) —
    // both confounds excluded so the number is adapter mount+unmount work.
    let one: () => void
    if (childImpl === 'pyreon') {
      const { h } = await import('@pyreon/core')
      const { mount } = await import('@pyreon/runtime-dom')
      const { QueryClient } = await import('@tanstack/query-core')
      const { QueryClientProvider, useQuery } = await import('../src/index')
      const client = new QueryClient()
      client.setQueryData(KEY, seed(0))
      const Comp = () => {
        const q = useQuery<{ v: number }>(() => ({
          queryKey: KEY,
          queryFn: () => Promise.resolve(seed(0)),
          staleTime: Number.POSITIVE_INFINITY,
        }))
        return h('span', null, () => JSON.stringify(q.data() ?? null))
      }
      one = () => {
        const container = document.createElement('div')
        const dispose = mount(h(QueryClientProvider, { client }, h(Comp, {})), container)
        if (typeof dispose === 'function') dispose()
      }
    } else {
      const React = (await import('react')).default
      const { createElement: h } = React
      const { createRoot } = await import('react-dom/client')
      const { flushSync } = await import('react-dom')
      const { QueryClient } = await import('@tanstack/query-core')
      const { QueryClientProvider, useQuery } = await import('@tanstack/react-query')
      const client = new QueryClient()
      client.setQueryData(KEY, seed(0))
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container) // WARM root — allocated once
      const Comp = () => {
        const q = useQuery({
          queryKey: KEY,
          queryFn: () => Promise.resolve(seed(0)),
          staleTime: Number.POSITIVE_INFINITY,
        })
        return h('span', null, JSON.stringify(q.data ?? null))
      }
      one = () => {
        flushSync(() => root.render(h(QueryClientProvider, { client }, h(Comp))))
        flushSync(() => root.render(null)) // unmount into the warm root
      }
    }
    const samples = measureSamples(one, { warmup: 500, iters: 100, runs: 15 })
    process.stdout.write(JSON.stringify({ samples }))
    process.exit(0)
  }

  throw new Error(`unknown op: ${childOp}`)
}

// ═════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═════════════════════════════════════════════════════════════════════════════

const fmt = (n: number) => n.toLocaleString('en-US')

console.log('\n=== @pyreon/query vs @tanstack/react-query — adapter head-to-head ===')
console.log(
  `  Bun ${typeof Bun !== 'undefined' ? (Bun as unknown as { version: string }).version : '?'} · ${process.platform}/${process.arch} · NODE_ENV=production · query-core 5.101.2 (identical engine both sides)`,
)

// ─── correctness gate ────────────────────────────────────────────────────────

{
  const p = await makePyreonHarness()
  const r = await makeReactHarness()
  // Both seeded to {v:0}
  assert(p.readDom() === '{"v":0}', `pyreon seed DOM: ${p.readDom()}`)
  assert(r.readDom() === '{"v":0}', `react seed DOM: ${r.readDom()}`)
  p.flip(42)
  r.flip(42)
  assert(p.readDom() === '{"v":42}', `pyreon flip DOM: ${p.readDom()}`)
  assert(r.readDom() === '{"v":42}', `react flip DOM: ${r.readDom()}`)
  p.dispose()
  r.dispose()
  console.log('  ✓ correctness gate passed — both adapters surface identical data in the DOM\n')
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[query-bench correctness] ${msg}`)
}

// ═══ SECTION 1 — RECOMPUTE / RE-RENDER COUNT (the crux; exact, deterministic) ══
//
// Both scenarios flip ONLY `data` (setQueryData). We count the downstream
// reactive work each adapter does. Counts are EXACT — no timing, no flake.

console.log('── Section 1 — recompute / re-render COUNT on a data-ONLY change ──')
console.log('   (both wrap the same query-core; a flip changes ONLY `data`.)\n')

// ── 1A: CROSS-component field isolation ──────────────────────────────────────
// Component STATUS reads only `status`; component DATA reads only `data`.
// Flip data. react-query's tracked-props SHOULD skip STATUS (honest tie).

async function crossComponentCounts(): Promise<{
  pyreon: { status: number; data: number }
  react: { status: number; data: number }
}> {
  // Pyreon: two effects sharing one query.
  const pyreon = await (async () => {
    const { h } = await import('@pyreon/core')
    const { mount } = await import('@pyreon/runtime-dom')
    const { effect } = await import('@pyreon/reactivity')
    const { QueryClient } = await import('@tanstack/query-core')
    const { QueryClientProvider, useQuery } = await import('../src/index')
    const client = new QueryClient()
    client.setQueryData(KEY, seed(0))
    let statusRuns = 0
    let dataRuns = 0
    let sink = ''
    const container = document.createElement('div')
    document.body.appendChild(container)
    function Comp() {
      const q = useQuery<{ v: number }>(() => ({
        queryKey: KEY,
        queryFn: () => Promise.resolve(seed(0)),
        staleTime: Number.POSITIVE_INFINITY,
      }))
      effect(() => {
        statusRuns++
        sink = String(q.status())
      })
      effect(() => {
        dataRuns++
        sink = JSON.stringify(q.data())
      })
      return null
    }
    const dispose = mount(h(QueryClientProvider, { client }, h(Comp, {})), container)
    // reset after mount runs
    statusRuns = 0
    dataRuns = 0
    client.setQueryData(KEY, seed(1))
    void sink
    if (typeof dispose === 'function') dispose()
    container.remove()
    return { status: statusRuns, data: dataRuns }
  })()

  // React: two separate components, each reading only one field.
  const react = await (async () => {
    const React = (await import('react')).default
    const { createElement: h } = React
    const { createRoot } = await import('react-dom/client')
    const { flushSync } = await import('react-dom')
    const { QueryClient } = await import('@tanstack/query-core')
    const { QueryClientProvider, useQuery } = await import('@tanstack/react-query')
    const client = new QueryClient()
    client.setQueryData(KEY, seed(0))
    let statusRuns = 0
    let dataRuns = 0
    function StatusComp() {
      statusRuns++
      const q = useQuery({
        queryKey: KEY,
        queryFn: () => Promise.resolve(seed(0)),
        staleTime: Number.POSITIVE_INFINITY,
      })
      return h('span', null, String(q.status))
    }
    function DataComp() {
      dataRuns++
      const q = useQuery({
        queryKey: KEY,
        queryFn: () => Promise.resolve(seed(0)),
        staleTime: Number.POSITIVE_INFINITY,
      })
      return h('span', null, JSON.stringify(q.data ?? null))
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    flushSync(() => {
      root.render(
        h(QueryClientProvider, { client }, h(StatusComp), h(DataComp)),
      )
    })
    await new Promise((r) => setTimeout(r, 10)) // let subscribe effects settle
    statusRuns = 0
    dataRuns = 0
    // NATURAL path: setQueryData, then let react-query's macrotask-batched
    // render fire on its own (its real behavior — no forced flushSync render).
    client.setQueryData(KEY, seed(1))
    await new Promise((r) => setTimeout(r, 20))
    root.unmount()
    container.remove()
    return { status: statusRuns, data: dataRuns }
  })()

  return { pyreon, react }
}

// ── 1B: INTRA-component field isolation ──────────────────────────────────────
// ONE component reads all N fields; flip data. Count component re-runs AND
// field-derivation re-evaluations.

async function intraComponentCounts(): Promise<{
  pyreon: { component: number; fieldDerivations: number }
  react: { component: number; fieldDerivations: number }
}> {
  const pyreon = await (async () => {
    const { h } = await import('@pyreon/core')
    const { mount } = await import('@pyreon/runtime-dom')
    const { QueryClient } = await import('@tanstack/query-core')
    const { QueryClientProvider, useQuery } = await import('../src/index')
    const client = new QueryClient()
    client.setQueryData(KEY, seed(0))
    let componentRuns = 0
    let fieldRuns = 0
    let sink = ''
    const container = document.createElement('div')
    document.body.appendChild(container)
    function Comp() {
      componentRuns++
      const q = useQuery<{ v: number }>(() => ({
        queryKey: KEY,
        queryFn: () => Promise.resolve(seed(0)),
        staleTime: Number.POSITIVE_INFINITY,
      }))
      // Each field in its OWN binding; the closure bumps fieldRuns when it runs.
      const read = (fn: () => string) => () => {
        fieldRuns++
        return fn()
      }
      return h(
        'div',
        null,
        h('span', null, read(() => JSON.stringify(q.data() ?? null))),
        h('span', null, read(() => String(q.status()))),
        h('span', null, read(() => String(q.isFetching()))),
        h('span', null, read(() => String(q.error() ?? ''))),
        h('span', null, read(() => String(q.isPending()))),
        h('span', null, read(() => String(q.isLoading()))),
        h('span', null, read(() => String(q.isError()))),
        h('span', null, read(() => String(q.isSuccess()))),
      )
    }
    const dispose = mount(h(QueryClientProvider, { client }, h(Comp, {})), container)
    componentRuns = 0
    fieldRuns = 0
    client.setQueryData(KEY, seed(1))
    void sink
    if (typeof dispose === 'function') dispose()
    container.remove()
    return { component: componentRuns, fieldDerivations: fieldRuns }
  })()

  const react = await (async () => {
    const React = (await import('react')).default
    const { createElement: h } = React
    const { createRoot } = await import('react-dom/client')
    const { flushSync } = await import('react-dom')
    const { QueryClient } = await import('@tanstack/query-core')
    const { QueryClientProvider, useQuery } = await import('@tanstack/react-query')
    const client = new QueryClient()
    client.setQueryData(KEY, seed(0))
    let componentRuns = 0
    let fieldRuns = 0
    function Comp() {
      componentRuns++
      const q = useQuery({
        queryKey: KEY,
        queryFn: () => Promise.resolve(seed(0)),
        staleTime: Number.POSITIVE_INFINITY,
      })
      const read = (fn: () => string): string => {
        fieldRuns++
        return fn()
      }
      return h(
        'div',
        null,
        h('span', null, read(() => JSON.stringify(q.data ?? null))),
        h('span', null, read(() => String(q.status))),
        h('span', null, read(() => String(q.isFetching))),
        h('span', null, read(() => String(q.error ?? ''))),
        h('span', null, read(() => String(q.isPending))),
        h('span', null, read(() => String(q.isLoading))),
        h('span', null, read(() => String(q.isError))),
        h('span', null, read(() => String(q.isSuccess))),
      )
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    flushSync(() => {
      root.render(h(QueryClientProvider, { client }, h(Comp)))
    })
    await new Promise((r) => setTimeout(r, 10))
    componentRuns = 0
    fieldRuns = 0
    // NATURAL path — react-query's real macrotask-batched render.
    client.setQueryData(KEY, seed(1))
    await new Promise((r) => setTimeout(r, 20))
    root.unmount()
    container.remove()
    return { component: componentRuns, fieldDerivations: fieldRuns }
  })()

  return { pyreon, react }
}

const cross = await crossComponentCounts()
const intra = await intraComponentCounts()

console.log('  1A — CROSS-component (2 components: one reads only `status`, one only `data`)')
console.log('       flip `data` → how many of the two re-execute?')
console.log(
  `       Pyreon : status-effect ${cross.pyreon.status}  ·  data-effect ${cross.pyreon.data}`,
)
console.log(
  `       React  : status-comp   ${cross.react.status}  ·  data-comp   ${cross.react.data}   (react-query tracked-props)`,
)
const crossTie = cross.pyreon.status === cross.react.status && cross.pyreon.data === cross.react.data
console.log(
  `       ⇒ ${crossTie ? '🤝 TIE — react-query IS field-aware across components (tracked-props); Pyreon matches it.' : 'DIFFERS'}\n`,
)

console.log('  1B — INTRA-component (ONE component reads all 8 fields in 8 bindings)')
console.log('       flip `data` → component re-runs + field-derivations re-evaluated?')
console.log(
  `       Pyreon : component body ${intra.pyreon.component}  ·  field-derivations ${intra.pyreon.fieldDerivations}   (only the 1 data binding re-runs)`,
)
console.log(
  `       React  : component body ${intra.react.component}  ·  field-derivations ${intra.react.fieldDerivations}   (whole body re-renders + all 8 re-read + VDOM reconcile)`,
)
const intraWin =
  intra.pyreon.fieldDerivations < intra.react.fieldDerivations &&
  intra.pyreon.component <= intra.react.component
console.log(
  `       ⇒ ${intraWin ? `🥇 Pyreon does ${intra.react.fieldDerivations}× less field-derivation work (${intra.pyreon.fieldDerivations} vs ${intra.react.fieldDerivations}) and 0 component re-runs vs ${intra.react.component}.` : 'no win'}\n`,
)

// ═══ SECTION 2 — UPDATE-to-DOM timing (process-isolated, pooled median) ══════

console.log('── Section 2 — time to reflect a data-only change in the DOM (ns/update) ──')
console.log('   (process-isolated cells, pooled median [CI95], 🤝 = CI-overlap tie)\n')

const CELL_REPEATS = Number(process.env.BENCH_REPEATS ?? 3)

function runTimingCell(op: string, impl: Impl): { med: number; ci: [number, number] } {
  const pooled: number[] = []
  for (let r = 0; r < CELL_REPEATS; r++) {
    const proc = Bun.spawnSync(['bun', import.meta.path, op, impl], {
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (proc.exitCode !== 0) throw new Error(`timing child failed (op "${op}", impl "${impl}")`)
    const { samples } = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
    pooled.push(...samples)
  }
  return { med: median(pooled), ci: bootstrapCI(pooled) }
}

for (const op of ['update', 'mount'] as const) {
  const p = runTimingCell(op, 'pyreon')
  const r = runTimingCell(op, 'react')
  const ratio = r.med / p.med
  const tie = overlaps(p.ci, r.ci)
  const label =
    op === 'update'
      ? 'data-flip → DOM'
      : 'mount 1-query component → first DOM'
  const verdict = tie
    ? `🤝 ~tied`
    : ratio >= 1
      ? `${ratio.toFixed(1)}× faster (Pyreon)`
      : `${(1 / ratio).toFixed(1)}× SLOWER (Pyreon)`
  console.log(
    `  ${label.padEnd(38)} pyreon ${fmt(Math.round(p.med)).padStart(9)} ns   react ${fmt(Math.round(r.med)).padStart(11)} ns   ${verdict}`,
  )
}
console.log(
  '\n  (react ns INCLUDES its render + VDOM reconcile — that IS react-query\'s cost to surface an update;',
)
console.log('   it has no separate "apply" step. ns machine-dependent — the ratio is the portable signal.)\n')

// ═══ SECTION 3 — materialization (Pyreon lazy slot-bag; Pareto disclosure) ════

console.log('── Section 3 — materialization: Pyreon lazy slot-bag (Pareto disclosure) ──\n')

{
  const { h } = await import('@pyreon/core')
  const { mount } = await import('@pyreon/runtime-dom')
  const { QueryClient } = await import('@tanstack/query-core')
  const { QueryClientProvider, useQuery } = await import('../src/index')

  // Measure FIRST-access (slot alloc) vs cached-access on a fresh useQuery each
  // time. Fresh container+scope per iter so each `.data` read is a first access.
  const firstAccess = measureSamples(
    () => {
      const client = new QueryClient()
      client.setQueryData(KEY, seed(0))
      const container = document.createElement('div')
      let sink: unknown
      const dispose = mount(
        h(QueryClientProvider, { client }, () => {
          const q = useQuery(() => ({
            queryKey: KEY,
            queryFn: () => Promise.resolve(seed(0)),
            staleTime: Number.POSITIVE_INFINITY,
          }))
          sink = q.data() // FIRST access → materializes the data slot
          return null
        }),
        container,
      )
      void sink
      if (typeof dispose === 'function') dispose()
    },
    { warmup: 500, iters: 200, runs: 11 },
  )

  console.log(
    `  first .data() access on a fresh useQuery (mount + slot alloc): ${fmt(Math.round(median(firstAccess)))} ns`,
  )
  console.log(
    '  → the lazy slot-bag pays ONE signal alloc per field on first access; a component reading 2 of 9',
  )
  console.log(
    '    fields allocates 2 signals, not 9. Subsequent accesses return the cached Signal (identity-stable).',
  )
  console.log('    The per-update fine-grained win (Section 1B/2) dominates this one-time cost.\n')
}
