/**
 * @pyreon/machine vs XState — objective head-to-head.
 *
 * Run: `bun run bench:xstate` (sets NODE_ENV=production).
 *
 * Objectivity contract:
 *  - NODE_ENV=production (shell-set) before either library loads.
 *  - Idiomatic per library — Pyreon `createMachine({initial, states})` (the
 *    reactive instance IS the machine); XState `createMachine(config)` once +
 *    `createActor(machine).start()` per instance, reads via `getSnapshot()`.
 *  - CORRECTNESS GATE asserts both produce identical state/guard results before
 *    timing.
 *  - PER-(OP × LIBRARY) PROCESS ISOLATION — each cell runs in a fresh child
 *    in which ONLY that library's path is warmed + timed (it used to be one
 *    child per op timing Pyreon FIRST, then the competitor, in the same
 *    process — an order bias against whichever ran second or first).
 *  - DISCLOSURE: XState separates the machine DEFINITION (built once, shared)
 *    from the ACTOR/interpreter (spawned per instance) — its `create` op is the
 *    actor-spawn cost from a shared machine; Pyreon's `createMachine` builds the
 *    reactive instance directly. Reads in XState always go through
 *    `getSnapshot()` (idiomatic) — that cost is included in `can`/`matches`.
 *  - Impl order rotated per round; samples pooled over ${BENCH_ROUNDS:-4}
 *    rounds → median ns/op + seeded bootstrap CI95; CI overlap = 🤝 tie.
 *    A `sink` (written out by every child) defeats DCE. `--quick` = a
 *    correctness/structure smoke with meaningless timings.
 *
 * Both libraries are statechart interpreters; the expected gap is Pyreon's
 * signal-backed transition (~tens of ns) vs XState's interpreter + snapshot
 * machinery. XState does MORE per op (immutable snapshots, actor lifecycle,
 * richer event objects) — flagged where it matters.
 */
process.env.NODE_ENV = 'production'

import { cpus, loadavg } from 'node:os'
import { createMachine as createPyreonMachine } from '../src/index'
import { createActor, createMachine as createXstateMachine } from 'xstate'

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

const cells = runIsolatedCells(OP_ORDER, IMPLS)
const notes: Record<string, string | undefined> = {}
for (const op of OP_ORDER) notes[op] = OPS[op]?.note
printPairTable({
  title: '@pyreon/machine vs XState',
  ops: OP_ORDER,
  cells,
  pyreon: 'pyreon',
  competitor: 'xstate',
  competitorLabel: 'xstate',
  notes,
  opWidth: 20,
})
console.log(
  `\n(verdict = xstate ÷ pyreon median, printed only when the CI95s do NOT overlap. ns is machine-dependent — the ratio is the portable signal.)`,
)
