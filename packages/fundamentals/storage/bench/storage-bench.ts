/**
 * @pyreon/storage vs Jotai `atomWithStorage` vs Zustand `persist` — objective
 * head-to-head on the REACTIVE PERSISTENCE hot path.
 *
 * Run: `bun run bench:storage` (sets NODE_ENV=production).
 *
 * Objectivity contract (mirrors bench/store-bench.ts):
 *  - NODE_ENV=production set by the npm script's SHELL before the process
 *    starts (the in-file assignment below only covers per-call gates for direct
 *    invocation; the shell env + explicit child env are load-bearing).
 *  - Idiomatic per library — Pyreon `createStorage(backend)('key', init)`,
 *    Jotai `atomWithStorage(key, init, storage)` + `createStore()`, Zustand
 *    `persist((set) => ({...}), { storage })` over `createStore`.
 *  - FAIR STORAGE ENGINE: all three write to the SAME in-memory `Map`-backed
 *    storage shim. This isolates the REACTIVE-LAYER + SERIALIZE + NOTIFY cost —
 *    NOT the browser's `localStorage` syscall (which every library pays
 *    identically and which isn't available in Node/Bun anyway). Pyreon is
 *    represented via `createStorage(memBackend)` — the IDENTICAL
 *    `wrapSignal` + `serialize` + notify hot path as `useStorage`, minus the
 *    `window.localStorage` call that the shim replaces for all three.
 *  - CORRECTNESS GATE asserts all three agree (read / write-through-to-storage /
 *    subscriber-fire) before any timing.
 *  - PER-(OP × IMPL) PROCESS ISOLATION — each cell runs in a fresh `bun` child
 *    so ops don't pollute each other's JIT/heap and no library measures after
 *    another's GC debt.
 *  - NO forced GC (JSC jettisons compiled code on forced GC → re-tier noise).
 *    Big warmup + many small pooled samples across ${BENCH_REPEATS:-3} spawns.
 *  - `create` resets Pyreon's key registry BETWEEN runs (untimed) so the
 *    measurement is per-instance creation cost, not an ever-growing Map.
 *  - A `sink` defeats DCE.
 *
 * HONEST FRAMING (don't cherry-pick):
 *  - This is a CPU-objective micro-bench of the reactive persistence layer, NOT
 *    a real-app measurement. Jotai/Zustand are optimized for React render
 *    dedup; these are their vanilla-store persistence numbers.
 *  - The IndexedDB path (`useIndexedDB` vs idb-keyval) is deliberately OUT of
 *    scope: it's async and dominated by the browser's IDB transaction, not the
 *    reactive layer — an ns micro-bench can't measure it fairly.
 *  - Zustand `persist` wraps the value in a `{ state, version }` envelope and
 *    writes via an internal subscription — so its write path does structurally
 *    more than Pyreon's plain serialize on the no-subscriber row; that's
 *    disclosed, not hidden.
 */
process.env.NODE_ENV = 'production'

import { createStore as createJotai } from 'jotai/vanilla'
import { atomWithStorage, createJSONStorage as jotaiJSON } from 'jotai/vanilla/utils'
import { createStore as createZustand } from 'zustand/vanilla'
import { createJSONStorage as zustandJSON, persist } from 'zustand/middleware'
import { createStorage } from '../src/custom'
import { _resetRegistry } from '../src/registry'

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; exitCode: number }
}

const now = () => Number(process.hrtime.bigint())

// ── shared in-memory storage engine (all three write here) ───────────────────
function makeMemStorage() {
  const mem = new Map<string, string>()
  return {
    mem,
    // localStorage-ish sync shape used by jotai/zustand createJSONStorage:
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
  }
}

