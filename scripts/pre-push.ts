#!/usr/bin/env bun
/**
 * The pre-push hook's runner: plan → checks, under ONE wall-clock cap.
 *
 * `.githooks/pre-push` only handles the bypass and git's environment, then
 * execs this. The plan (what each changed path can break) lives in
 * `scripts/pre-push-plan.ts`; this file decides order, time and the lock.
 *
 * ## Why a cap, and why it fails OPEN
 *
 * On 2026-11-10 a one-file change to `scripts/bundle-budgets.json` ran the
 * whole workspace test wall (7200 s budget) behind a repository-wide lock, so
 * one push blocked every other worktree for 25+ minutes and every contributor
 * started pushing with `PYREON_SKIP_PRE_PUSH=1` — which also skipped the cheap
 * gates that catch most CI failures. A hook that is skipped protects nothing.
 *
 * So the whole run (lock wait included) is bounded by `capSec` (default
 * `DEFAULT_CAP_SEC`). Checks run cheapest and most likely first —
 * validate-fast, then the directly changed packages' typecheck and tests, then
 * native toolchain suites — so the cap drops the slow tail. When the cap
 * is reached the hook stops the running check, prints every check it did NOT
 * run and lets the push through (exit 0). Every one of those checks runs in CI
 * behind a required check, so failing open costs at most a CI round trip,
 * while failing closed on a clock is what taught everyone to skip the hook.
 * A check that FAILS still blocks the push.
 *
 * A check whose last recorded duration exceeds the time left is not started
 * (it could only be killed at the cap); it is listed as not checked.
 *
 * ## The lock
 *
 * Concurrent typecheck/test runs from several worktrees exhausted vitest and
 * kotlinc workers and raced over shared scratch paths, so the CPU-heavy part
 * (typecheck and tests) still runs under one lock per repository
 * (`<git common dir>/pyreon-pre-push.lock`). validate-fast and the lockfile
 * check run outside it. A push that finds the lock held WAITS (inside
 * its own cap) and says who holds it, on which branch, doing what, for how
 * long. Because every holder is capped too, a wait is bounded by the cap.
 *
 * ## Environment
 *
 *   PYREON_PRE_PUSH_CAP_SEC=300   total wall-clock cap (PYREON_PRE_PUSH_TIMEOUT_SEC is an alias)
 *   PYREON_PRE_PUSH_NO_CACHE=1    ignore recorded passes for this push
 *   PYREON_PRE_PUSH_BASE=<rev>    diff base (default origin/main)
 *   PYREON_SKIP_PRE_PUSH=1        skip the hook (handled in .githooks/pre-push)
 *
 * `bun scripts/pre-push.ts --cache-dir="$(git rev-parse --git-common-dir)" --plan-only`
 * prints the checks and their commands without running them.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gitChangedFiles, SCRIPT_TEST_PACKAGE } from './affected'
import {
  computePassKeys,
  computePlan,
  detectKotlinHome,
  discoverWithScripts,
  entryKey,
  gitFiles,
  type Group,
  type PassCache,
  type Plan,
  parseCache,
  readCacheFile,
  readTargetingSources,
  recordPasses,
  type WorkspaceInfo,
  writeCacheFile,
} from './pre-push-plan'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * Measured 2026-11-10 on the shared dev Mac (load 10–80): validate-fast 10–36 s,
 * the full `@pyreon/test-utils` suite 38 s, the largest web package suites
 * 8–22 s; whole example pushes 12–40 s. 300 s is ~7x a typical push and
 * leaves room for validate-fast under load (148–211 s measured at load
 * 20–333). It is also kept short for a reason outside this machine: git opens
 * the SSH connection BEFORE the hook runs and leaves it idle, and GitHub drops
 * an idle session after some minutes — a 20-minute hook once failed the very
 * push it had just validated. The exact idle window was not measured.
 */
export const DEFAULT_CAP_SEC = 300
/** A check is not started with less time than this left. */
export const MIN_STEP_MS = 10_000
/** How often a waiting push repeats who holds the lock. */
export const LOCK_REPORT_EVERY_MS = 30_000

export const LOCK_DIR_NAME = 'pyreon-pre-push.lock'
export const DURATIONS_FILE = 'pyreon-pre-push-durations.json'
export const DURATIONS_MAX_ENTRIES = 500
export const DURATIONS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// ── Steps ──────────────────────────────────────────────────────────────────

