/**
 * @pyreon/store vs Zustand, Jotai, Valtio, nanostores, MobX, Redux Toolkit
 * and Pinia — objective head-to-head.
 *
 * Run: `bun run bench:stores` (sets NODE_ENV=production).
 *
 * Objectivity contract:
 *  - NODE_ENV=production set by the npm script's SHELL before the process
 *    starts (imports are hoisted, so the in-file assignment below runs AFTER
 *    module load — it only covers per-call gates for direct invocation; the
 *    shell env + explicit child env are the load-bearing parts).
 *  - Idiomatic per library — Pyreon `defineStore(id, () => ({signals, actions}))`,
 *    Zustand `createStore((set) => ({...}))`, Jotai `atom()` + `createStore()`,
 *    Valtio `proxy()` (sync `subscribe`), nanostores `map()` (`setKey`/`set`/
 *    `listen`), MobX `makeAutoObservable` (`observe`, an action per write),
 *    RTK `createSlice` + `configureStore`, Pinia options `defineStore` (`$patch`,
 *    `$subscribe({ flush: 'sync' })`). Every listener is SYNCHRONOUS so the
 *    notify work lands inside the timed loop for every arm. Valtio and MobX
 *    `observe` notify once PER FIELD on a two-field patch (no batching in those
 *    idioms) — their own design, disclosed rather than wrapped.
 *  - CORRECTNESS GATE asserts all three produce identical results before timing.
 *  - PER-(OP × IMPL) PROCESS ISOLATION — each (op, library) cell runs in its
 *    own fresh `bun` child. This isolates ops from each other AND libraries
 *    from each other: previously all three impls shared one child heap, so
 *    whoever measured after Pyreon's registry-retained setup stores paid its
 *    GC debt (a bias AGAINST the competitors on `setup`, and cross-impl JIT
 *    pollution everywhere else).
 *  - NO forced GC (measured: JSC jettisons compiled code on forced GC →
 *    re-tier noise; see measureSamples doc). Instead: big warmup + MANY SMALL
 *    samples per cell, POOLED across ${BENCH_REPEATS:-3} process spawns per
 *    cell — per-process JIT/allocation modes and natural-GC-pause samples are
 *    absorbed by the pooled median.
 *  - Bounded registry on `setup`: Pyreon's `defineStore` retains every store
 *    in its global registry (the feature powering SSR isolation / devtools /
 *    resetAllStores — DISCLOSED cost, Zustand/Jotai have no registry). The op
 *    resets the registry BETWEEN runs (outside the timed window) so the
 *    measurement reflects per-store creation cost, not an ever-growing
 *    500k-entry Map no real app has. Within a run the registry still grows —
 *    that retention IS part of Pyreon's honest per-op cost.
 *  - Symmetric arms on `setup`: Pyreon's store ids are pre-built outside the
 *    timed window (a real app passes a literal), so no arm builds a string
 *    inside the timed region.
 *  - STATS: per-impl samples are the per-run means (runs × iters); table
 *    reports the median with a bootstrap CI95. `🤝` marks a verdict whose
 *    CI95 overlaps Pyreon's — treat those as ties, not wins/losses.
 *  - A `sink` defeats DCE.
 *
 * NOTE Jotai is atom-granular (no "store of fields + actions") — its closest
 * shape is one atom per field; `dispatch` = `set(atom, updater)`. Comparable for
 * read/write/notify; flagged where the model differs. Jotai is ALSO optimized
 * for React render-dedup, not raw vanilla `get`/`set` throughput — these are its
 * honest vanilla-store numbers, not its React render path.
 *
 * HONEST READ of the numbers (don't cherry-pick): Pyreon wins the hot path
 * (per-field dispatch + write→notify + both patch shapes) and ties Zustand on
 * read, but LOSES to Zustand on `setup` (Pyreon's per-field signals + global
 * registry vs Zustand's bare closure) — the one disclosed loss. The
 * with-subscriber `patch` row flipped from a 1.7× loss to a win when the
 * per-key detector suspension moved to the O(1) `_suspendSoleSubscriber` Set
 * swap (the function-key Set delete/add hashing was ~25% of the old path) +
 * a cached batch closure — the per-key `{key,oldValue,newValue}` event model
 * itself is NOT the bottleneck it was believed to be. Pyreon dominates
 * Jotai's vanilla store everywhere because the atom-state-map indirection is
 * heavy per get/set.
 */
