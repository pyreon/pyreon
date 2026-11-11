/**
 * Shared harness for the multi-library head-to-heads in
 * `packages/fundamentals/<pkg>/bench/*-rivals.ts` (bun / JavaScriptCore).
 *
 * One bench file declares its arms (Pyreon + every rival), its ops and a
 * correctness gate, then calls `runRivalBench`. The same file is re-entered as a
 * child process for every timed cell.
 *
 * Measurement contract (see `.agents/guides/benchmarks/` for why each exists):
 *  - ONE fresh `bun` process per (op × arm × round). Only that arm's fixture is
 *    built, warmed and timed in it, so no arm runs after another's JIT or heap
 *    debt. Arm order is rotated per round and per op.
 *  - Every child is spawned with `NODE_ENV=production` in its environment, so
 *    production builds are selected at module init (ESM hoists imports above
 *    any in-file assignment; the env var is what makes this sound). The
 *    orchestrator re-executes itself under production when started without it.
 *  - CI95 is the CLUSTER bootstrap over processes
 *    (`examples/benchmark/cluster-bootstrap.ts`): samples from one process share
 *    its JIT tiering and heap layout, so the processes are the independent
 *    draws. With fewer than 3 rounds the interval cannot carry
 *    process-to-process variance and the run says so.
 *  - The correctness gate runs before any timing and throws on a mismatch. Each
 *    bench's gate must be able to fail a no-op arm (compare returned values or
 *    DOM read-back, not "did not throw").
 *  - A module-level `sink` in each bench defeats dead-code elimination; it is
 *    written to the child's stdout.
 *  - No forced GC (JSC jettisons compiled code on `Bun.gc(true)`).
 *  - Installed versions are read from each package.json at run time, never
 *    hard-coded.
 *
 * Verdict per op: Pyreon against the BEST ranking rival (lowest median).
 * `ratio` = rival median ÷ Pyreon median (> 1 means Pyreon is faster). A win or
 * loss needs disjoint CI95s; overlap is a tie. One run is FIRST-PASS: a published
 * verdict needs two runs with disjoint CIs on a quiet machine.
 */
import { createRequire } from 'node:module'
import { cpus, loadavg, totalmem } from 'node:os'
import { clusterBootstrapCI95, medianOf } from '../../examples/benchmark/cluster-bootstrap'

declare const Bun: {
  version: string
  spawnSync: (
    cmd: string[],
    opts: {
      env: Record<string, string | undefined>
      stdout?: 'pipe' | 'inherit'
      stderr?: 'pipe' | 'inherit'
    },
  ) => { stdout: Uint8Array; stderr: Uint8Array; exitCode: number }
}

export interface Arm<I extends string> {
  id: I
  /** Display name. */
  label: string
  /** npm package whose installed version is printed (omit for Pyreon). */
  pkg?: string
  /** `false` = shown but never the "best rival" (a floor or a diagnostic). */
  ranking?: boolean
}

export type ArmFn = () => void | Promise<void>

export interface OpSpec<I extends string> {
  note?: string
  /** Arms that have no fair equivalent for this op, with the reason. */
  skip?: Partial<Record<I, string>>
  /** Timed calls per window (default 20,000). */
  iters?: number
  /** Windows per process (default 11). */
  runs?: number
  /** Untimed warm-up calls per process (default 2,000). */
  warmup?: number
  /** Each call does this many items of work; samples are reported per item. */
  divide?: number
  /** `true` when arm functions return a promise that must settle per call. */
  async?: boolean
  /** Builds the per-arm functions. Called once per child, in the child only. */
  make: (arm: I) => ArmFn | Promise<ArmFn>
}

export interface RivalBench<I extends string> {
  title: string
  /** `import.meta.path` of the bench file (re-entered as the child). */
  file: string
  pyreon: I
  arms: readonly Arm<I>[]
  ops: Record<string, OpSpec<I>>
  /** Throws on any mismatch. Runs once, in the orchestrator, before timing. */
  gate: () => void | Promise<void>
  /** Printed under the table. */
  footnotes?: readonly string[]
  /** Per-op unit label (default ns/op). */
  unit?: string
  /** Read the current `sink` (written to the child's stdout). */
  sink: () => unknown
}

