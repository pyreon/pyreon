#!/usr/bin/env bun
/**
 * The catalogue-app benchmark: bundle bytes, time to interactive and retained
 * memory per arm. Method and definitions: `examples/real-bench/README.md`
 * ("App metrics"). Raw output: `results/README.md`.
 *
 *   bun bench.ts [armId…] [--wait-quiet [L]] [--loads N] [--memory-loads N] [--sessions N] [--throttle mobile|none]
 *   bun bench.ts --report [runId]      re-print a run's tables and its publishability
 *
 * Order of work, for the arms asked for (default: all):
 *  1. each arm's build output and shared files are checked, then the
 *     correctness gate runs on it: no number is taken from an arm that fails;
 *  2. the timer is checked: the run REFUSES to measure on a page that is not
 *     cross-origin isolated or whose `performance.now()` is coarser than 20 µs;
 *  3. bundle inventory (untimed, deterministic);
 *  4. `--loads` rounds of throttled first loads, one per arm per round, the arm
 *     order rotated every round; load average stamped around every round;
 *  5. `--memory-loads` rounds of memory pages, rotated the same way;
 *  6. the files are written and the report printed, ending in PUBLISHABLE
 *     CONDITIONS MET or NOT PUBLISHABLE with every failed condition.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import {
  LoadRecorder,
  loadAvg1,
  parseWaitQuiet,
  waitForQuietMachine,
} from '../../benchmark/machine-load'
import { computeStats, type Stats } from '../src/stats'
import {
  type Arm,
  assertSharedIdentical,
  installedVersions,
  loadArms,
  outDir,
} from './harness/arms'
import { gateArm } from './harness/gate'
import { inventory, measureClockQuantum, memoryPass, timedLoad } from './harness/measure'
import type { ArmResult, Heap } from './harness/result'
import {
  DEFAULT_KNOBS,
  DEFAULT_THROTTLE,
  type Knobs,
  latestRunId,
  MAX_QUANTUM_MS,
  newRunId,
  openRun,
  playwrightVersion,
  pyreonSource,
  readRun,
  runConditions,
  type RunManifest,
  saveArm,
  saveManifest,
  THROTTLE_PROFILES,
  type Throttle,
} from './harness/run'
import { serveStatic, type RunningStatic } from './harness/serve'

const argv = process.argv.slice(2)
const flagValue = (flag: string): string | undefined => {
  const i = argv.indexOf(flag)
  const v = i >= 0 ? argv[i + 1] : undefined
  return v !== undefined && !v.startsWith('--') ? v : undefined
}
const argNum = (flag: string, def: number): number => {
  const n = Number(flagValue(flag))
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : def
}

function rotated<T>(xs: readonly T[], round: number): T[] {
  const k = round % xs.length
  return [...xs.slice(k), ...xs.slice(0, k)]
}

// ─── report ─────────────────────────────────────────────────────────────────

const ms = (x: number) => (x < 10 ? x.toFixed(2) : x.toFixed(1))
const kb = (b: number) => (b / 1024).toFixed(1)
const mb = (b: number) => (b / 1024 / 1024).toFixed(2)
const median = (xs: number[]) => (xs.length === 0 ? Number.NaN : computeStats(xs).median)
const withCi = (s: Stats, f: (x: number) => string) =>
  `${f(s.median)} [${f(s.ci95[0])}–${f(s.ci95[1])}]`

function table(rows: string[][]): void {
  const widths = (rows[0] ?? []).map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)))
  for (const [ri, row] of rows.entries()) {
    console.log(
      row
        .map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0)))
        .join('  │  '),
    )
    if (ri === 0) console.log(widths.map((w) => '─'.repeat(w)).join('──┼──'))
  }
}

function printReport(manifest: RunManifest, arms: ArmResult[]): boolean {
  console.log(
    `\n=== real-bench catalogue app · run ${manifest.runId} · throttle ${manifest.throttle.name} ===`,
  )
  console.log('\nBundle: first load of /products (KB; js and css, gzip -9 / brotli 11; raw)')
  table([
    ['arm', 'js gzip', 'js br', 'js raw', 'css gzip', 'requests', 'build js gzip (all files)'],
    ...arms.map((a) => {
      const t = a.bundle.firstLoadTotals
      return [
        a.id,
        kb(t.js.gzip),
        kb(t.js.brotli),
        kb(t.js.raw),
        kb(t.css.gzip),
        String(a.bundle.firstLoad.length),
        `${kb(a.bundle.build.js.gzip)} (${a.bundle.build.js.files})`,
      ]
    }),
  ])
  console.log(
    '\nTime to interactive, throttled first load (ms from navigation start; median [95% CI])',
  )
  table([
    ['arm', 'n', 'interactive', 'list in DOM', 'FCP', 'load event'],
    ...arms.map((a) => {
      const ok = a.tti.filter((s) => s.ttiMs >= 0)
      return [
        a.id,
        String(ok.length),
        ok.length > 0 ? withCi(computeStats(ok.map((s) => s.ttiMs)), ms) : '—',
        ms(median(ok.map((s) => s.firstRenderMs))),
        ms(median(ok.map((s) => s.fcpMs))),
        ms(median(ok.map((s) => s.loadEventEndMs))),
      ]
    }),
  ])
  console.log(
    '\nRetained JS heap after GC (MB, median over pages; net = minus the blank page on the same server)',
  )
  const net = (a: ArmResult, pick: (s: ArmResult['memory'][number]) => Heap) =>
    mb(median(a.memory.map((s) => pick(s).usedBytes - s.blank.usedBytes)))
  table([
    [
      'arm',
      'pages',
      'blank',
      'after load',
      'net',
      'after 1 session net',
      `after ${manifest.knobs.sessions} sessions net`,
      'DOM nodes after load',
    ],
    ...arms.map((a) => [
      a.id,
      String(a.memory.length),
      mb(median(a.memory.map((s) => s.blank.usedBytes))),
      mb(median(a.memory.map((s) => s.afterLoad.usedBytes))),
      net(a, (s) => s.afterLoad),
      net(a, (s) => s.afterSession),
      net(a, (s) => s.afterSessions),
      String(median(a.memory.map((s) => s.afterLoad.nodes))),
    ]),
  ])
  const conditions = runConditions(manifest, arms)
  console.log('\nRun conditions (results/README.md):')
  for (const c of conditions) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail}`)
  const ok = conditions.every((c) => c.ok)
  console.log(
    ok
      ? '\nPUBLISHABLE CONDITIONS MET for this run. A verdict still needs a second complete run whose intervals agree.'
      : '\nNOT PUBLISHABLE: the conditions marked ✗ fail. Quote no number from this run.',
  )
  return ok
}

// ─── measure ────────────────────────────────────────────────────────────────

async function measure(): Promise<void> {
  const valueFlags = new Set(['--loads', '--memory-loads', '--sessions', '--throttle'])
  const ids = argv.filter((a, i) => {
    const prev = argv[i - 1] ?? ''
    if (a.startsWith('--') || valueFlags.has(prev)) return false
    return !(prev === '--wait-quiet' && Number.isFinite(Number(a)))
  })
  const arms = loadArms(ids)
  const knobs: Knobs = {
    loads: argNum('--loads', DEFAULT_KNOBS.loads),
    memoryLoads: argNum('--memory-loads', DEFAULT_KNOBS.memoryLoads),
    sessions: argNum('--sessions', DEFAULT_KNOBS.sessions),
  }
  const throttleName = flagValue('--throttle') ?? DEFAULT_THROTTLE.name
  const throttle: Throttle | undefined =
    THROTTLE_PROFILES[throttleName as keyof typeof THROTTLE_PROFILES]
  if (!throttle)
    throw new Error(
      `[real-bench/app] --throttle ${throttleName}: expected ${Object.keys(THROTTLE_PROFILES).join(' or ')}`,
    )
  const waitQuiet = parseWaitQuiet(argv)
  const load = new LoadRecorder('real-bench/app', waitQuiet)

  const servers = new Map<string, RunningStatic>()
  const browser = await chromium.launch()
  try {
    // 1. build output, shared files, correctness gate
    for (const arm of arms) {
      assertSharedIdentical(arm)
      const srv = await serveStatic(outDir(arm), arm.m.fallback)
      servers.set(arm.m.id, srv)
      const failures = await gateArm(browser, srv.base)
      if (failures.length > 0) {
        throw new Error(
          `[real-bench/app] ${arm.m.id} fails the correctness gate; nothing is measured:\n  ${failures.slice(0, 5).join('\n  ')}`,
        )
      }
      console.log(`[real-bench/app] ✓ ${arm.m.id} passes the correctness gate`)
    }
    const base = (arm: Arm) => (servers.get(arm.m.id) as RunningStatic).base

    // 2. timer: refuse a coarse clock
    const timer = await measureClockQuantum(browser, base(arms[0] as Arm))
    console.log(
      `[real-bench/app] timer: crossOriginIsolated=${timer.crossOriginIsolated} · quantum ${(timer.quantumMs * 1000).toFixed(1)} µs`,
    )
    if (!timer.crossOriginIsolated || timer.quantumMs > MAX_QUANTUM_MS) {
      throw new Error(
        '[real-bench/app] REFUSING to measure: the page is not cross-origin isolated or the timer is coarser than 20 µs.',
      )
    }

    load.printIdentity()
    const manifest = openRun({
      runId: process.env.REAL_BENCH_RUN_ID ?? newRunId(),
      tools: {
        bun: process.versions.bun ?? 'unknown',
        chromium: browser.version(),
        playwright: playwrightVersion(),
      },
      knobs,
      throttle,
      timer,
      waitQuiet,
      pyreonSource: arms.some((a) => a.m.id === 'pyreon') ? pyreonSource() : null,
      order: arms.map((a) => a.m.id),
    })
    console.log(`[real-bench/app] run ${manifest.runId} → results/${manifest.runId}/`)
    const stamp = async (label: string) => {
      if (waitQuiet !== null && loadAvg1() > waitQuiet)
        await waitForQuietMachine('real-bench/app', waitQuiet)
      manifest.loadStamps.push(load.stamp(label))
    }

    const results = new Map<string, ArmResult>()
    // 3. bundle
    for (const arm of arms) {
      results.set(arm.m.id, {
        schema: 1,
        runId: manifest.runId,
        id: arm.m.id,
        label: arm.m.label,
        router: arm.m.router,
        state: arm.m.state,
        codeSplitting: arm.m.codeSplitting,
        notes: arm.m.notes,
        docs: arm.m.docs,
        versions: installedVersions(arm),
        bundle: await inventory(browser, base(arm), arm),
        tti: [],
        memory: [],
      })
    }
    // 4. time to interactive
    for (let round = 0; round < knobs.loads; round++) {
      await stamp(`tti round ${round + 1}/${knobs.loads} start`)
      for (const arm of rotated(arms, round)) {
        ;(results.get(arm.m.id) as ArmResult).tti.push(
          await timedLoad(browser, base(arm), throttle),
        )
      }
    }
    await stamp('tti end')
    // 5. memory
    for (let round = 0; round < knobs.memoryLoads; round++) {
      await stamp(`memory round ${round + 1}/${knobs.memoryLoads} start`)
      for (const arm of rotated(arms, round)) {
        ;(results.get(arm.m.id) as ArmResult).memory.push(
          await memoryPass(browser, base(arm), knobs.sessions),
        )
      }
    }
    await stamp('memory end')
    // 6. write + report
    for (const r of results.values()) saveArm(manifest, r)
    manifest.finishedAt = new Date().toISOString()
    saveManifest(manifest)
    printReport(manifest, [...results.values()])
  } finally {
    await browser.close()
    for (const s of servers.values()) await s.stop()
  }
}

async function main(): Promise<void> {
  if (argv.includes('--report')) {
    const runId = flagValue('--report') ?? latestRunId()
    if (!runId) throw new Error('[real-bench/app] no run in results/; run `bun bench.ts` first')
    const { manifest, arms } = readRun(runId)
    printReport(manifest, arms)
    return
  }
  // The arms' lockfiles are what a published run measured; fail early when one is missing.
  for (const arm of loadArms()) readFileSync(`${arm.dir}/package-lock.json`)
  await measure()
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