process.env.NODE_ENV = 'production'

import { signal } from '@pyreon/reactivity'
import { atom, createStore as createJotai } from 'jotai/vanilla'
import { createStore as createZustand } from 'zustand/vanilla'
import { proxy as valtioProxy, subscribe as valtioSubscribe } from 'valtio/vanilla'
import { map as nanoMap } from 'nanostores'
import { makeAutoObservable, observe as mobxObserve } from 'mobx'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { createPinia, defineStore as definePinia, setActivePinia } from 'pinia'
import { defineStore, resetAllStores } from '../src/index'
import { cpus as benchCpus, loadavg as benchLoadavg } from 'node:os'

// Runtime banner — which ENGINE produced these numbers (bun = JavaScriptCore,
// node = V8) plus CPU and load, so a result is never quoted engine-less.
function benchRuntimeBanner(): string {
  const bunRt = (globalThis as { Bun?: { version: string } }).Bun
  const engine = bunRt ? `bun ${bunRt.version} (JavaScriptCore)` : `node ${process.version} (V8)`
  const load = benchLoadavg()
    .map((l) => l.toFixed(2))
    .join(' ')
  return `${engine} · ${process.platform}/${process.arch} · ${benchCpus()[0]?.model ?? 'unknown cpu'} · loadavg ${load}`
}

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; exitCode: number }
}

const now = () => Number(process.hrtime.bigint())

/**
 * Collect per-run mean ns/op samples. `between` runs OUTSIDE every timed
 * window (interleaved through warmup + after each run) — used on the `setup`
 * op for the registry reset that keeps Pyreon's store Map bounded.
 *
 * GC discipline (measured, not guessed): NO forced GC anywhere. A forced
 * `Bun.gc(true)` makes JSC jettison optimized code — the next ~2 run-sized
 * bursts then pay re-tiering (~350 → ~250 → steady), bi-modalizing medians;
 * and any post-GC re-warm big enough to re-tier builds an allocation backlog
 * whose major-GC collapse then lands INSIDE a timed run (~570ns spike, same
 * run index every process). Instead: one big warmup (tier-up), then MANY
 * SMALL samples (41 × 5k) — natural GC pauses land in a few samples and the
 * MEDIAN ignores them, while steady-state amortized GC (what a real app pays)
 * stays in the number.
 */
const MEASURE_WARMUP = 40_000
const MEASURE_RUNS = 41

function measureSamples(
  fn: () => void,
  { warmup = MEASURE_WARMUP, iters = 5_000, runs = MEASURE_RUNS, between }: {
    warmup?: number
    iters?: number
    runs?: number
    between?: () => void
  } = {},
): number[] {
  // Warmup doubles as JIT tier-up (JSC needs ~2 run-sized bursts to reach
  // steady state). `between` is interleaved so warmup allocations don't build
  // an unbounded backlog (e.g. the setup op's registry).
  for (let i = 0; i < warmup; i++) {
    fn()
    if ((i & 1023) === 1023) between?.()
  }
  between?.()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    samples.push((now() - t0) / iters)
    between?.()
  }
  return samples
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1] as number
}

/** Bootstrap CI95 of the median (2000 resamples). */
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