const QUICK = process.argv.includes('--quick') || process.env.BENCH_QUICK === '1'
const ROUNDS = QUICK ? 1 : Number(process.env.BENCH_ROUNDS ?? 5)
const now = (): number => Number(process.hrtime.bigint())

interface Cell {
  median: number
  ci: [number, number]
  processes: number
}

function fmt(n: number): string {
  if (n >= 100_000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n >= 100) return n.toFixed(0)
  if (n >= 10) return n.toFixed(1)
  return n.toFixed(2)
}
const fmtCell = (c: Cell): string => `${fmt(c.median)} [${fmt(c.ci[0])}–${fmt(c.ci[1])}]`
const disjoint = (a: Cell, b: Cell): boolean => a.ci[1] < b.ci[0] || b.ci[1] < a.ci[0]

function banner(): string {
  const load = loadavg()
    .map((l) => l.toFixed(2))
    .join(' ')
  const ram = `${Math.round(totalmem() / 2 ** 30)} GiB`
  return `bun ${Bun.version} (JavaScriptCore) · ${process.platform}/${process.arch} · ${cpus()[0]?.model ?? 'cpu?'} · ${ram} · loadavg ${load} · NODE_ENV=${process.env.NODE_ENV}`
}

function versionOf(file: string, pkg: string): string {
  try {
    return (createRequire(file)(`${pkg}/package.json`) as { version: string }).version
  } catch {
    return '?'
  }
}

async function measure(spec: OpSpec<string>, fn: ArmFn): Promise<number[]> {
  const warmup = QUICK ? Math.min(50, spec.warmup ?? 2_000) : (spec.warmup ?? 2_000)
  const iters = QUICK ? Math.min(200, spec.iters ?? 20_000) : (spec.iters ?? 20_000)
  const runs = QUICK ? Math.min(3, spec.runs ?? 11) : (spec.runs ?? 11)
  const per = iters * (spec.divide ?? 1)
  const samples: number[] = []
  if (spec.async) {
    for (let i = 0; i < warmup; i++) await fn()
    for (let r = 0; r < runs; r++) {
      const t0 = now()
      for (let i = 0; i < iters; i++) await fn()
      samples.push((now() - t0) / per)
    }
  } else {
    const f = fn as () => void
    for (let i = 0; i < warmup; i++) f()
    for (let r = 0; r < runs; r++) {
      const t0 = now()
      for (let i = 0; i < iters; i++) f()
      samples.push((now() - t0) / per)
    }
  }
  return samples
}

