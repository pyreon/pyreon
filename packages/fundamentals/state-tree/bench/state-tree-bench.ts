/**
 * @pyreon/state-tree vs MobX-State-Tree — objective head-to-head.
 *
 * Run: `bun run bench:mst` (sets NODE_ENV=production).
 *
 * Objectivity contract:
 *  - NODE_ENV=production (shell-set by the script) BEFORE either library loads,
 *    so neither library's dev-mode instrumentation is measured.
 *  - Each library is used IDIOMATICALLY — MST `types.model().actions()`;
 *    Pyreon `model({state}).actions().create()`.
 *  - A CORRECTNESS GATE asserts both libraries produce the SAME observable
 *    result for every op before timing.
 *  - PER-(OP × LIBRARY) PROCESS ISOLATION — each cell runs in a fresh child
 *    in which ONLY that library's path is warmed + timed (it used to be one
 *    child per op timing Pyreon FIRST, then the competitor, in the same
 *    process — an order bias against whichever ran second or first). Process
 *    isolation is load-bearing here: running ops in one process let mobx's
 *    global scheduler state accumulate and inflated later ops ~10× (an MST
 *    toggle is ~2.1µs isolated but showed ~30µs after prior ops).
 *  - Per-op DISCLOSURE: MST type-checks on `create` + `applySnapshot` (it
 *    validates the snapshot against the model type); plain `@pyreon/state-tree`
 *    does NOT. Those ops are not pure apples-to-apples — flagged in the table.
 *  - Impl order rotated per round; samples pooled over ${BENCH_ROUNDS:-4}
 *    rounds → median ns/op + seeded bootstrap CI95; CI overlap = 🤝 tie.
 *    A `sink` (written out by every child) defeats DCE. `--quick` = a
 *    correctness/structure smoke with meaningless timings.
 *  - `BENCH_GATE_ONLY=1` runs the correctness gate and exits 0 without timing —
 *    use it to check correctness on a loaded machine, where timings are worthless.
 */
process.env.NODE_ENV = 'production'

import { cpus, loadavg } from 'node:os'
import { effect } from '@pyreon/reactivity'
import { s as v } from '@pyreon/validate'
import { autorun } from 'mobx'
import {
  applyPatch as mstApplyPatch,
  applySnapshot as mstApplySnapshot,
  getSnapshot as mstGetSnapshot,
  types,
} from 'mobx-state-tree'
import { applyPatch, applySnapshot, getSnapshot, model } from '../src/index'

// ─── isolated-cell harness ───────────────────────────────────────────────────
// ONE fresh child process per (op × library) — only that library's path is
// warmed/timed in it, so neither library measures after the other's JIT/heap
// debt. The impl order is ROTATED per round (and per op), so neither library
// is systematically first while the machine drifts; samples from every round
// are POOLED → median + SEEDED bootstrap CI95 (reproducible for identical
// samples). Overlapping CIs = 🤝 statistical tie — no winner is read. Same
// shape as the store / rx / http benches. `--quick` (or BENCH_QUICK=1) is a
// structural/correctness smoke only — its timings are meaningless.
declare const Bun: {
  version: string
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; stderr: Uint8Array; exitCode: number }
}
const QUICK = process.argv.includes('--quick') || process.env.BENCH_QUICK === '1'
const ROUNDS = QUICK ? 1 : Number(process.env.BENCH_ROUNDS ?? 4)
const now = () => Number(process.hrtime.bigint())

function measureSamples(
  fn: () => void,
  opts: { warmup?: number; iters?: number; runs?: number } = {},
): number[] {
  const warmup = QUICK ? 100 : (opts.warmup ?? 2_000)
  const iters = QUICK ? 500 : (opts.iters ?? 20_000)
  const runs = QUICK ? 3 : (opts.runs ?? 11)
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    samples.push((now() - t0) / iters)
  }
  return samples
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** mulberry32 PRNG — seeded so the CI is reproducible for identical samples. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a — a stable per-cell seed from the cell's label. */
function seedOf(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  return h >>> 0
}

function bootstrapCI(samples: readonly number[], key: string, B = 2_000): [number, number] {
  const rand = seededRandom(seedOf(key))
  const n = samples.length
  const meds = new Array<number>(B)
  const re = new Array<number>(n)
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) re[i] = samples[(rand() * n) | 0]!
    meds[b] = median(re)
  }
  meds.sort((a, b) => a - b)
  return [meds[(B * 0.025) | 0]!, meds[(B * 0.975) | 0]!]
}

