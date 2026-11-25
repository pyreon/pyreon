#!/usr/bin/env bun
/**
 * Interleaved, load-gated A/B runner — the one implementation of the protocol
 * in `.agents/guides/benchmarks/README.md` ("Interleaved A/B runner").
 *
 *   bun scripts/bench/ab/run.ts <jobs.json> [--out DIR] [--deadline SPEC]
 *     [--max-load 4] [--quiet-for 30] [--attempts 3] [--yield 5]
 *     --lock PATH (or PYREON_BENCH_LOCK) [--foreign-pattern REGEX]… [--dry-run]
 *
 * What it does, in order:
 *  1. Validates the jobs file and expands the schedule (runs → passes → jobs →
 *     arms, arm order rotated every pass).
 *  2. Preflight, under the lock: runs each arm's `build` (if any), hashes each
 *     arm's built `entry` files and REFUSES to start when two arms hash the
 *     same (the classic broken A/B: `examples/benchmark` reads reactivity /
 *     core / runtime-dom from `src/` and only the compiler from `lib/`, so
 *     swapping `lib/` alone builds identical bundles).
 *  3. For each scheduled job: waits until the lock is free and the 1-minute
 *     load has stayed below `--max-load` for `--quiet-for` seconds, takes the
 *     lock atomically, runs the command with `NODE_ENV=production`, samples
 *     the load every second and the process table every 5 s (and both at the
 *     start and the end), releases the
 *     lock, re-hashes the arm's entry, and writes a structured attempt record.
 *     An INVALID attempt is retried up to `--attempts` times.
 *  4. Stops starting work at the absolute `--deadline`.
 *
 * Results (in `--out`, default `bench-ab-results/<name>` under the cwd):
 *   manifest.json                       jobs file, schedule, arm hashes, settings
 *   <id>.a<k>.json                      attempt record (status, reasons, load trace, …)
 *   <id>.a<k>.log                       the command's stdout + stderr
 *   <id>.a<k>.data.json                 what the command wrote to {out}
 *   queue.log                           one line per event
 * Analyze with `bun scripts/bench/ab/analyze.ts <out>`.
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  appendFileSync,
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { hostname, loadavg } from 'node:os'
import { join, resolve } from 'node:path'
import {
  DEFAULT_FOREIGN_PATTERNS,
  MIN_SAMPLE_INTERVAL_MS,
  expandSchedule,
  foreignProcesses,
  hashFiles,
  identicalArms,
  type JobsFile,
  type LoadSample,
  type LockFs,
  parsePs,
  pastDeadline,
  quietSince,
  releaseLock,
  renderCommand,
  resolveDeadline,
  runInvalidReasons,
  tryAcquireLock,
  validateJobsFile,
} from './lib.ts'

// ─── Arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
const flags = (name: string): string[] =>
  argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1] as string] : []))
const jobsPath = argv.find(
  (a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1]?.startsWith('--')),
)
if (!jobsPath) {
  console.error(
    'usage: bun scripts/bench/ab/run.ts <jobs.json> [--out DIR] [--deadline +6h|HH:MM|ISO] [--max-load 4] …',
  )
  process.exit(2)
}
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8')) as JobsFile
const problems = validateJobsFile(jobs)
if (problems.length > 0) {
  for (const p of problems) console.error(`[bench-ab] jobs file: ${p}`)
  process.exit(2)
}
const OUT = resolve(flag('--out') ?? join('bench-ab-results', jobs.name))
const MAX_LOAD = Number(flag('--max-load') ?? 4)
const QUIET_MS = Number(flag('--quiet-for') ?? 30) * 1000
const ATTEMPTS = Number(flag('--attempts') ?? 3)
const YIELD_MS = Number(flag('--yield') ?? 5) * 1000
const lockArg = flag('--lock') ?? process.env.PYREON_BENCH_LOCK
if (!lockArg) {
  console.error(
    '[bench-ab] pass --lock PATH (or PYREON_BENCH_LOCK): the lock file every timing session on this machine shares',
  )
  process.exit(2)
}
const LOCK = resolve(lockArg)
const FOREIGN = [...DEFAULT_FOREIGN_PATTERNS, ...flags('--foreign-pattern')]
const DRY = argv.includes('--dry-run')
const startedAt = new Date()
const deadlineSpec = flag('--deadline')
const DEADLINE = deadlineSpec ? resolveDeadline(deadlineSpec, startedAt) : null
for (const [k, v] of [
  ['--max-load', MAX_LOAD],
  ['--quiet-for', QUIET_MS],
  ['--attempts', ATTEMPTS],
  ['--yield', YIELD_MS],
] as const) {
  if (!Number.isFinite(v) || v < 0) {
    console.error(`[bench-ab] ${k} must be a non-negative number`)
    process.exit(2)
  }
}

mkdirSync(OUT, { recursive: true })
const QLOG = join(OUT, 'queue.log')
function log(msg: string): void {
  const line = `${new Date().toISOString()} ${msg}`
  console.log(line)
  appendFileSync(QLOG, `${line}\n`)
}

// ─── Lock ────────────────────────────────────────────────────────────────────

const lockFs: LockFs = {
  createExclusive(path, content) {
    const fd = openSync(path, 'wx', 0o644)
    try {
      writeSync(fd, content)
    } finally {
      closeSync(fd)
    }
  },
  read: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
  identity(path) {
    try {
      const s = statSync(path)
      return `${s.dev}:${s.ino}`
    } catch {
      return null
    }
  },
  rename: renameSync,
  link: linkSync,
  unlink: unlinkSync,
}
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: the process exists but belongs to someone else — alive.
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}
const LOCK_CONTENT = `bench-ab:${jobs.name} ${process.pid}\n${JSON.stringify({
  pid: process.pid,
  host: hostname(),
  startedAt: startedAt.toISOString(),
  jobs: resolve(jobsPath),
  token: randomBytes(8).toString('hex'),
})}\n`
let lockHeld = false
function release(): void {
  if (lockHeld) {
    releaseLock(lockFs, LOCK, LOCK_CONTENT)
    lockHeld = false
  }
}
process.on('exit', release)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    release()
    process.exit(130)
  })
}

// ─── Sampling ────────────────────────────────────────────────────────────────

/** Every load sample this runner has taken, for the quiet-stretch rule. */
const history: LoadSample[] = []
function sampleLoad(): LoadSample {
  const s = { t: Date.now(), load1: loadavg()[0] as number }
  history.push(s)
  if (history.length > 10_000) history.splice(0, history.length - 5_000)
  return s
}
function foreignNow(): string[] {
  const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return foreignProcesses(parsePs(ps.stdout ?? ''), process.pid, FOREIGN)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** The process-table scan (`ps`, ~20–50 ms of CPU) runs every PS_EVERY load samples. */
const PS_EVERY = 5

// ─── Arm identity ────────────────────────────────────────────────────────────

function entryHash(arm: string): string | null {
  const spec = jobs.arms[arm]!
  const files: { path: string; content: Uint8Array }[] = []
  for (const pattern of spec.entry) {
    for (const rel of new Bun.Glob(pattern).scanSync({ cwd: spec.dir, onlyFiles: true })) {
      files.push({ path: rel, content: readFileSync(join(spec.dir, rel)) })
    }
  }
  return files.length === 0 ? null : hashFiles(files)
}

function runShell(command: string, cwd: string, logPath: string): Promise<number | null> {
  return new Promise((done) => {
    const fd = openSync(logPath, 'a')
    const child = spawn('/bin/bash', ['-c', command], {
      cwd,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', fd, fd],
    })
    child.on('exit', (code) => {
      closeSync(fd)
      done(code)
    })
    child.on('error', (err) => {
      appendFileSync(logPath, `\n[bench-ab] spawn failed: ${String(err)}\n`)
      closeSync(fd)
      done(null)
    })
  })
}

// ─── Lock acquisition with the quiet-stretch gate ────────────────────────────

async function acquireWhenQuiet(what: string): Promise<boolean> {
  let lastNote = 0
  for (;;) {
    if (pastDeadline(DEADLINE, Date.now())) {
      log(`DEADLINE reached — not starting ${what}`)
      return false
    }
    sampleLoad()
    const since = quietSince(history, MAX_LOAD)
    if (since !== null && Date.now() - since >= QUIET_MS) {
      const r = tryAcquireLock(lockFs, LOCK, LOCK_CONTENT, pidAlive, `${process.pid}-${Date.now()}`)
      if (r.acquired) {
        lockHeld = true
        if (r.reclaimed)
          log(`reclaimed a stale lock (its pid is dead): ${r.reclaimed.content.split('\n')[0]}`)
        return true
      }
      if (Date.now() - lastNote > 60_000) {
        log(`waiting for ${what}: lock ${r.reason} by "${r.holder.split('\n')[0]}"`)
        lastNote = Date.now()
      }
    } else if (Date.now() - lastNote > 60_000) {
      const cur = history[history.length - 1]!.load1
      log(
        `waiting for ${what}: load1 ${cur.toFixed(2)}, quiet for ${since === null ? 0 : Math.round((Date.now() - since) / 1000)} s of ${QUIET_MS / 1000} s`,
      )
      lastNote = Date.now()
    }
    await sleep(MIN_SAMPLE_INTERVAL_MS)
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const schedule = expandSchedule(jobs)
log(
  `START ${jobs.name}: ${schedule.length} jobs (${Object.keys(jobs.arms).join(' vs ')}, ${jobs.runs ?? 2} runs × ${jobs.passes ?? 5} passes × ${jobs.jobs.length} job(s)), ` +
    `max load ${MAX_LOAD}, quiet ${QUIET_MS / 1000} s, attempts ${ATTEMPTS}, deadline ${DEADLINE === null ? 'none' : new Date(DEADLINE).toString()}, lock ${LOCK}`,
)
if (DRY) {
  for (const s of schedule) console.log(`  ${s.id}`)
  process.exit(0)
}

if (!(await acquireWhenQuiet('preflight'))) process.exit(0)
const hashes: Record<string, string> = {}
try {
  for (const [arm, spec] of Object.entries(jobs.arms)) {
    if (spec.build) {
      const logPath = join(OUT, `preflight-${arm}.log`)
      log(`preflight build ${arm}: ${spec.build.command}`)
      const code = await runShell(
        spec.build.command,
        resolve(spec.dir, spec.build.cwd ?? '.'),
        logPath,
      )
      if (code !== 0)
        throw new Error(`[bench-ab] preflight build of arm ${arm} exited ${code} (see ${logPath})`)
    }
    const h = entryHash(arm)
    if (h === null) {
      throw new Error(
        `[bench-ab] arm ${arm}: no file matches ${spec.entry.join(', ')} in ${spec.dir} — build it first or add "build"`,
      )
    }
    hashes[arm] = h
    log(`arm ${arm}: entry hash ${h} (${spec.dir})`)
  }
} finally {
  release()
}
const same = identicalArms(hashes)
if (same.length > 0) {
  log(
    `REFUSING to time: arms ${same.map((g) => g.join(' = ')).join('; ')} have identical built entries. ` +
      'examples/benchmark reads reactivity/core/runtime-dom from src/ (only the compiler from lib/): each arm needs its own worktree at its own ref.',
  )
  process.exit(1)
}
writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      jobs,
      jobsFile: resolve(jobsPath),
      schedule,
      hashes,
      startedAt: startedAt.toISOString(),
      deadline: DEADLINE === null ? null : new Date(DEADLINE).toISOString(),
      settings: {
        maxLoad: MAX_LOAD,
        quietMs: QUIET_MS,
        attempts: ATTEMPTS,
        yieldMs: YIELD_MS,
        lock: LOCK,
        foreign: FOREIGN,
      },
    },
    null,
    2,
  ),
)

