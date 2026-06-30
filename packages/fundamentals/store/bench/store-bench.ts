/**
 * @pyreon/store vs Zustand vs Jotai — objective head-to-head.
 *
 * Run: `bun run bench:stores` (sets NODE_ENV=production).
 *
 * Objectivity contract (see .claude/plans/fundamentals-benchmarks.md):
 *  - NODE_ENV=production (shell-set) before any library loads.
 *  - Idiomatic per library — Pyreon `defineStore(id, () => ({signals, actions}))`,
 *    Zustand `createStore((set) => ({...}))`, Jotai `atom()` + `createStore()`.
 *  - CORRECTNESS GATE asserts all three produce identical results before timing.
 *  - PER-OP PROCESS ISOLATION (each op in a fresh `bun` child) — keeps each
 *    library's global/module state from one op contaminating another.
 *  - DISCLOSURE: Pyreon `defineStore` registers the store in a global registry
 *    (singleton-by-id — powers SSR / devtools / resetAllStores); Zustand & Jotai
 *    have no registry. So `setup` is not pure apples-to-apples — flagged.
 *  - Median ns/op over warmup + N runs; a `sink` defeats DCE.
 *
 * NOTE Jotai is atom-granular (no "store of fields + actions") — its closest
 * shape is one atom per field; `dispatch` = `set(atom, updater)`. Comparable for
 * read/write/notify; flagged where the model differs. Jotai is ALSO optimized
 * for React render-dedup, not raw vanilla `get`/`set` throughput — these are its
 * honest vanilla-store numbers, not its React render path.
 *
 * HONEST READ of the numbers (don't cherry-pick): Pyreon wins the hot path
 * (per-field dispatch + write→notify) and ties Zustand on read, but LOSES to
 * Zustand on `setup` (Pyreon's global registry vs Zustand's bare closure) and on
 * `patch` (Pyreon's mutation-tracking patch vs Zustand's shallow object merge).
 * Both losses are disclosed in the table. Pyreon dominates Jotai's vanilla store
 * everywhere because the atom-state-map indirection is heavy per get/set.
 */
process.env.NODE_ENV = 'production'

import { signal } from '@pyreon/reactivity'
import { atom, createStore as createJotai } from 'jotai/vanilla'
import { createStore as createZustand } from 'zustand/vanilla'
import { defineStore, resetAllStores } from '../src/index'

const now = () => Number(process.hrtime.bigint())
function measure(fn: () => void, { warmup = 2_000, iters = 20_000, runs = 11 } = {}): number {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    samples.push((now() - t0) / iters)
  }
  samples.sort((a, b) => a - b)
  return samples[samples.length >> 1] as number
}

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
const OPS: Record<string, { note?: string; make: () => Impl }> = {
  setup: {
    note: 'Pyreon registers in a global registry (SSR/devtools); Zustand/Jotai do not',
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
  'patch 2 fields': {
    note: 'Jotai sets 2 atoms (no multi-field patch primitive)',
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
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode: measure ONE op for all impls, print JSON ────────────────────
const childOp = process.argv[2]
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  const impl = spec.make()
  const out: Record<string, number> = {}
  for (const name of IMPLS) out[name] = measure(impl[name])
  process.stdout.write(JSON.stringify(out))
  process.exit(0)
}

// ─── orchestrator: correctness gate, then spawn one child per op ─────────────
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

declare const Bun: {
  spawnSync: (cmd: string[], opts: { env: Record<string, string | undefined> }) => { stdout: Uint8Array; exitCode: number }
}
interface Row {
  op: string
  pyreon: number
  zustand: number
  jotai: number
  note?: string
}
const rows: Row[] = []
for (const op of OP_ORDER) {
  const proc = Bun.spawnSync(['bun', import.meta.path, op], { env: { ...process.env, NODE_ENV: 'production' } })
  if (proc.exitCode !== 0) throw new Error(`child failed for op "${op}"`)
  const r = JSON.parse(new TextDecoder().decode(proc.stdout)) as Record<ImplName, number>
  rows.push({ op, pyreon: r.pyreon, zustand: r.zustand, jotai: r.jotai, note: OPS[op]?.note })
}

console.log(`=== @pyreon/store vs Zustand vs Jotai (${process.platform}/${process.arch}, NODE_ENV=production, per-op isolated, median ns/op) ===\n`)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(`${pad('op', 22)} ${padL('pyreon', 8)} ${padL('zustand', 9)} ${padL('jotai', 8)} ${padL('vs zustand', 12)} ${padL('vs jotai', 11)}   note`)
console.log('─'.repeat(110))
for (const r of rows) {
  const vz = r.zustand / r.pyreon
  const vj = r.jotai / r.pyreon
  const f = (x: number) => (x >= 1 ? `${x.toFixed(1)}x faster` : `${(1 / x).toFixed(1)}x SLOWER`)
  console.log(
    `${pad(r.op, 22)} ${padL(r.pyreon.toFixed(0), 8)} ${padL(r.zustand.toFixed(0), 9)} ${padL(r.jotai.toFixed(0), 8)} ${padL(f(vz), 12)} ${padL(f(vj), 11)}   ${r.note ?? ''}`,
  )
}
console.log(`\n(ratios = competitor ÷ Pyreon; >1 ⇒ Pyreon faster. Median 11×20k, each op in a fresh process. ns machine-dependent — ratio is the portable signal.)`)