interface Cell {
  median: number
  ci: [number, number]
  n: number
}
const ciOverlap = (a: Cell, b: Cell): boolean => a.ci[0] <= b.ci[1] && b.ci[0] <= a.ci[1]

function runtimeBanner(): string {
  const engine =
    typeof Bun !== 'undefined'
      ? `bun ${Bun.version} (JavaScriptCore)`
      : `node ${process.version} (V8)`
  const load = loadavg()
    .map((l) => l.toFixed(2))
    .join(' ')
  return `${engine} · ${process.platform}/${process.arch} · ${cpus()[0]?.model ?? 'unknown cpu'} · loadavg ${load} · NODE_ENV=${process.env.NODE_ENV}`
}

/** Child argv: `<op> <impl>` (flags such as `--quick` are ignored here). */
const childArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'))

function runIsolatedCells<I extends string>(
  ops: readonly string[],
  impls: readonly I[],
): Record<string, Record<I, Cell>> {
  const pooled: Record<string, Record<string, number[]>> = {}
  for (const op of ops) {
    pooled[op] = {}
    for (const impl of impls) pooled[op]![impl] = []
  }
  for (let round = 0; round < ROUNDS; round++) {
    ops.forEach((op, opIndex) => {
      const k = (round + opIndex) % impls.length
      const order = [...impls.slice(k), ...impls.slice(0, k)]
      for (const impl of order) {
        const proc = Bun.spawnSync(
          [process.execPath, import.meta.path, op, impl, ...(QUICK ? ['--quick'] : [])],
          { env: { ...process.env, NODE_ENV: 'production' } },
        )
        if (proc.exitCode !== 0) {
          throw new Error(
            `child failed for (op "${op}", impl "${impl}"):\n${new TextDecoder().decode(proc.stderr)}`,
          )
        }
        const out = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
        pooled[op]![impl]!.push(...out.samples)
      }
    })
  }
  const result: Record<string, Record<I, Cell>> = {}
  for (const op of ops) {
    const row = {} as Record<I, Cell>
    for (const impl of impls) {
      const s = pooled[op]![impl]!
      row[impl] = { median: median(s), ci: bootstrapCI(s, `${op}::${impl}`), n: s.length }
    }
    result[op] = row
  }
  return result
}

/** Two-library table: Pyreon vs one competitor, CI + tie verdict per row. */
function printPairTable<I extends string>(opts: {
  title: string
  ops: readonly string[]
  cells: Record<string, Record<I, Cell>>
  pyreon: I
  competitor: I
  competitorLabel: string
  notes: Record<string, string | undefined>
  opWidth: number
}): void {
  const { ops, cells, pyreon, competitor, competitorLabel, notes, opWidth } = opts
  console.log(`=== ${opts.title} ===`)
  console.log(runtimeBanner())
  console.log(
    `one fresh process per (op × library) · ${ROUNDS} round(s), impl order rotated · pooled median ns/op [seeded bootstrap CI95] · 🤝 = CI overlap (tie)${QUICK ? ' · --quick: TIMINGS MEANINGLESS' : ''}\n`,
  )
  const fmtCell = (c: Cell) => `${c.median.toFixed(0)} [${c.ci[0].toFixed(0)}–${c.ci[1].toFixed(0)}]`
  console.log(
    `${'op'.padEnd(opWidth)} ${'pyreon'.padStart(20)} ${competitorLabel.padStart(20)}  verdict   note`,
  )
  console.log('─'.repeat(opWidth + 80))
  for (const op of ops) {
    const p = cells[op]![pyreon]
    const c = cells[op]![competitor]
    const ratio = c.median / p.median
    const verdict = ciOverlap(p, c)
      ? '🤝 tie'
      : ratio >= 1
        ? `pyreon ${ratio.toFixed(1)}x faster`
        : `pyreon ${(1 / ratio).toFixed(1)}x SLOWER`
    console.log(
      `${op.padEnd(opWidth)} ${fmtCell(p).padStart(20)} ${fmtCell(c).padStart(20)}  ${verdict}   ${notes[op] ?? ''}`,
    )
  }
}

let sink = 0