export interface Step {
  id: string
  label: string
  argv: string[]
  cwd?: string
  env?: Record<string, string>
  /** Runs under the repository lock (the CPU-heavy part). */
  locked: boolean
  /** Pass-cache entries recorded when the step passes. */
  passes: string[]
  /** Learned-duration key; steps without one are always attempted. */
  durationKey?: string
  /** Set when the step cannot run here at all (a missing toolchain); listed as not checked. */
  unavailable?: string
}

export type Outcome = { kind: 'pass' | 'fail' | 'timeout'; ms: number }

export interface RunDeps {
  now(): number
  exec(step: Step, budgetMs: number): Promise<Outcome>
  /** Last recorded duration of a step, if any. */
  estimateMs(step: Step): number | undefined
  acquireLock(budgetMs: number): Promise<{ ok: true } | { ok: false; reason: string }>
  releaseLock(): void
  onStepDone(step: Step, outcome: Outcome): void
  log(line: string): void
}

export interface RunResult {
  exitCode: 0 | 1
  passed: Step[]
  unchecked: Array<{ step: Step; why: string }>
  failed: Step | null
}

const secs = (ms: number) => `${Math.round(ms / 1000)}s`

/**
 * Run `steps` in order within `capMs` of wall clock (the lock wait included).
 * Pure over `deps`, so the cap and lock policy are tested with a fake clock.
 */
export async function runSteps(steps: readonly Step[], capMs: number, deps: RunDeps): Promise<RunResult> {
  const deadline = deps.now() + capMs
  const passed: Step[] = []
  const unchecked: RunResult['unchecked'] = []
  let stopped: string | null = null
  let locked = false
  let failed: Step | null = null
  try {
    for (const step of steps) {
      if (stopped !== null) {
        unchecked.push({ step, why: stopped })
        continue
      }
      if (step.unavailable !== undefined) {
        unchecked.push({ step, why: step.unavailable })
        continue
      }
      let remaining = deadline - deps.now()
      if (remaining < MIN_STEP_MS) {
        stopped = `the ${secs(capMs)} time cap was reached`
        unchecked.push({ step, why: stopped })
        continue
      }
      const estimate = deps.estimateMs(step)
      if (estimate !== undefined && estimate > remaining) {
        unchecked.push({ step, why: `its last run took ${secs(estimate)}, only ${secs(remaining)} of the cap left` })
        continue
      }
      if (step.locked && !locked) {
        const got = await deps.acquireLock(remaining)
        if (!got.ok) {
          stopped = got.reason
          unchecked.push({ step, why: stopped })
          continue
        }
        locked = true
        remaining = deadline - deps.now()
        if (remaining < MIN_STEP_MS) {
          stopped = `the ${secs(capMs)} time cap was reached`
          unchecked.push({ step, why: stopped })
          continue
        }
      }
      deps.log(`▶ ${step.label}`)
      const outcome = await deps.exec(step, remaining)
      deps.onStepDone(step, outcome)
      if (outcome.kind === 'pass') {
        passed.push(step)
      } else if (outcome.kind === 'timeout') {
        stopped = `the ${secs(capMs)} time cap was reached`
        unchecked.push({ step, why: `${stopped} while it ran (stopped after ${secs(outcome.ms)})` })
      } else {
        failed = step
        break
      }
    }
  } finally {
    if (locked) deps.releaseLock()
  }
  return { exitCode: failed ? 1 : 0, passed, unchecked, failed }
}

/** Stand-alone checks that run before the lock. */
function cheapSteps(plan: Plan): Step[] {
  const steps: Step[] = [
    { id: 'validate-fast', label: 'validate-fast (lint, lint:pyreon, doc/dist/budget/manifest/CI-config gates)', argv: ['bun', 'run', 'validate-fast'], locked: false, passes: [] },
  ]
  if (plan.installCheck) {
    steps.push({
      id: 'install',
      label: 'lockfile in sync (bun install --frozen-lockfile --dry-run)',
      argv: ['bun', 'install', '--frozen-lockfile', '--dry-run'],
      locked: false,
      passes: [],
    })
  }
  return steps
}

/**
 * The ordered steps for a plan, minus everything already recorded as passed.
 * Returns the steps and the names skipped as cached (for the log).
 */