let sink = 0
const IMPLS = ['pyreon', 'zustand', 'jotai', 'valtio', 'nanostores', 'mobx', 'rtk', 'pinia'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, () => void>

// ─── idiomatic store factories ───────────────────────────────────────────────
let pyrId = 0
// The id is a parameter so the timed `setup` op can pass a PRE-BUILT string:
// building `bench-${n}` inside the timed region charged Pyreon a template
// literal + fresh-string allocation (~70 ns on the lower quartile) that the
// Zustand/Jotai arms never pay. Untimed callers keep the default.
function makePyreon(id: string = `bench-${pyrId++}`) {
  const use = defineStore(id, () => {
    const count = signal(0)
    const label = signal('x')
    return { count, label, inc: () => count.set(count() + 1) }
  })
  return use()
}
function makeZustand() {
  return createZustand<{ count: number; label: string; inc: () => void }>((set) => ({
    count: 0,
    label: 'x',
    inc: () => set((s) => ({ count: s.count + 1 })),
  }))
}
function makeJotai() {
  const countAtom = atom(0)
  const labelAtom = atom('x')
  const store = createJotai()
  return { countAtom, labelAtom, store }
}

// ── the wider rival set, each in its own idiom ──────────────────────────────
// Valtio: a mutable proxy; `subscribe(s, cb, true)` is its SYNC notify mode
// (the default batches to a microtask, which would move the notify work out
// of the timed loop — every other arm notifies synchronously).
function makeValtio() {
  const state = valtioProxy({ count: 0, label: 'x' })
  return { state, inc: () => void state.count++ }
}
// nanostores: a `map` store; `setKey` per field, `set` for a whole patch,
// `listen` for change notification (sync).
function makeNano() {
  const $s = nanoMap({ count: 0, label: 'x' })
  return { $s, inc: () => $s.setKey('count', $s.get().count + 1) }
}
// MobX: an auto-observable object with an action; `observe` is the
// per-object sync change listener; a multi-field write is one `runInAction`.
function makeMobx() {
  return makeAutoObservable({
    count: 0,
    label: 'x',
    inc() {
      this.count++
    },
    patch(count: number, label: string) {
      this.count = count
      this.label = label
    },
  })
}
// Redux Toolkit: createSlice + configureStore (production NODE_ENV, so the
// dev-only immutability/serializability middleware is off, as in an app build).
const rtkSlice = createSlice({
  name: 's',
  initialState: { count: 0, label: 'x' },
  reducers: {
    inc: (st) => {
      st.count++
    },
    patch: (st, a: { payload: { count: number; label: string } }) => {
      st.count = a.payload.count
      st.label = a.payload.label
    },
  },
})
function makeRtk() {
  return configureStore({ reducer: rtkSlice.reducer })
}
// Pinia (options store) — needs an active pinia; ids register like Pyreon's.
setActivePinia(createPinia())
function makePinia(id: string = `bench-${pyrId++}`) {
  return definePinia(id, {
    state: () => ({ count: 0, label: 'x' }),
    actions: {
      inc() {
        this.count++
      },
    },
  })()
}

/** Attach ONE synchronous change listener per rival store, each in its idiom. */
function subscribeRivals(
  v: ReturnType<typeof makeValtio>,
  n: ReturnType<typeof makeNano>,
  m: ReturnType<typeof makeMobx>,
  r: ReturnType<typeof makeRtk>,
  pi: ReturnType<typeof makePinia>,
): void {
  valtioSubscribe(v.state, () => void sink++, true)
  n.$s.listen(() => void sink++)
  mobxObserve(m, () => void sink++)
  r.subscribe(() => void sink++)
  pi.$subscribe(() => void sink++, { flush: 'sync' })
}

// `setup` sizes its pre-built id pool from these (see the op).
const SETUP_ITERS = 2_000
const SETUP_WARMUP = MEASURE_WARMUP
const SETUP_RUNS = MEASURE_RUNS

// ─── ops ─────────────────────────────────────────────────────────────────────
interface OpSpec {
  note?: string
  make: () => Impl
  /** Per-run out-of-band hook (e.g. registry reset). Not timed. */
  between?: () => void
  /** Iteration override — `setup` uses fewer so within-run retention stays app-realistic. */
  iters?: number
}

const OPS: Record<string, OpSpec> = {
  setup: {
    note: 'Pyreon and Pinia register each store by id (registry reset between runs, ids pre-built — both untimed); the others are bare objects/closures.',
    // 2k stores per run keeps within-run registry retention in a real-app
    // regime instead of a 220k-entry Map (a pure harness artifact).
    iters: SETUP_ITERS,
    // Pyreon's and Pinia's id registries are both reset between runs (untimed).
    between: () => {
      resetAllStores()
      setActivePinia(createPinia())
    },
    make: () => {
      // Every id the child will need (warmup + runs × iters, per
      // measureSamples' defaults), built here — outside every timed window —
      // so the timed Pyreon arm does the same work as the other arms: create
      // a store, read one field. Ids stay unique, as before.
      const ids: string[] = []
      for (let i = 0; i < SETUP_WARMUP + SETUP_RUNS * SETUP_ITERS; i++) ids.push(`bench-${i}`)
      let next = 0
      return {
        pyreon: () => {
          sink += makePyreon(ids[next++] as string).store.count()
        },
        zustand: () => {
          sink += makeZustand().getState().count
        },
        jotai: () => {
          const j = makeJotai()
          sink += j.store.get(j.countAtom)
        },
        valtio: () => {
          sink += makeValtio().state.count
        },
        nanostores: () => {
          sink += makeNano().$s.get().count
        },
        mobx: () => {
          sink += makeMobx().count
        },
        rtk: () => {
          sink += makeRtk().getState().count
        },
        pinia: () => {
          sink += makePinia(ids[next++] as string).count
        },
      }
    },
  },
  read: {
    note: '≈tied with Zustand — both ~single-digit ns (sub-ns gap is noise)',
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
      const v = makeValtio()
      const n = makeNano()
      const m = makeMobx()
      const r = makeRtk()
      const pi = makePinia()
      return {
        pyreon: () => {
          sink += p.store.count()
        },
        zustand: () => {
          sink += z.getState().count
        },
        jotai: () => {
          sink += j.store.get(j.countAtom)
        },
        valtio: () => {
          sink += v.state.count
        },
        nanostores: () => {
          sink += n.$s.get().count
        },
        mobx: () => {
          sink += m.count
        },
        rtk: () => {
          sink += r.getState().count
        },
        pinia: () => {
          sink += pi.count
        },
      }
    },
  },
  'dispatch (no subscriber)': {
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
      const v = makeValtio()
      const n = makeNano()
      const m = makeMobx()
      const r = makeRtk()
      const pi = makePinia()
      return {
        pyreon: () => {
          p.store.inc()
          sink += p.store.count()
        },
        zustand: () => {
          z.getState().inc()
          sink += z.getState().count
        },
        jotai: () => {
          j.store.set(j.countAtom, (c) => c + 1)
          sink += j.store.get(j.countAtom)
        },
        valtio: () => {
          v.inc()
          sink += v.state.count
        },
        nanostores: () => {
          n.inc()
          sink += n.$s.get().count
        },
        mobx: () => {
          m.inc()
          sink += m.count
        },
        rtk: () => {
          r.dispatch(rtkSlice.actions.inc())
          sink += r.getState().count
        },
        pinia: () => {
          pi.inc()
          sink += pi.count
        },
      }
    },
  },
  'write → 1 subscriber': {
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
      const v = makeValtio()
      const n = makeNano()
      const m = makeMobx()
      const r = makeRtk()
      const pi = makePinia()
      p.subscribe(() => {
        sink++
      })
      z.subscribe(() => {
        sink++
      })
      j.store.sub(j.countAtom, () => {
        sink++
      })
      subscribeRivals(v, n, m, r, pi)
      return {
        pyreon: () => p.store.inc(),
        zustand: () => z.getState().inc(),
        jotai: () => j.store.set(j.countAtom, (c) => c + 1),
        valtio: () => v.inc(),
        nanostores: () => n.inc(),
        mobx: () => m.inc(),
        rtk: () => void r.dispatch(rtkSlice.actions.inc()),
        pinia: () => pi.inc(),
      }
    },
  },
  'patch 2 fields (no subscriber)': {
    note: 'no listener attached — Pyreon takes its no-subscriber fast path; see the with-subscriber row for the realistic case. Jotai sets 2 atoms.',
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
      const v = makeValtio()
      const n = makeNano()
      const m = makeMobx()
      const r = makeRtk()
      const pi = makePinia()
      let i = 0
      return {
        pyreon: () => {
          i++
          p.patch({ count: i, label: 'y' })
        },
        zustand: () => {
          i++
          z.setState({ count: i, label: 'y' })
        },
        jotai: () => {
          i++
          j.store.set(j.countAtom, i)
          j.store.set(j.labelAtom, 'y')
        },
        valtio: () => {
          i++
          v.state.count = i
          v.state.label = 'y'
        },
        nanostores: () => {
          i++
          n.$s.set({ count: i, label: 'y' })
        },
        mobx: () => {
          i++
          m.patch(i, 'y')
        },
        rtk: () => {
          i++
          r.dispatch(rtkSlice.actions.patch({ count: i, label: 'y' }))
        },
        pinia: () => {
          i++
          pi.$patch({ count: i, label: 'y' })
        },
      }
    },
  },
  'patch 2 fields (with subscriber)': {
    note: 'REALISTIC — a listener is attached, so every lib does its full notify path. Pyreon still does MORE per notify (per-key {key,oldValue,newValue} events + state snapshot vs Zustand\'s single shallow merge + (state, prevState)) — offset by the O(1) sole-subscriber detector suspension + cached batch closure (the measured ratio, not this note, is the verdict). Jotai sets 2 atoms.',
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
      const v = makeValtio()
      const n = makeNano()
      const m = makeMobx()
      const r = makeRtk()
      const pi = makePinia()
      p.subscribe(() => {
        sink++
      })
      z.subscribe(() => {
        sink++
      })
      j.store.sub(j.countAtom, () => {
        sink++
      })
      subscribeRivals(v, n, m, r, pi)
      let i = 0
      return {
        pyreon: () => {
          i++
          p.patch({ count: i, label: 'y' })
        },
        zustand: () => {
          i++
          z.setState({ count: i, label: 'y' })
        },
        jotai: () => {
          i++
          j.store.set(j.countAtom, i)
          j.store.set(j.labelAtom, 'y')
        },
        valtio: () => {
          i++
          v.state.count = i
          v.state.label = 'y'
        },
        nanostores: () => {
          i++
          n.$s.set({ count: i, label: 'y' })
        },
        mobx: () => {
          i++
          m.patch(i, 'y')
        },
        rtk: () => {
          i++
          r.dispatch(rtkSlice.actions.patch({ count: i, label: 'y' }))
        },
        pinia: () => {
          i++
          pi.$patch({ count: i, label: 'y' })
        },
      }
    },
  },
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode: measure ONE (op × impl) cell, print JSON samples ────────────
const childOp = process.argv[2]
const childImpl = process.argv[3] as ImplName | undefined
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  if (!childImpl || !IMPLS.includes(childImpl)) throw new Error(`unknown impl: ${childImpl}`)
  const impl = spec.make()
  const opts: Parameters<typeof measureSamples>[1] = {}
  if (spec.between) opts.between = spec.between
  if (spec.iters !== undefined) opts.iters = spec.iters
  const samples = measureSamples(impl[childImpl], opts)
  process.stdout.write(JSON.stringify({ samples }))
  process.exit(0)
}