function measureSamples(
  fn: () => void,
  { warmup = 40_000, iters = 5_000, runs = 41, between }: {
    warmup?: number
    iters?: number
    runs?: number
    between?: () => void
  } = {},
): number[] {
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
const IMPLS = ['pyreon', 'jotai', 'zustand'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, () => void>

// ── idiomatic factories ──────────────────────────────────────────────────────
let keyId = 0
function makePyreon() {
  const store = makeMemStorage()
  const use = createStorage(store, 'bench')
  return use(`bench-${keyId++}`, 0)
}
function makeJotai() {
  const store = makeMemStorage()
  const jstore = createJotai()
  const a = atomWithStorage(`bench-${keyId++}`, 0, jotaiJSON<number>(() => store))
  return { jstore, a }
}
function makeZustand() {
  const store = makeMemStorage()
  const zs = createZustand<{ v: number; setV: (x: number) => void }>()(
    persist(
      (set) => ({ v: 0, setV: (x: number) => set({ v: x }) }),
      { name: `bench-${keyId++}`, storage: zustandJSON(() => store) },
    ),
  )
  return zs
}

// ── ops ──────────────────────────────────────────────────────────────────────
interface OpSpec {
  note?: string
  make: () => Impl
  between?: () => void
  iters?: number
}

const OPS: Record<string, OpSpec> = {
  read: {
    note: 'cached reactive read of the persisted value',
    make: () => {
      const p = makePyreon()
      const j = makeJotai()
      const z = makeZustand()
      return {
        pyreon: () => {
          sink += p()
        },
        jotai: () => {
          sink += j.jstore.get(j.a)
        },
        zustand: () => {
          sink += z.getState().v
        },
      }
    },
  },
  'write (serialize + persist, no subscriber)': {
    note: 'set → JSON.serialize → storage.setItem. Zustand also wraps in {state,version} + writes via an internal subscription.',
    make: () => {
      const p = makePyreon()
      const j = makeJotai()
      const z = makeZustand()
      let i = 0
      return {
        pyreon: () => {
          p.set(++i)
        },
        jotai: () => {
          j.jstore.set(j.a, ++i)
        },
        zustand: () => {
          z.getState().setV(++i)
        },
      }
    },
  },
  'write → 1 subscriber': {
    note: 'realistic — a listener is attached, so every lib runs its full notify path',
    make: () => {
      const p = makePyreon()
      const j = makeJotai()
      const z = makeZustand()
      p.subscribe(() => {
        sink++
      })
      j.jstore.sub(j.a, () => {
        sink++
      })
      z.subscribe(() => {
        sink++
      })
      let i = 0
      return {
        pyreon: () => {
          p.set(++i)
        },
        jotai: () => {
          j.jstore.set(j.a, ++i)
        },
        zustand: () => {
          z.getState().setV(++i)
        },
      }
    },
  },
  create: {
    note: 'first registration — Pyreon allocs a signal + registry entry (reset between runs, untimed); Jotai a fresh atom + store; Zustand a fresh persist store (reads storage on init).',
    iters: 2_000,
    between: () => _resetRegistry(),
    make: () => ({
      pyreon: () => {
        sink += makePyreon()()
      },
      jotai: () => {
        const j = makeJotai()
        sink += j.jstore.get(j.a)
      },
      zustand: () => {
        sink += makeZustand().getState().v
      },
    }),
  },
}
const OP_ORDER = Object.keys(OPS)

// ── child mode ────────────────────────────────────────────────────────────────
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

// ── orchestrator: correctness gate ────────────────────────────────────────────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
{
  const p = makePyreon()
  const j = makeJotai()
  const z = makeZustand()
  assert(p() === 0 && j.jstore.get(j.a) === 0 && z.getState().v === 0, 'read 0')
  p.set(5)
  j.jstore.set(j.a, 5)
  z.getState().setV(5)
  assert(p() === 5 && j.jstore.get(j.a) === 5 && z.getState().v === 5, 'write → 5')
  let pf = 0
  let jf = 0
  let zf = 0
  const up = p.subscribe(() => pf++)
  const uj = j.jstore.sub(j.a, () => jf++)
  const uz = z.subscribe(() => zf++)
  p.set(6)
  j.jstore.set(j.a, 6)
  z.getState().setV(6)
  assert(pf >= 1 && jf >= 1 && zf >= 1, `subscriber fire (p=${pf} j=${jf} z=${zf})`)
  up()
  uj()
  uz()
  _resetRegistry()
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
  `=== @pyreon/storage vs Jotai atomWithStorage vs Zustand persist (${process.platform}/${process.arch}, NODE_ENV=production, shared in-memory storage engine, per-(op×impl) isolated processes, median ns/op [CI95], 🤝 = CI-overlap tie) ===\n`,
)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(
  `${pad('op', 44)} ${padL('pyreon', 8)} ${padL('jotai', 8)} ${padL('zustand', 9)} ${padL('vs jotai', 15)} ${padL('vs zustand', 16)}   note`,
)
console.log('─'.repeat(140))
for (const r of rows) {
  const p = r.cells.pyreon
  const verdict = (c: Cell) => {
    const ratio = c.med / p.med
    const tie = overlaps(p.ci, c.ci)
    const base = ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`
    return tie ? `🤝 ${base}` : base
  }
  console.log(
    `${pad(r.op, 44)} ${padL(p.med.toFixed(0), 8)} ${padL(r.cells.jotai.med.toFixed(0), 8)} ${padL(r.cells.zustand.med.toFixed(0), 9)} ${padL(verdict(r.cells.jotai), 15)} ${padL(verdict(r.cells.zustand), 16)}   ${r.note ?? ''}`,
  )
}
console.log(
  `\n(ratios = competitor ÷ Pyreon; >1 ⇒ Pyreon faster; 🤝 = CI95 overlap with Pyreon (treat as tied). Pooled median of 41 small runs × ${CELL_REPEATS} fresh processes per (op × impl); no forced GC. ns machine-dependent — the ratio is the portable signal.)`,
)
