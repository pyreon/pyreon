/**
 * @pyreon/machine vs XState — objective head-to-head.
 *
 * Run: `bun run bench:xstate` (sets NODE_ENV=production).
 *
 * Objectivity contract (see .claude/plans/fundamentals-benchmarks.md):
 *  - NODE_ENV=production (shell-set) before either library loads.
 *  - Idiomatic per library — Pyreon `createMachine({initial, states})` (the
 *    reactive instance IS the machine); XState `createMachine(config)` once +
 *    `createActor(machine).start()` per instance, reads via `getSnapshot()`.
 *  - CORRECTNESS GATE asserts both produce identical state/guard results before
 *    timing.
 *  - PER-OP PROCESS ISOLATION (each op in a fresh `bun` child) — keeps each
 *    library's module/global state from contaminating later ops.
 *  - DISCLOSURE: XState separates the machine DEFINITION (built once, shared)
 *    from the ACTOR/interpreter (spawned per instance) — its `create` op is the
 *    actor-spawn cost from a shared machine; Pyreon's `createMachine` builds the
 *    reactive instance directly. Reads in XState always go through
 *    `getSnapshot()` (idiomatic) — that cost is included in `can`/`matches`.
 *  - Median ns/op over warmup + N runs; a `sink` defeats DCE.
 *
 * Both libraries are statechart interpreters; the expected gap is Pyreon's
 * signal-backed transition (~tens of ns) vs XState's interpreter + snapshot
 * machinery. XState does MORE per op (immutable snapshots, actor lifecycle,
 * richer event objects) — flagged where it matters.
 */
process.env.NODE_ENV = 'production'

import { createMachine as createPyreonMachine } from '../src/index'
import { createActor, createMachine as createXstateMachine } from 'xstate'

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

// ─── machine definitions (idiomatic per library) ────────────────────────────
// Toggle off⇄on, with a guarded FINISH from `on` (guard reads the payload).
const PYR_CONFIG = {
  initial: 'off',
  states: {
    off: { on: { TOGGLE: 'on' } },
    on: {
      on: {
        TOGGLE: 'off',
        FINISH: { target: 'off', guard: (p?: unknown) => (p as { ok?: boolean })?.ok === true },
      },
    },
  },
} as const
const XSTATE_MACHINE = createXstateMachine({
  initial: 'off',
  states: {
    off: { on: { TOGGLE: 'on' } },
    on: {
      on: {
        TOGGLE: 'off',
        FINISH: { target: 'off', guard: ({ event }) => (event as { ok?: boolean }).ok === true },
      },
    },
  },
})
const makePyr = () => createPyreonMachine(PYR_CONFIG)
const makeXstate = () => createActor(XSTATE_MACHINE).start()

const IMPLS = ['pyreon', 'xstate'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, () => void>

const OPS: Record<string, { note?: string; make: () => Impl }> = {
  'create (instance)': {
    note: 'XState spawns an actor from a shared machine; Pyreon builds the reactive instance',
    make: () => ({
      pyreon: () => {
        sink += makePyr()() === 'off' ? 1 : 0
      },
      xstate: () => {
        sink += makeXstate().getSnapshot().value === 'off' ? 1 : 0
      },
    }),
  },
  'send (transition)': {
    make: () => {
      const p = makePyr()
      const x = makeXstate()
      return {
        pyreon: () => {
          p.send('TOGGLE')
          sink += p() === 'on' ? 1 : 0
        },
        xstate: () => {
          x.send({ type: 'TOGGLE' })
          sink += x.getSnapshot().value === 'on' ? 1 : 0
        },
      }
    },
  },
  'can (guard eval)': {
    note: 'evaluates the guard with the payload; no transition (read-only)',
    make: () => {
      const p = makePyr()
      const x = makeXstate()
      p.send('TOGGLE') // → on, where FINISH (guarded) is valid
      x.send({ type: 'TOGGLE' })
      return {
        pyreon: () => {
          sink += p.can('FINISH', { ok: true }) ? 1 : 0
        },
        xstate: () => {
          sink += x.getSnapshot().can({ type: 'FINISH', ok: true }) ? 1 : 0
        },
      }
    },
  },
  matches: {
    make: () => {
      const p = makePyr()
      const x = makeXstate()
      return {
        pyreon: () => {
          sink += p.matches('off') ? 1 : 0
        },
        xstate: () => {
          sink += x.getSnapshot().matches('off') ? 1 : 0
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
  const p = makePyr()
  const x = makeXstate()
  assert(p() === 'off' && x.getSnapshot().value === 'off', 'initial off')
  p.send('TOGGLE')
  x.send({ type: 'TOGGLE' })
  assert(p() === 'on' && x.getSnapshot().value === 'on', 'toggle → on')
  assert(
    p.can('FINISH', { ok: true }) === true && x.getSnapshot().can({ type: 'FINISH', ok: true }) === true,
    'guard passes',
  )
  assert(
    p.can('FINISH', { ok: false }) === false && x.getSnapshot().can({ type: 'FINISH', ok: false }) === false,
    'guard rejects',
  )
  p.send('FINISH', { ok: true })
  x.send({ type: 'FINISH', ok: true })
  assert(p() === 'off' && x.getSnapshot().value === 'off', 'guarded FINISH → off')
  assert(p.matches('off') === true && x.getSnapshot().matches('off') === true, 'matches off')
  console.log('✓ correctness gate passed — both machines agree on state + guard\n')
}

declare const Bun: {
  spawnSync: (cmd: string[], opts: { env: Record<string, string | undefined> }) => { stdout: Uint8Array; exitCode: number }
}
interface Row {
  op: string
  pyreon: number
  xstate: number
  note?: string
}
const rows: Row[] = []
for (const op of OP_ORDER) {
  const proc = Bun.spawnSync(['bun', import.meta.path, op], { env: { ...process.env, NODE_ENV: 'production' } })
  if (proc.exitCode !== 0) throw new Error(`child failed for op "${op}"`)
  const r = JSON.parse(new TextDecoder().decode(proc.stdout)) as Record<ImplName, number>
  rows.push({ op, pyreon: r.pyreon, xstate: r.xstate, note: OPS[op]?.note })
}

console.log(`=== @pyreon/machine vs XState (${process.platform}/${process.arch}, NODE_ENV=production, per-op isolated, median ns/op) ===\n`)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(`${pad('op', 20)} ${padL('pyreon', 9)} ${padL('xstate', 9)} ${padL('ratio', 14)}   note`)
console.log('─'.repeat(100))
for (const r of rows) {
  const ratio = r.xstate / r.pyreon
  const ratioStr = ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`
  console.log(`${pad(r.op, 20)} ${padL(r.pyreon.toFixed(0), 9)} ${padL(r.xstate.toFixed(0), 9)} ${padL(ratioStr, 14)}   ${r.note ?? ''}`)
}
console.log(`\n(ratio = XState ÷ Pyreon; >1 ⇒ Pyreon faster. Median 11×20k, each op in a fresh process. ns machine-dependent — the ratio is the portable signal.)`)