// ─── orchestrator: correctness gate, then spawn one child per (op × impl) ────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
{
  const p = makePyreon()
  const z = makeZustand()
  const j = makeJotai()
  assert(p.store.count() === 0 && z.getState().count === 0 && j.store.get(j.countAtom) === 0, 'read 0')
  p.store.inc()
  z.getState().inc()
  j.store.set(j.countAtom, (c) => c + 1)
  assert(p.store.count() === 1 && z.getState().count === 1 && j.store.get(j.countAtom) === 1, 'dispatch → 1')
  let pf = 0
  let zf = 0
  let jf = 0
  const up = p.subscribe(() => pf++)
  const uz = z.subscribe(() => zf++)
  const uj = j.store.sub(j.countAtom, () => jf++)
  p.store.inc()
  z.getState().inc()
  j.store.set(j.countAtom, (c) => c + 1)
  assert(pf >= 1 && zf >= 1 && jf >= 1, `subscriber fire (p=${pf} z=${zf} j=${jf})`)
  up()
  uz()
  uj()
  p.patch({ count: 5, label: 'y' })
  z.setState({ count: 5, label: 'y' })
  assert(p.store.count() === 5 && z.getState().count === 5, 'patch')
  // The wider rival set: read 0 → dispatch → 1, a sync listener fires, and a
  // two-field patch lands both fields.
  const v = makeValtio()
  const n = makeNano()
  const m = makeMobx()
  const r = makeRtk()
  const pi = makePinia()
  const reads = () => [v.state.count, n.$s.get().count, m.count, r.getState().count, pi.count]
  assert(reads().every((x) => x === 0), `rivals read 0 (${reads()})`)
  v.inc()
  n.inc()
  m.inc()
  r.dispatch(rtkSlice.actions.inc())
  pi.inc()
  assert(reads().every((x) => x === 1), `rivals dispatch → 1 (${reads()})`)
  const before = sink
  subscribeRivals(v, n, m, r, pi)
  v.inc()
  n.inc()
  m.inc()
  r.dispatch(rtkSlice.actions.inc())
  pi.inc()
  assert(sink - before >= 5, `every rival listener fired synchronously (${sink - before} of 5)`)
  v.state.count = 5
  v.state.label = 'y'
  n.$s.set({ count: 5, label: 'y' })
  m.patch(5, 'y')
  r.dispatch(rtkSlice.actions.patch({ count: 5, label: 'y' }))
  pi.$patch({ count: 5, label: 'y' })
  const labels = [v.state.label, n.$s.get().label, m.label, r.getState().label, pi.label]
  assert(reads().every((x) => x === 5) && labels.every((x) => x === 'y'), `rivals patch (${reads()} ${labels})`)
  resetAllStores()
  console.log(`✓ correctness gate passed — all ${IMPLS.length} libraries agree\n`)
}
// `BENCH_GATE_ONLY=1` checks correctness without timing (usable on a loaded machine).
if (process.env.BENCH_GATE_ONLY) process.exit(0)