// ─── models (idiomatic per library) ─────────────────────────────────────────
const MstTodo = types
  .model('Todo', { id: types.number, label: types.string, done: types.boolean })
  .actions((self) => ({
    toggle() {
      self.done = !self.done
    },
  }))
const PyrTodo = model({ state: { id: 0, label: '', done: false } }).actions((self) => ({
  toggle: () => self.done.set(!self.done()),
}))
// Schema-mode Pyreon model — VALIDATES on create + applySnapshot, exactly like
// MST. This is the apples-to-apples comparison for `create` / `applySnapshot`:
// the plain-mode model above skips validation (its `create`/`applySnapshot`
// numbers flatter Pyreon vs MST, which always type-checks the snapshot).
const PyrTodoSchema = model({
  schema: v.object({ id: v.number(), label: v.string(), done: v.boolean() }),
}).actions((self) => ({
  toggle: () => self.done.set(!self.done()),
}))
const INITIAL = { id: 1, label: 'pretty plate', done: false }

// ─── one op = a {pyreon, mst} pair, measured in its OWN process ──────────────
const IMPLS = ['pyreon', 'mst'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, () => void>
const OPS: Record<string, { note?: string; make: () => Impl }> = {
  'create (plain, no validation)': {
    note: 'NOT apples-to-apples — Pyreon plain mode skips validation; MST validates. See "create (schema)".',
    make: () => ({
      pyreon: () => {
        sink += PyrTodo.create(INITIAL).id()
      },
      mst: () => {
        sink += MstTodo.create(INITIAL).id
      },
    }),
  },
  'create (schema)': {
    note: 'FAIR — both validate against a schema/model type on create',
    make: () => ({
      pyreon: () => {
        sink += PyrTodoSchema.create(INITIAL).id()
      },
      mst: () => {
        sink += MstTodo.create(INITIAL).id
      },
    }),
  },
  read: {
    make: () => {
      const pt = PyrTodo.create(INITIAL)
      const mt = MstTodo.create(INITIAL)
      return {
        pyreon: () => {
          sink += pt.done() ? 1 : 0
        },
        mst: () => {
          sink += mt.done ? 1 : 0
        },
      }
    },
  },
  'action toggle': {
    make: () => {
      const pt = PyrTodo.create(INITIAL)
      const mt = MstTodo.create(INITIAL)
      return {
        pyreon: () => {
          pt.toggle()
          sink += pt.done() ? 1 : 0
        },
        mst: () => {
          mt.toggle()
          sink += mt.done ? 1 : 0
        },
      }
    },
  },
  getSnapshot: {
    make: () => {
      const pt = PyrTodo.create(INITIAL)
      const mt = MstTodo.create(INITIAL)
      return {
        pyreon: () => {
          sink += getSnapshot(pt).id
        },
        mst: () => {
          sink += mstGetSnapshot(mt).id
        },
      }
    },
  },
  'applySnapshot (plain, no validation)': {
    note: 'NOT apples-to-apples — Pyreon plain mode skips validation; MST validates. See "applySnapshot (schema)".',
    make: () => {
      const pt = PyrTodo.create(INITIAL)
      const mt = MstTodo.create(INITIAL)
      let i = 0
      return {
        pyreon: () => {
          i++
          applySnapshot(pt, { id: i, label: 'x', done: (i & 1) === 1 })
        },
        mst: () => {
          i++
          mstApplySnapshot(mt, { id: i, label: 'x', done: (i & 1) === 1 })
        },
      }
    },
  },
  'applySnapshot (schema)': {
    note: 'FAIR — both re-validate the snapshot against a schema/model type',
    make: () => {
      const pt = PyrTodoSchema.create(INITIAL)
      const mt = MstTodo.create(INITIAL)
      let i = 0
      return {
        pyreon: () => {
          i++
          applySnapshot(pt, { id: i, label: 'x', done: (i & 1) === 1 })
        },
        mst: () => {
          i++
          mstApplySnapshot(mt, { id: i, label: 'x', done: (i & 1) === 1 })
        },
      }
    },
  },
  applyPatch: {
    make: () => {
      const pt = PyrTodo.create(INITIAL)
      const mt = MstTodo.create(INITIAL)
      let i = 0
      return {
        pyreon: () => {
          i++
          applyPatch(pt, { op: 'replace', path: '/done', value: (i & 1) === 1 })
        },
        mst: () => {
          i++
          mstApplyPatch(mt, { op: 'replace', path: '/done', value: (i & 1) === 1 })
        },
      }
    },
  },
  'reactive write→observer': {
    note: 'MobX peer = `autorun` (1:1 with Pyreon `effect`: one closure, eager first run, re-runs on dep change). `reaction` is NOT the peer — two closures + a comparer per notify, i.e. machinery the Pyreon side does not have.',
    make: () => {
      const pt = PyrTodo.create(INITIAL)
      const mt = MstTodo.create(INITIAL)
      // Identical observer BODIES on both sides so the row measures the
      // write→notify path, not a difference in what the observer does.
      effect(() => {
        sink += pt.done() ? 1 : 0
      })
      autorun(() => {
        sink += mt.done ? 1 : 0
      })
      return { pyreon: () => pt.toggle(), mst: () => mt.toggle() }
    },
  },
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode: measure ONE (op, impl) cell, print JSON ─────────────────────
const [childOp, childImpl] = childArgs
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  if (!childImpl || !(IMPLS as readonly string[]).includes(childImpl)) {
    throw new Error(`unknown impl: ${String(childImpl)}`)
  }
  // `make()` builds both arms' fixtures, but ONLY `childImpl` is warmed + timed.
  const fn = spec.make()[childImpl as ImplName]
  const samples = measureSamples(fn)
  // `sink` is written out so the measured work is observable (no DCE).
  process.stdout.write(JSON.stringify({ samples, sink }))
  process.exit(0)
}

// ─── orchestrator mode: correctness gate, then spawn one child per op ─────────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
{
  const mt = MstTodo.create(INITIAL)
  const pt = PyrTodo.create(INITIAL)
  assert(mt.done === pt.done() && pt.done() === false, 'create: done')
  mt.toggle()
  pt.toggle()
  assert(mt.done === pt.done() && pt.done() === true, 'toggle: done')
  assert(JSON.stringify(mstGetSnapshot(mt)) === JSON.stringify(getSnapshot(pt)), 'getSnapshot')
  mstApplySnapshot(mt, { id: 9, label: 'z', done: false })
  applySnapshot(pt, { id: 9, label: 'z', done: false })
  assert(mt.id === pt.id() && mt.label === pt.label() && mt.done === pt.done(), 'applySnapshot')
  mstApplyPatch(mt, { op: 'replace', path: '/done', value: true })
  applyPatch(pt, { op: 'replace', path: '/done', value: true })
  assert(mt.done === pt.done() && pt.done() === true, 'applyPatch')
  // `autorun` is the 1:1 peer of Pyreon's `effect`: both run EAGERLY once at
  // creation and again on each dependency change, so an identical write must
  // produce an identical fire count. (The old gate used `reaction`, which does
  // NOT run eagerly — hence its `=== 1` where Pyreon had `=== 2`. That count
  // asymmetry was the visible tip of the primitive mismatch this row now fixes.)
  let mF = 0
  let pF = 0
  let mLast = false
  let pLast = false
  const dM = autorun(() => {
    mLast = mt.done
    mF++
  })
  const dP = effect(() => {
    pLast = pt.done()
    pF++
  })
  mt.toggle()
  pt.toggle()
  assert(mF === 2, `mobx autorun fire (${mF}) — expected 1 eager + 1 on change`)
  assert(pF === 2, `pyreon effect fire (${pF}) — expected 1 eager + 1 on change`)
  assert(mF === pF, `observer fire counts diverge (mobx ${mF} vs pyreon ${pF})`)
  assert(mLast === pLast, `observers saw different values (mobx ${mLast} vs pyreon ${pLast})`)
  dM()
  dP.dispose()
  console.log('✓ correctness gate passed — both libraries agree on every op\n')
}
if (process.env.BENCH_GATE_ONLY) process.exit(0)

const cells = runIsolatedCells(OP_ORDER, IMPLS)
const notes: Record<string, string | undefined> = {}
for (const op of OP_ORDER) notes[op] = OPS[op]?.note
printPairTable({
  title: '@pyreon/state-tree vs mobx-state-tree',
  ops: OP_ORDER,
  cells,
  pyreon: 'pyreon',
  competitor: 'mst',
  competitorLabel: 'mst',
  notes,
  opWidth: 38,
})
console.log(
  `\n(verdict = mst ÷ pyreon median, printed only when the CI95s do NOT overlap. ns is machine-dependent — the ratio is the portable signal.)`,
)