export function buildSteps(opts: {
  plan: Plan
  workspaces: readonly WorkspaceInfo[]
  keys: ReadonlyMap<string, string>
  cache: PassCache
  kotlinHome: string | null
}): { steps: Step[]; cached: string[] } {
  const { plan, keys, cache } = opts
  const dirOf = new Map(opts.workspaces.map((w) => [w.name, w.dir]))
  const cached: string[] = []
  const entry = (g: Group, pkg: string) => entryKey(g, pkg, keys.get(pkg) ?? 'missing')
  const fresh = (g: Group, pkg: string) => {
    if (cache.entries[entry(g, pkg)] === undefined) return true
    cached.push(`${g === 'typecheck' ? 'typecheck' : 'test'} ${pkg}`)
    return false
  }

  const typecheckStep = (id: string, label: string, names: string[]): Step[] => {
    const run = names.filter((n) => fresh('typecheck', n))
    if (run.length === 0) return []
    return [
      {
        id,
        label: `${label}: ${summarize(run)}`,
        // One package at a time: the shared machine allows one heavy run.
        argv: ['bun', 'run', ...run.map((n) => `--filter=${n}`), '--sequential', 'typecheck'],
        locked: true,
        passes: run.map((n) => entry('typecheck', n)),
      },
    ]
  }
  const testStep = (g: Group, pkg: string, extra: string[], env?: Record<string, string>): Step => ({
    id: `${g}:${pkg}`,
    label: `tests ${pkg}${g === 'test' ? '' : ' (native toolchain)'}`,
    argv: extra.length > 0 ? ['bun', 'run', 'test', '--', ...extra] : ['bun', 'run', 'test'],
    cwd: dirOf.get(pkg)!,
    locked: true,
    passes: [entry(g, pkg)],
    durationKey: `test|${pkg}`,
    ...(env ? { env } : {}),
  })

  const steps: Step[] = [...cheapSteps(plan)]
  steps.push(...typecheckStep('typecheck', 'typecheck (changed packages)', plan.groups.typecheck))
  for (const pkg of plan.groups.test) {
    if (!fresh('test', pkg)) continue
    if (pkg === SCRIPT_TEST_PACKAGE && plan.targetedTests !== null) {
      // Only the tests that observe the changed files; a targeted run is not
      // a pass of the whole suite, so it records nothing.
      const dir = dirOf.get(pkg)!
      const rel = plan.targetedTests.map((f) => f.slice(f.indexOf('/src/') + 1))
      steps.push({
        id: `test:${pkg}:targeted`,
        label: `tests ${pkg}: ${plan.targetedTests.length} file(s) that read the changed files`,
        argv: ['bun', 'run', 'test', '--', ...rel],
        cwd: dir,
        locked: true,
        passes: [],
      })
      continue
    }
    steps.push(testStep('test', pkg, []))
  }
  const env = opts.kotlinHome ? { KOTLIN_HOME: opts.kotlinHome } : undefined
  for (const pkg of plan.groups['native-vitest']) {
    if (fresh('native-vitest', pkg)) steps.push(testStep('native-vitest', pkg, ['--maxWorkers=4'], env))
  }
  for (const pkg of plan.groups['native-script']) {
    if (fresh('native-script', pkg)) steps.push(testStep('native-script', pkg, [], env))
  }
  return { steps, cached }
}

function summarize(names: readonly string[], max = 8): string {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')}, … (+${names.length - max} more)`
}

// ── Lock ───────────────────────────────────────────────────────────────────

export interface LockOwner {
  pid: number
  branch?: string
  worktree?: string
  startedAt?: number
  step?: string
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: alive, owned by someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** One atomic attempt. Reclaims a lock whose holder process is gone. */
export function tryAcquireLock(
  lockDir: string,
  owner: LockOwner,
  alive: (pid: number) => boolean = isAlive,
): { ok: true } | { ok: false; holder: LockOwner | null } {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(lockDir)
      // `pid` alone is what older hooks write and read; keep it first.
      writeFileSync(join(lockDir, 'pid'), `${owner.pid}\n`)
      writeOwner(lockDir, owner)
      return { ok: true }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    const holder = readHolder(lockDir)
    if (holder !== null && alive(holder.pid)) return { ok: false, holder }
    if (holder === null && Date.now() - mtimeMs(lockDir) < 60_000) {
      // Created a moment ago and not yet written: treat as held. An empty lock
      // older than a minute is a crash between mkdir and the pid write.
      return { ok: false, holder: null }
    }
    // A crashed run cannot release: remove exactly this stale lock and retry.
    rmSync(join(lockDir, 'pid'), { force: true })
    rmSync(join(lockDir, 'owner.json'), { force: true })
    try {
      rmdirSync(lockDir)
    } catch {
      /* someone else reclaimed it first; retry */
    }
  }
  return { ok: false, holder: readHolder(lockDir) }
}

function mtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

function readHolder(lockDir: string): LockOwner | null {
  let pid: number
  try {
    pid = Number.parseInt(readFileSync(join(lockDir, 'pid'), 'utf8').split('\n')[0]!, 10)
  } catch {
    return null
  }
  if (!Number.isFinite(pid)) return null
  try {
    const o = JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf8')) as LockOwner
    return { ...o, pid }
  } catch {
    return { pid }
  }
}

function writeOwner(lockDir: string, owner: LockOwner): void {
  const file = join(lockDir, 'owner.json')
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(owner))
  renameSync(tmp, file)
}

export function describeHolder(holder: LockOwner | null, now: number): string {
  if (holder === null) return 'another push (starting up)'
  const parts = [`pid ${holder.pid}`]
  if (holder.branch) parts.push(`branch ${holder.branch}`)
  if (holder.worktree) parts.push(`in ${holder.worktree}`)
  let s = parts.join(', ')
  if (holder.step) s += `, running "${holder.step}"`
  if (holder.startedAt !== undefined) s += `, holding it for ${secs(now - holder.startedAt)}`
  if (!holder.branch && holder.startedAt === undefined) s += ' (an older hook that records no details)'
  return s
}

/** Wait for the lock up to `budgetMs`, reporting the holder; never longer. */
export async function waitForLock(opts: {
  lockDir: string
  owner: LockOwner
  budgetMs: number
  now: () => number
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
  alive?: (pid: number) => boolean
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const start = opts.now()
  let lastReport = -Infinity
  let holder: LockOwner | null = null
  for (;;) {
    const got = tryAcquireLock(opts.lockDir, opts.owner, opts.alive)
    if (got.ok) {
      if (holder !== null || lastReport > -Infinity) opts.log(`lock acquired after waiting ${secs(opts.now() - start)}`)
      return got
    }
    holder = got.holder
    const t = opts.now()
    const left = opts.budgetMs - (t - start)
    if (left <= 0) {
      return { ok: false, reason: `the pre-push lock stayed held by ${describeHolder(holder, t)}` }
    }
    if (t - lastReport >= LOCK_REPORT_EVERY_MS) {
      opts.log(`waiting for the pre-push lock — held by ${describeHolder(holder, t)}; waiting up to ${secs(left)} more`)
      lastReport = t
    }
    await opts.sleep(Math.min(2000, left))
  }
}

export function releaseLock(lockDir: string, pid: number): void {
  const holder = readHolder(lockDir)
  if (holder === null || holder.pid !== pid) return
  rmSync(join(lockDir, 'owner.json'), { force: true })
  rmSync(join(lockDir, 'pid'), { force: true })
  try {
    rmdirSync(lockDir)
  } catch {
    /* already gone */
  }
}

// ── Learned durations ──────────────────────────────────────────────────────

export interface Durations {
  version: 1
  entries: Record<string, { ms: number; at: number }>
}

export function parseDurations(text: string | null): Durations {
  try {
    const raw = text === null ? null : (JSON.parse(text) as Partial<Durations>)
    if (raw?.version === 1 && raw.entries && typeof raw.entries === 'object') return { version: 1, entries: raw.entries }
  } catch {
    /* corrupt → empty */
  }
  return { version: 1, entries: {} }
}

/**
 * Record a duration. A timeout records the time it ran (a lower bound), so a
 * suite that cannot finish inside the cap is not started again until the cap
 * or the suite changes. Bounded by age and count.
 */
export function recordDuration(d: Durations, key: string, ms: number, now: number): Durations {
  const entries = { ...d.entries, [key]: { ms, at: now } }
  const kept = Object.entries(entries)
    .filter(([, v]) => now - v.at <= DURATIONS_MAX_AGE_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, DURATIONS_MAX_ENTRIES)
  return { version: 1, entries: Object.fromEntries(kept) }
}

// ── Process execution ──────────────────────────────────────────────────────

let current: ChildProcess | null = null

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* gone */
    }
  }
}