interface Cell {
  med: number
  ci: [number, number]
}
interface Row {
  op: string
  cells: Record<ImplName, Cell>
  note?: string
}

// Pool samples across several fresh child processes per cell: JSC processes
// land in slightly different steady-state modes (JIT/allocation-site layout),
// so a single process can misrepresent the distribution.
const CELL_REPEATS = Number(process.env.BENCH_REPEATS ?? 3)

function runCell(op: string, impl: ImplName): Cell {
  const pooled: number[] = []
  for (let r = 0; r < CELL_REPEATS; r++) {
    const proc = Bun.spawnSync(['bun', import.meta.path, op, impl], {
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (proc.exitCode !== 0) throw new Error(`child failed for (op "${op}", impl "${impl}")`)
    const { samples } = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
    pooled.push(...samples)
  }
  return { med: median(pooled), ci: bootstrapCI(pooled) }
}

const rows: Row[] = []
for (const op of OP_ORDER) {
  const cells = {} as Record<ImplName, Cell>
  for (const impl of IMPLS) cells[impl] = runCell(op, impl)
  const row: Row = { op, cells }
  const note = OPS[op]?.note
  if (note !== undefined) row.note = note
  rows.push(row)
}

console.log(benchRuntimeBanner())
console.log(
  `=== @pyreon/store vs ${IMPLS.slice(1).join(' / ')} (${process.platform}/${process.arch}, NODE_ENV=production, per-(op×impl) isolated processes, median ns/op, 🤝 = CI95 overlap with Pyreon) ===\n`,
)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(`${pad('op', 32)} ${IMPLS.map((i) => padL(i, 15)).join('')}`)
console.log('─'.repeat(32 + 15 * IMPLS.length + 1))
for (const r of rows) {
  const p = r.cells.pyreon
  // Each rival cell: its median and its ratio to Pyreon (>1 ⇒ Pyreon faster),
  // marked 🤝 when its CI95 overlaps Pyreon's.
  const cell = (name: ImplName) => {
    const c = r.cells[name]
    if (name === 'pyreon') return padL(c.med.toFixed(0), 15)
    const ratio = c.med / p.med
    return padL(`${c.med.toFixed(0)} ${overlaps(p.ci, c.ci) ? '🤝' : ''}${ratio.toFixed(2)}x`, 15)
  }
  console.log(`${pad(r.op, 32)} ${IMPLS.map(cell).join('')}`)
  if (r.note) console.log(`  └ ${r.note}`)
}
console.log(
  `\n(ratio = competitor ÷ Pyreon; >1 ⇒ Pyreon faster; 🤝 = CI95 overlap with Pyreon (treat as tied). Pooled median of 41 small runs × ${CELL_REPEATS} fresh processes per (op × impl); no forced GC — see measureSamples doc. ns machine-dependent — the ratio is the portable signal.)`,
)