let valid = 0
let gaveUp = 0
outer: for (const s of schedule) {
  const job = jobs.jobs.find((j) => j.label === s.job)!
  const arm = jobs.arms[s.arm]!
  for (let attempt = 1; ; attempt++) {
    if (attempt > ATTEMPTS) {
      log(`GAVE UP ${s.id} after ${ATTEMPTS} attempts`)
      gaveUp++
      break
    }
    if (!(await acquireWhenQuiet(s.id))) break outer
    const base = join(OUT, `${s.id}.a${attempt}`)
    const out = `${base}.data.json`
    const cwd = resolve(arm.dir, job.cwd ?? '.')
    const command = renderCommand(job.command, { out, pass: s.pass, run: s.run, arm: s.arm })
    const samples: LoadSample[] = []
    const foreign: string[] = []
    const t0 = Date.now()
    samples.push(sampleLoad())
    foreign.push(...foreignNow())
    let tick = 0
    const timer = setInterval(() => {
      samples.push(sampleLoad())
      if (++tick % PS_EVERY === 0) foreign.push(...foreignNow())
    }, MIN_SAMPLE_INTERVAL_MS)
    let exitCode: number | null
    try {
      writeFileSync(`${base}.log`, `$ (cd ${cwd} && ${command})\n`)
      exitCode = await runShell(command, cwd, `${base}.log`)
    } finally {
      clearInterval(timer)
    }
    const t1 = Date.now()
    samples.push(sampleLoad())
    foreign.push(...foreignNow())
    release()
    const after = entryHash(s.arm)
    const reasons = runInvalidReasons({
      startedAt: t0,
      endedAt: t1,
      exitCode,
      samples,
      maxLoad: MAX_LOAD,
      foreign,
      expectedEntryHash: hashes[s.arm]!,
      entryHashAfter: after,
    })
    if (exitCode === 0 && !existsSync(out)) reasons.push('no-output-written')
    const status = reasons.length === 0 ? 'VALID' : 'INVALID'
    writeFileSync(
      `${base}.json`,
      JSON.stringify(
        {
          ...s,
          attempt,
          status,
          reasons,
          command,
          cwd,
          startedAt: new Date(t0).toISOString(),
          endedAt: new Date(t1).toISOString(),
          durationMs: t1 - t0,
          exitCode,
          entryHash: after,
          expectedEntryHash: hashes[s.arm],
          maxLoad: MAX_LOAD,
          peakLoad1: Math.max(...samples.map((x) => x.load1)),
          loadTrace: samples,
          foreign: [...new Set(foreign)],
          data: existsSync(out) ? out : null,
        },
        null,
        2,
      ),
    )
    log(
      `${s.id}.a${attempt} ${status}${reasons.length ? ` (${reasons.join(', ')})` : ''} in ${((t1 - t0) / 1000).toFixed(1)} s, peak load1 ${Math.max(...samples.map((x) => x.load1)).toFixed(2)}`,
    )
    if (YIELD_MS > 0) await sleep(YIELD_MS)
    if (status === 'VALID') {
      valid++
      break
    }
  }
}
log(
  `DONE ${jobs.name}: ${valid}/${schedule.length} valid, ${gaveUp} gave up. Analyze: bun scripts/bench/ab/analyze.ts ${OUT}`,
)