/** Run a step in its own process group, so a timeout stops its whole tree and nothing else. */
function execStep(step: Step, budgetMs: number): Promise<Outcome> {
  const start = Date.now()
  return new Promise((resolveOutcome) => {
    const child = spawn(step.argv[0]!, step.argv.slice(1), {
      cwd: step.cwd ?? ROOT,
      env: { ...process.env, ...step.env },
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: true,
    })
    current = child
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child, 'SIGTERM')
      setTimeout(() => killGroup(child, 'SIGKILL'), 3000).unref()
    }, budgetMs)
    const done = (code: number | null) => {
      clearTimeout(timer)
      current = null
      const ms = Date.now() - start
      resolveOutcome({ kind: timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail', ms })
    }
    child.on('error', (err) => {
      process.stderr.write(`[pyreon pre-push] could not start ${step.argv[0]}: ${err.message}\n`)
      done(1)
    })
    child.on('exit', (code) => done(code))
  })
}

// ── CLI ────────────────────────────────────────────────────────────────────

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function printPlan(plan: Plan, base: string, changedCount: number | null, cached: string[], say: (s: string) => void): void {
  if (changedCount === null) say(`could not diff against ${base} — treating it as an unknown root change`)
  else say(`plan vs ${base}: ${changedCount} changed file(s)`)
  const byRule = new Map<string, string[]>()
  for (const { path, rule } of plan.rules) byRule.set(rule, [...(byRule.get(rule) ?? []), path])
  for (const [rule, paths] of byRule) say(`  ${rule}: ${summarize(paths, 4)}`)
  if (plan.targetedTests !== null) say(`  ${plan.targetedTests.length} @pyreon/test-utils test file(s) read the changed files`)
  if (cached.length > 0) say(`  skipped, already passed with identical inputs: ${summarize(cached)}`)
  const dropped = plan.closureSize - plan.direct.length
  if (dropped > 0) say(`  ${dropped} dependent workspace(s) left to CI (typecheck and tests of the closure)`)
}

