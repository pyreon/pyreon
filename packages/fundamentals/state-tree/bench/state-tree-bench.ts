/**
 * @pyreon/state-tree vs MobX-State-Tree — objective head-to-head.
 *
 * Run: `bun run bench:mst` (sets NODE_ENV=production).
 *
 * Objectivity contract (see .claude/plans/fundamentals-benchmarks.md):
 *  - NODE_ENV=production (shell-set by the script) BEFORE either library loads,
 *    so neither library's dev-mode instrumentation is measured.
 *  - Each library is used IDIOMATICALLY — MST `types.model().actions()`;
 *    Pyreon `model({state}).actions().create()`.
 *  - A CORRECTNESS GATE asserts both libraries produce the SAME observable
 *    result for every op before timing.
 *  - PER-OP PROCESS ISOLATION: each op is measured in a FRESH child process
 *    (`bun <self> <op>`). This is load-bearing for fairness — running all ops
 *    in one process let mobx's global scheduler state accumulate and inflated
 *    later ops ~10× (a measurement artifact, NOT MST's real cost; verified:
 *    an MST toggle is ~2.1µs isolated but showed ~30µs after prior ops). One
 *    process per op removes that contamination entirely.
 *  - Per-op DISCLOSURE: MST type-checks on `create` + `applySnapshot` (it
 *    validates the snapshot against the model type); plain `@pyreon/state-tree`
 *    does NOT. Those ops are not pure apples-to-apples — flagged in the table.
 *  - Median ns/op over warmup + N runs; a `sink` defeats DCE.
 */
process.env.NODE_ENV = 'production'

import { effect } from '@pyreon/reactivity'
import { s as v } from '@pyreon/validate'
import { reaction } from 'mobx'
import {
  applyPatch as mstApplyPatch,
  applySnapshot as mstApplySnapshot,
  getSnapshot as mstGetSnapshot,
  types,
} from 'mobx-state-tree'
import { applyPatch, applySnapshot, getSnapshot, model } from '../src/index'

// ─── timing core ─────────────────────────────────────────────────────────────
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
type Impl = { pyreon: () => void; mst: () => void }
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
    make: () => {
      const pt = PyrTodo.create(INITIAL)
      const mt = MstTodo.create(INITIAL)
      effect(() => {
        pt.done()
        sink++
      })
      reaction(
        () => mt.done,
        () => {
          sink++
        },
      )
      return { pyreon: () => pt.toggle(), mst: () => mt.toggle() }
    },
  },
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode: measure ONE op, print JSON ──────────────────────────────────
const childOp = process.argv[2]
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  const impl = spec.make()
  const result = { pyreon: measure(impl.pyreon), mst: measure(impl.mst), sink }
  process.stdout.write(JSON.stringify(result))
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
  let mF = 0
  let pF = 0
  const dM = reaction(
    () => mt.done,
    () => mF++,
  )
  const dP = effect(() => {
    pt.done()
    pF++
  })
  mt.toggle()
  pt.toggle()
  assert(mF === 1, `mobx reaction fire (${mF})`)
  assert(pF === 2, `pyreon effect fire (${pF})`)
  dM()
  dP.dispose()
  console.log('✓ correctness gate passed — both libraries agree on every op\n')
}

declare const Bun: { spawnSync: (cmd: string[], opts: { env: Record<string, string | undefined> }) => { stdout: Uint8Array; exitCode: number } }
interface Row {
  op: string
  pyreon: number
  mst: number
  note?: string
}
const rows: Row[] = []
for (const op of OP_ORDER) {
  const proc = Bun.spawnSync(['bun', import.meta.path, op], { env: { ...process.env, NODE_ENV: 'production' } })
  if (proc.exitCode !== 0) throw new Error(`child failed for op "${op}"`)
  const r = JSON.parse(new TextDecoder().decode(proc.stdout)) as { pyreon: number; mst: number }
  rows.push({ op, pyreon: r.pyreon, mst: r.mst, note: OPS[op]?.note })
}

console.log(`=== @pyreon/state-tree vs mobx-state-tree (${process.platform}/${process.arch}, NODE_ENV=production, per-op isolated, median ns/op) ===\n`)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(
  `${pad('op', 24)} ${padL('pyreon ns', 10)} ${padL('mst ns', 10)} ${padL('ratio', 14)}   note`,
)
console.log('─'.repeat(96))
for (const r of rows) {
  const ratio = r.mst / r.pyreon
  const ratioStr = ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`
  console.log(
    `${pad(r.op, 24)} ${padL(r.pyreon.toFixed(0), 10)} ${padL(r.mst.toFixed(0), 10)} ${padL(ratioStr, 14)}   ${r.note ?? ''}`,
  )
}
console.log(
  `\n(ratio = MST ÷ Pyreon; >1 ⇒ Pyreon faster. Median of 11×20k, each op in a fresh process. ns is machine-dependent — the ratio is the portable signal.)`,
)