export async function runRivalBench<I extends string>(cfg: RivalBench<I>): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))

  // ── child: time ONE (op, arm) cell ───────────────────────────────────────
  if (args[0] === 'cell') {
    const [, op, arm] = args
    const spec = op ? cfg.ops[op] : undefined
    if (!spec || !arm) throw new Error(`[rivals-harness] unknown cell ${op} / ${arm}`)
    const fn = await spec.make(arm as I)
    const samples = await measure(spec as OpSpec<string>, fn)
    process.stdout.write(JSON.stringify({ samples, sink: String(cfg.sink()) }))
    process.exit(0)
  }

  // ── orchestrator ─────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const r = Bun.spawnSync([process.execPath, cfg.file, ...process.argv.slice(2)], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdout: 'inherit',
      stderr: 'inherit',
    })
    process.exit(r.exitCode)
  }

  const started = Date.now()
  console.log(`=== ${cfg.title} ===`)
  console.log(banner())
  console.log(
    `versions: ${cfg.arms
      .filter((a) => a.pkg)
      .map((a) => `${a.label} = ${a.pkg}@${versionOf(cfg.file, a.pkg as string)}`)
      .join(' · ')}`,
  )
  console.log(
    `${ROUNDS} round(s) × one fresh process per (op × arm), arm order rotated · median ${cfg.unit ?? 'ns/op'} [cluster-bootstrap CI95 over processes]${QUICK ? ' · --quick: TIMINGS MEANINGLESS' : ''}${ROUNDS < 3 && !QUICK ? ' · <3 rounds: CI cannot carry process variance' : ''}\n`,
  )

  await cfg.gate()
  console.log('✓ correctness gate passed\n')
  if (process.env.BENCH_GATE_ONLY === '1') return

  const opNames = Object.keys(cfg.ops)
  const clusters: Record<string, Partial<Record<I, number[][]>>> = {}
  for (const op of opNames) clusters[op] = {}

  for (let round = 0; round < ROUNDS; round++) {
    opNames.forEach((op, opIndex) => {
      const spec = cfg.ops[op] as OpSpec<I>
      const arms = cfg.arms.filter((a) => !spec.skip?.[a.id]).map((a) => a.id)
      const k = (round + opIndex) % arms.length
      const order = [...arms.slice(k), ...arms.slice(0, k)]
      for (const arm of order) {
        const proc = Bun.spawnSync(
          [process.execPath, cfg.file, 'cell', op, arm, ...(QUICK ? ['--quick'] : [])],
          { env: { ...process.env, NODE_ENV: 'production' } },
        )
        if (proc.exitCode !== 0) {
          throw new Error(
            `[rivals-harness] child failed (op "${op}", arm "${arm}"):\n${new TextDecoder().decode(proc.stderr)}`,
          )
        }
        const out = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
        const list = (clusters[op]![arm] ??= [])
        list.push(out.samples)
      }
    })
  }

  const label = (id: I): string => cfg.arms.find((a) => a.id === id)?.label ?? id
  const summary: string[] = []
  for (const op of opNames) {
    const spec = cfg.ops[op] as OpSpec<I>
    const cells = new Map<I, Cell>()
    for (const a of cfg.arms) {
      const cl = clusters[op]![a.id]
      if (!cl) continue
      cells.set(a.id, {
        median: medianOf(cl.flat()),
        ci: clusterBootstrapCI95(cl, { resamples: 1500 }),
        processes: cl.length,
      })
    }
    const p = cells.get(cfg.pyreon)
    console.log(`── ${op}${spec.note ? `\n   ${spec.note}` : ''}`)
    const sorted = [...cells.entries()].sort((x, y) => x[1].median - y[1].median)
    for (const [id, c] of sorted) {
      const arm = cfg.arms.find((a) => a.id === id)
      const floor = arm?.ranking === false ? ' (floor, non-ranking)' : ''
      let rel = ''
      if (p && id !== cfg.pyreon) {
        const r = c.median / p.median
        rel = disjoint(p, c)
          ? r >= 1
            ? `Pyreon ${r.toFixed(2)}× faster`
            : `Pyreon ${(1 / r).toFixed(2)}× SLOWER`
          : `🤝 tie (${r.toFixed(2)}×)`
      }
      console.log(`   ${(label(id) + floor).padEnd(34)} ${fmtCell(c).padStart(26)}  ${rel}`)
    }
    for (const [id, why] of Object.entries(spec.skip ?? {}) as [I, string][]) {
      console.log(`   ${label(id).padEnd(34)} ${'skipped'.padStart(26)}  ${why}`)
    }
    const rivals = sorted.filter(
      ([id]) => id !== cfg.pyreon && cfg.arms.find((a) => a.id === id)?.ranking !== false,
    )
    const best = rivals[0]
    if (p && best) {
      const [bid, bc] = best
      const r = bc.median / p.median
      const dj = disjoint(p, bc)
      const verdict = !dj ? 'tie' : r >= 1 ? 'win' : 'loss'
      console.log(`   verdict vs best rival (${label(bid)}): ${verdict} · ratio ${r.toFixed(2)}× · CI-disjoint ${dj ? 'yes' : 'no'}\n`)
      summary.push(
        `| ${op} | ${fmtCell(p)} | ${label(bid)} | ${fmtCell(bc)} | ${r.toFixed(2)}× | ${dj ? 'yes' : 'no'} | ${verdict} |`,
      )
    } else {
      console.log('')
    }
  }

  console.log(`summary (${cfg.unit ?? 'ns/op'}; ratio = best rival ÷ Pyreon, > 1 = Pyreon faster)`)
  console.log('| op | Pyreon | best rival | rival | ratio | CI-disjoint | verdict |')
  console.log('| --- | ---: | --- | ---: | ---: | :---: | --- |')
  for (const line of summary) console.log(line)
  for (const f of cfg.footnotes ?? []) console.log(`\n${f}`)
  console.log(
    `\nwall ${((Date.now() - started) / 1000).toFixed(1)} s · loadavg at end ${loadavg()
      .map((l) => l.toFixed(2))
      .join(' ')}`,
  )
}