async function main(): Promise<void> {
  const say = (s: string) => process.stdout.write(`[pyreon pre-push] ${s}\n`)
  const cacheArg = process.argv.find((a) => a.startsWith('--cache-dir='))
  const cacheDir = cacheArg?.slice('--cache-dir='.length)
  if (!cacheDir) throw new Error('[Pyreon] pre-push.ts needs --cache-dir=<git common dir>')
  const capSec = Number(process.env.PYREON_PRE_PUSH_CAP_SEC ?? process.env.PYREON_PRE_PUSH_TIMEOUT_SEC ?? DEFAULT_CAP_SEC)
  if (!Number.isFinite(capSec) || capSec <= 0) throw new Error(`[Pyreon] PYREON_PRE_PUSH_CAP_SEC must be a positive number of seconds`)
  const useCache = process.env.PYREON_PRE_PUSH_NO_CACHE !== '1'

  // The diff base; another ref checks a push that stacks on unpushed work.
  const base = process.env.PYREON_PRE_PUSH_BASE ?? 'origin/main'
  if (!/^[\w./^~-]+$/.test(base)) throw new Error(`[Pyreon] PYREON_PRE_PUSH_BASE must be a plain git revision, got ${JSON.stringify(base)}`)
  const changed = gitChangedFiles(base)
  const workspaces = discoverWithScripts(ROOT)
  const files = gitFiles(ROOT)
  const testUtilsDir = workspaces.find((w) => w.name === SCRIPT_TEST_PACKAGE)?.dir
  const { testFiles, scriptFiles } = readTargetingSources(ROOT, files, testUtilsDir)
  const plan = computePlan({ changed, workspaces, root: ROOT, testFiles, scriptFiles })
  const wanted = new Set(Object.values(plan.groups).flat())
  const keys = wanted.size > 0 ? computePassKeys({ root: ROOT, files, workspaces, packages: [...wanted] }) : new Map<string, string>()
  const cache = useCache ? readCacheFile(cacheDir) : parseCache(null)
  const needsKotlin = plan.groups['native-vitest'].length + plan.groups['native-script'].length > 0
  const kotlinHome = needsKotlin ? (process.env.KOTLIN_HOME ?? detectKotlinHome()) : null
  const { steps, cached } = buildSteps({ plan, workspaces, keys, cache, kotlinHome })

  say(`checks what this push can break, within ${capSec}s; CI runs the full gate. Bypass: PYREON_SKIP_PRE_PUSH=1`)
  printPlan(plan, base, changed === null ? null : changed.length, cached, say)
  if (needsKotlin && !kotlinHome) say('  kotlinc not found — Kotlin checks in the native suites self-skip; CI runs them')
  say('')
  if (process.argv.includes('--plan-only')) {
    // The selection without running it (the gate-runner agent runs each command itself).
    for (const st of steps) {
      const where = st.cwd && st.cwd !== ROOT ? `(cd ${st.cwd} && ${st.argv.join(' ')})` : st.argv.join(' ')
      say(`${st.label}\n    ${st.unavailable ? `unavailable: ${st.unavailable}` : where}`)
    }
    return
  }

  const lockDir = join(cacheDir, LOCK_DIR_NAME)
  const durationsFile = join(cacheDir, DURATIONS_FILE)
  const readDurations = () => parseDurations(existsSync(durationsFile) ? readFileSync(durationsFile, 'utf8') : null)
  const owner: LockOwner = {
    pid: process.pid,
    worktree: ROOT,
    startedAt: Date.now(),
  }
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch) owner.branch = branch
  let holdingLock = false
  const stop = (signal: NodeJS.Signals) => {
    if (current) killGroup(current, 'SIGTERM')
    if (holdingLock) releaseLock(lockDir, process.pid)
    process.stderr.write(`\n[pyreon pre-push] interrupted (${signal})\n`)
    process.exit(130)
  }
  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGHUP', () => stop('SIGHUP'))

  const result = await runSteps(steps, capSec * 1000, {
    now: () => Date.now(),
    exec: (step, budget) => {
      if (holdingLock && step.locked) {
        try {
          writeOwner(lockDir, { ...owner, step: step.label })
        } catch {
          /* best effort */
        }
      }
      return execStep(step, budget)
    },
    estimateMs: (step) => (step.durationKey ? readDurations().entries[step.durationKey]?.ms : undefined),
    acquireLock: async (budget) => {
      const got = await waitForLock({
        lockDir,
        owner,
        budgetMs: budget,
        now: () => Date.now(),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        log: say,
      })
      holdingLock = got.ok
      return got
    },
    releaseLock: () => {
      releaseLock(lockDir, process.pid)
      holdingLock = false
    },
    onStepDone: (step, outcome) => {
      if (step.durationKey && outcome.kind !== 'fail') {
        try {
          writeDurationsFile(durationsFile, recordDuration(readDurations(), step.durationKey, outcome.ms, Date.now()))
        } catch {
          /* a lost duration only costs one more attempt */
        }
      }
      if (outcome.kind === 'pass' && useCache && step.passes.length > 0) {
        try {
          writeCacheFile(cacheDir, recordPasses(readCacheFile(cacheDir), step.passes, Date.now()))
        } catch {
          say(`(could not record the pass for ${step.label} — it will re-run next push)`)
        }
      }
    },
    log: (line) => say(line),
  })

  say('')
  if (result.failed) {
    say(`❌ ${result.failed.label} failed — fix the failure above and push again.`)
    say(`   Re-run it alone: ${result.failed.cwd && result.failed.cwd !== ROOT ? `(cd ${result.failed.cwd} && ` : ''}${result.failed.argv.join(' ')}${result.failed.cwd && result.failed.cwd !== ROOT ? ')' : ''}`)
    process.exit(1)
  }
  if (result.unchecked.length > 0) {
    say(`⚠ NOT CHECKED locally (${result.unchecked.length}) — CI runs each of these behind a required check:`)
    for (const { step, why } of result.unchecked) say(`   - ${step.label} — ${why}`)
    say('Pushing anyway: a clock or a busy lock is not a failure. Run any of them by hand to check before CI does.')
  } else {
    say(`✓ ${result.passed.length} check(s) passed — pushing. CI runs the full gate.`)
  }
  process.exit(0)
}

function writeDurationsFile(file: string, d: Durations): void {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(d)}\n`)
  renameSync(tmp, file)
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    // A planner crash fails the push: an empty plan is indistinguishable from "all green".
    process.stderr.write(`[pyreon pre-push] ❌ could not plan the checks: ${err instanceof Error ? err.stack : String(err)}\n`)
    process.stderr.write('[pyreon pre-push]    Bypass for this push: PYREON_SKIP_PRE_PUSH=1 git push\n')
    process.exit(1)
  })
}
