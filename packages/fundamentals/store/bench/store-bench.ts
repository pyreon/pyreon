/**
 * @pyreon/store vs Zustand vs Jotai — objective head-to-head.
 *
 * Run: `bun run bench:stores` (sets NODE_ENV=production).
 *
 * Objectivity contract (see .claude/plans/fundamentals-benchmarks.md):
 *  - NODE_ENV=production set by the npm script's SHELL before the process
 *    starts (imports are hoisted, so the in-file assignment below runs AFTER
 *    module load — it only covers per-call gates for direct invocation; the
 *    shell env + explicit child env are the load-bearing parts).
 *  - Idiomatic per library — Pyreon `defineStore(id, () => ({signals, actions}))`,
 *    Zustand `createStore((set) => ({...}))`, Jotai `atom()` + `createStore()`.
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
 * (per-field dispatch + write→notify) and ties Zustand on read, but LOSES to
 * Zustand on `setup` (Pyreon's per-field signals + global registry vs Zustand's
 * bare closure) and on with-subscriber `patch` (Pyreon's per-key mutation-event
 * model vs Zustand's single shallow merge). Both losses are disclosed in the
 * table notes. Pyreon dominates Jotai's vanilla store everywhere because the
 * atom-state-map indirection is heavy per get/set.
 */
process.env.NODE_ENV = 'production'

import { signal } from '@pyreon/reactivity'
import { atom, createStore as createJotai } from 'jotai/vanilla'
import { createStore as createZustand } from 'zustand/vanilla'
import { defineStore, resetAllStores } from '../src/index'

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
function measureSamples(
  fn: () => void,
  { warmup = 40_000, iters = 5_000, runs = 41, between }: {
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
const IMPLS = ['pyreon', 'zustand', 'jotai'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, () => void>

// ─── idiomatic store factories ───────────────────────────────────────────────
let pyrId = 0
function makePyreon() {
  const use = defineStore(`bench-${pyrId++}`, () => {
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
    note: 'Pyreon allocs 2 signals + registers in a global registry (SSR/devtools); Zustand/Jotai are bare closures. Registry reset between runs (untimed).',
    // 2k stores per run keeps within-run registry retention in a real-app
    // regime instead of a 220k-entry Map (a pure harness artifact).
    iters: 2_000,
    between: () => resetAllStores(),
    make: () => ({
      pyreon: () => {
        sink += makePyreon().store.count()
      },
      zustand: () => {
        sink += makeZustand().getState().count
      },
      jotai: () => {
        const j = makeJotai()
        sink += j.store.get(j.countAtom)
      },
    }),
  },
  read: {
    note: '≈tied with Zustand — both ~single-digit ns (sub-ns gap is noise)',
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
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
      }
    },
  },
  'dispatch (no subscriber)': {
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
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
      }
    },
  },
  'write → 1 subscriber': {
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
      p.subscribe(() => {
        sink++
      })
      z.subscribe(() => {
        sink++
      })
      j.store.sub(j.countAtom, () => {
        sink++
      })
      return {
        pyreon: () => p.store.inc(),
        zustand: () => z.getState().inc(),
        jotai: () => j.store.set(j.countAtom, (c) => c + 1),
      }
    },
  },
  'patch 2 fields (no subscriber)': {
    note: 'no listener attached — Pyreon takes its no-subscriber fast path; see the with-subscriber row for the realistic case. Jotai sets 2 atoms.',
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
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
      }
    },
  },
  'patch 2 fields (with subscriber)': {
    note: 'REALISTIC — a listener is attached, so every lib does its full notify path. Pyreon does MORE per notify (per-key {key,oldValue,newValue} events + state snapshot vs Zustand\'s single shallow merge + (state, prevState)). Jotai sets 2 atoms.',
    make: () => {
      const p = makePyreon()
      const z = makeZustand()
      const j = makeJotai()
      p.subscribe(() => {
        sink++
      })
      z.subscribe(() => {
        sink++
      })
      j.store.sub(j.countAtom, () => {
        sink++
      })
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
  resetAllStores()
  console.log('✓ correctness gate passed — all three libraries agree\n')
}

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

console.log(
  `=== @pyreon/store vs Zustand vs Jotai (${process.platform}/${process.arch}, NODE_ENV=production, per-(op×impl) isolated processes, median ns/op [CI95], 🤝 = CI-overlap tie) ===\n`,
)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(
  `${pad('op', 32)} ${padL('pyreon', 8)} ${padL('zustand', 9)} ${padL('jotai', 8)} ${padL('vs zustand', 15)} ${padL('vs jotai', 14)}   note`,
)
console.log('─'.repeat(130))
for (const r of rows) {
  const p = r.cells.pyreon
  const verdict = (c: Cell) => {
    const ratio = c.med / p.med
    const tie = overlaps(p.ci, c.ci)
    const base = ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`
    return tie ? `🤝 ${base}` : base
  }
  console.log(
    `${pad(r.op, 32)} ${padL(p.med.toFixed(0), 8)} ${padL(r.cells.zustand.med.toFixed(0), 9)} ${padL(r.cells.jotai.med.toFixed(0), 8)} ${padL(verdict(r.cells.zustand), 15)} ${padL(verdict(r.cells.jotai), 14)}   ${r.note ?? ''}`,
  )
}
console.log(
  `\n(ratios = competitor ÷ Pyreon; >1 ⇒ Pyreon faster; 🤝 = CI95 overlap with Pyreon (treat as tied). Pooled median of 41 small runs × ${CELL_REPEATS} fresh processes per (op × impl); no forced GC — see measureSamples doc. ns machine-dependent — the ratio is the portable signal.)`,
)
