#!/usr/bin/env bun
/**
 * CI throughput measurement: queue time, work time, runner minutes, cancels and
 * failures per workflow and per job, from the GitHub Actions API.
 *
 *   bun scripts/ci-throughput.ts                 # last 7 days, text report
 *   bun scripts/ci-throughput.ts --days 1        # last 24 hours
 *   bun scripts/ci-throughput.ts --since 2026-11-16T00:00:00Z --until 2026-11-23T00:00:00Z
 *   bun scripts/ci-throughput.ts --json > ci.json
 *   bun scripts/ci-throughput.ts --max-job-fetches 1500   # cap jobs-API calls
 *   bun scripts/ci-throughput.ts --include-workflow-run   # also the housekeeping jobs that ran
 *   bun scripts/ci-throughput.ts --offline --since … --until …   # re-analyse the cache only
 *   bun scripts/ci-throughput.ts --reserve 2000         # leave more of the shared API budget
 *
 * Reads only (`gh api`, the caller's auth). Every API response for a COMPLETED
 * run is cached under `--cache` (default `.cache/ci-throughput`), so a re-run
 * costs only the runs that finished since. Jobs are fetched with
 * `filter=all`, so a re-run's earlier attempts are counted too.
 *
 * What the numbers mean (the definitions live in the functions below):
 * - queue = job `started_at - created_at`; work = `completed_at - started_at`.
 *   A job that never started (skipped, or cancelled before a runner took it)
 *   has no queue or work and is counted under its outcome only.
 * - runner minutes = summed work of jobs that ran, per OS label. Public repos
 *   are not billed; minutes here measure slot occupancy, the real constraint.
 * - outcome per job: success | failure (real: a runner ran steps and one
 *   failed) | timeout (cancelled at its own timeout-minutes, detected from
 *   GitHub's annotation when fetched, otherwise from work >= the job limit is
 *   not knowable here, so it is reported as cancelled-running) |
 *   cancelled-running (ran, then cancelled: superseded by concurrency or by
 *   hand) | cancelled-queued (cancelled before a runner: superseded while
 *   queued, or "not acquired by Runner") | skipped.
 * - time-to-green of a PR head SHA = last completion minus first creation
 *   over the runs of the workflows that own required contexts, counted only
 *   when every one of those runs concluded success (attempt 1 or later).
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const sleep = (msec: number) => new Promise((done) => setTimeout(done, msec))

const REPO = 'pyreon/pyreon'

// ─── types (the subset of the API shapes this reads) ────────────────────────

export interface Run {
  id: number
  name: string
  path: string
  event: string
  status: string
  conclusion: string | null
  head_sha: string
  head_branch: string | null
  created_at: string
  run_started_at?: string
  updated_at: string
  run_attempt: number
  pull_requests?: { number: number }[]
  display_title?: string
}

export interface Step {
  name: string
  status: string
  conclusion: string | null
  number: number
  started_at?: string | null | undefined
  completed_at?: string | null | undefined
}

export interface Job {
  id: number
  run_id: number
  run_attempt: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  labels: string[]
  runner_name: string | null
  steps?: Step[]
}

/** Workflows whose jobs own a required context (see the CI guide, "Required checks"). */
export const REQUIRED_WORKFLOWS = [
  '.github/workflows/ci.yml',
  '.github/workflows/pr-gates.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/native-validate.yml',
  '.github/workflows/native-device.yml',
]

// ─── pure analysis ──────────────────────────────────────────────────────────

const ms = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) : null)

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

export function os(job: Pick<Job, 'labels'>): 'macos' | 'linux' | 'windows' | 'other' {
  const l = job.labels.join(' ').toLowerCase()
  if (l.includes('macos')) return 'macos'
  if (l.includes('ubuntu') || l.includes('linux')) return 'linux'
  if (l.includes('windows')) return 'windows'
  return 'other'
}

/** Matrix job prefixes whose parenthesised suffix is a batch or cell name. */
const MATRIX_PREFIXES = ['typecheck', 'test', 'e2e', 'Scaffold Smoke', 'Record', 'Build', 'Publish']

/**
 * Collapse matrix parameters so `test (batch-2)` and `test (batch-3)` share a
 * row. Fixed names that merely contain parentheses (`Test (browser)`,
 * `Analyze (javascript-typescript)`) keep their own row.
 */
export function jobFamily(name: string): string {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(name)
  if (m && MATRIX_PREFIXES.includes(m[1]!)) return `${m[1]} (…)`
  return name
}

/** One row per workflow: the dynamic Code Quality runs are named per pull request. */
export function workflowFamily(name: string): string {
  return name.startsWith('Code Quality') ? 'Code Quality (dynamic)' : name
}

export type Outcome =
  | 'success'
  | 'failure'
  | 'timeout'
  | 'cancelled-running'
  | 'cancelled-queued'
  | 'skipped'
  | 'other'

export function hasStarted(job: Job): boolean {
  if (!job.started_at || !job.runner_name) return false
  return (job.steps ?? []).some((s) => s.status === 'completed' && s.conclusion !== 'skipped')
}

export function outcome(job: Job, timedOut = false): Outcome {
  if (job.conclusion === 'skipped') return 'skipped'
  if (job.conclusion === 'success') return 'success'
  if (job.conclusion === 'failure') return hasStarted(job) ? 'failure' : 'cancelled-queued'
  if (job.conclusion === 'timed_out' || timedOut) return 'timeout'
  if (job.conclusion === 'cancelled') return hasStarted(job) ? 'cancelled-running' : 'cancelled-queued'
  return 'other'
}

/** Queue and work in minutes, or null when the job never ran on a runner. */
export function timing(job: Job): { queue: number; work: number } | null {
  if (job.conclusion === 'skipped' || !job.runner_name) return null
  const c = ms(job.created_at)
  const s = ms(job.started_at)
  const e = ms(job.completed_at)
  if (c === null || s === null || e === null || e < s) return null
  return { queue: Math.max(0, s - c) / 60000, work: (e - s) / 60000 }
}

export interface Stat {
  n: number
  median: number | null
  p90: number | null
  max: number | null
  sum: number
}

export function stat(values: number[]): Stat {
  return {
    n: values.length,
    median: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    max: values.length ? Math.max(...values) : null,
    sum: values.reduce((a, b) => a + b, 0),
  }
}

export interface JobRow {
  workflow: string
  job: string
  os: string
  outcomes: Record<Outcome, number>
  queue: Stat
  work: Stat
}

export function jobRows(runs: Map<number, Run>, jobs: Job[]): JobRow[] {
  const groups = new Map<string, { w: string; j: string; os: string; list: Job[] }>()
  for (const job of jobs) {
    const run = runs.get(job.run_id)
    if (!run) continue
    const w = workflowFamily(run.name)
    const key = `${w}\0${jobFamily(job.name)}\0${os(job)}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { w, j: jobFamily(job.name), os: os(job), list: [] }))
    g.list.push(job)
  }
  const rows: JobRow[] = []
  for (const g of groups.values()) {
    const outcomes = {
      success: 0,
      failure: 0,
      timeout: 0,
      'cancelled-running': 0,
      'cancelled-queued': 0,
      skipped: 0,
      other: 0,
    } as Record<Outcome, number>
    const q: number[] = []
    const w: number[] = []
    for (const job of g.list) {
      outcomes[outcome(job)]++
      const t = timing(job)
      if (t) {
        q.push(t.queue)
        w.push(t.work)
      }
    }
    rows.push({ workflow: g.w, job: g.j, os: g.os, outcomes, queue: stat(q), work: stat(w) })
  }
  return rows.sort((a, b) => b.work.sum - a.work.sum)
}

/** Peak number of jobs running at once per OS (sweep line over started→completed). */
export function peakConcurrency(jobs: Job[]): Record<string, { peak: number; at: string | null }> {
  const events = new Map<string, [number, number][]>()
  for (const job of jobs) {
    const t = timing(job)
    if (!t) continue
    const o = os(job)
    const list = events.get(o) ?? []
    list.push([ms(job.started_at)!, 1], [ms(job.completed_at)!, -1])
    events.set(o, list)
  }
  const out: Record<string, { peak: number; at: string | null }> = {}
  for (const [o, list] of events) {
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let cur = 0
    let peak = 0
    let at: number | null = null
    for (const [t, d] of list) {
      cur += d
      if (cur > peak) {
        peak = cur
        at = t
      }
    }
    out[o] = { peak, at: at === null ? null : new Date(at).toISOString() }
  }
  return out
}

export interface ShaVerdict {
  sha: string
  pr: string
  minutesToGreen: number | null
  runnerMinutes: number
  linuxMinutes: number
  macosMinutes: number
  workflows: number
  /** The required-workflow job that finished last on a green SHA: the critical path's end. */
  critical: { job: string; queue: number; work: number } | null
}

/**
 * Per pull-request head SHA: time-to-green over the required workflows and
 * the runner minutes every pull_request run of that SHA used. Time-to-green
 * reads the NEWEST run of each required workflow for the SHA (a label event
 * starts another PR Gates run on the same SHA) and counts only SHAs where all
 * of them concluded success.
 */
export function perPrSha(runs: Run[], jobsByRun: Map<number, Job[]>): ShaVerdict[] {
  const bySha = new Map<string, Run[]>()
  for (const run of runs) {
    if (run.event !== 'pull_request') continue
    const list = bySha.get(run.head_sha) ?? []
    list.push(run)
    bySha.set(run.head_sha, list)
  }
  const out: ShaVerdict[] = []
  for (const [sha, list] of bySha) {
    const { linux, macos } = minutesOf(list, jobsByRun)
    out.push({
      sha,
      pr: String(list[0]?.pull_requests?.[0]?.number ?? list[0]?.head_branch ?? ''),
      ...greenVerdict(newestRequired(list), jobsByRun),
      runnerMinutes: linux + macos,
      linuxMinutes: linux,
      macosMinutes: macos,
      workflows: new Set(list.map((r) => r.path)).size,
    })
  }
  return out
}

/** The newest run of each required workflow among one SHA's runs. */
function newestRequired(list: Run[]): Run[] {
  const newest = new Map<string, Run>()
  for (const r of list) {
    if (!REQUIRED_WORKFLOWS.includes(r.path)) continue
    const cur = newest.get(r.path)
    if (!cur || ms(r.created_at)! > ms(cur.created_at)!) newest.set(r.path, r)
  }
  return [...newest.values()]
}

/** Time-to-green and the last-finishing job, when every required workflow is green. */
function greenVerdict(
  req: Run[],
  jobsByRun: Map<number, Job[]>,
): Pick<ShaVerdict, 'minutesToGreen' | 'critical'> {
  const green =
    req.length === REQUIRED_WORKFLOWS.length &&
    req.every((r) => r.status === 'completed' && r.conclusion === 'success')
  if (!green) return { minutesToGreen: null, critical: null }
  const start = Math.min(...req.map((r) => ms(r.created_at)!))
  const end = Math.max(...req.map((r) => ms(r.updated_at)!))
  let last: Job | null = null
  for (const r of req) {
    for (const job of jobsByRun.get(r.id) ?? []) {
      if (job.run_attempt !== r.run_attempt || !timing(job)) continue
      if (!last || ms(job.completed_at)! > ms(last.completed_at)!) last = job
    }
  }
  return {
    minutesToGreen: (end - start) / 60000,
    critical: last ? { job: jobFamily(last.name), ...timing(last)! } : null,
  }
}

/** Runner minutes of every job of these runs, split by OS. */
function minutesOf(list: Run[], jobsByRun: Map<number, Job[]>): { linux: number; macos: number } {
  let linux = 0
  let macos = 0
  for (const run of list) {
    for (const job of jobsByRun.get(run.id) ?? []) {
      const t = timing(job)
      if (!t) continue
      if (os(job) === 'macos') macos += t.work
      else linux += t.work
    }
  }
  return { linux, macos }
}


/**
 * Pull-request runs that were superseded (a newer run of the same workflow
 * on the same branch was created before this one finished) but were not
 * cancelled: work concurrency should have stopped.
 */
export function supersededNotCancelled(runs: Run[]): { workflow: string; count: number }[] {
  const byKey = new Map<string, Run[]>()
  for (const r of runs) {
    if (r.event !== 'pull_request' || !r.head_branch) continue
    const k = `${r.path}\0${r.head_branch}`
    const list = byKey.get(k) ?? []
    list.push(r)
    byKey.set(k, list)
  }
  const counts = new Map<string, number>()
  for (const list of byKey.values()) {
    list.sort((a, b) => ms(a.created_at)! - ms(b.created_at)!)
    for (let i = 0; i + 1 < list.length; i++) {
      const cur = list[i]!
      const next = list.find((r, j) => j > i && r.head_sha !== cur.head_sha)
      if (!next) continue
      if (ms(next.created_at)! < ms(cur.updated_at)! && cur.conclusion !== 'cancelled') {
        counts.set(cur.name, (counts.get(cur.name) ?? 0) + 1)
      }
    }
  }
  return [...counts].map(([workflow, count]) => ({ workflow, count })).sort((a, b) => b.count - a.count)
}

// ─── fetching (gh api, cached) ──────────────────────────────────────────────

interface Options {
  since: string
  until: string
  cache: string
  maxJobFetches: number
  json: boolean
  concurrency: number
  includeWorkflowRun: boolean
  offline: boolean
  reserve: number
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const until = get('--until') ?? new Date().toISOString()
  const days = Number(get('--days') ?? 7)
  const since = get('--since') ?? new Date(Date.parse(until) - days * 86400000).toISOString()
  return {
    since,
    until,
    cache: get('--cache') ?? '.cache/ci-throughput',
    maxJobFetches: Number(get('--max-job-fetches') ?? 4000),
    json: argv.includes('--json'),
    concurrency: Number(get('--concurrency') ?? 6),
    includeWorkflowRun: argv.includes('--include-workflow-run'),
    offline: argv.includes('--offline'),
    // The REST budget (5,000 calls an hour) is per user and shared with every
    // other tool and session using the same token: never spend all of it.
    reserve: Number(get('--reserve') ?? 1000),
  }
}

async function gh<T>(path: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { stdout } = await execFileAsync('gh', ['api', '-H', 'Accept: application/vnd.github+json', path], {
        maxBuffer: 64 * 1024 * 1024,
      })
      return JSON.parse(stdout) as T
    } catch (error) {
      if (attempt >= 3) throw new Error(`[ci-throughput] gh api ${path} failed: ${(error as Error).message}`)
      await sleep(2000 * attempt)
    }
  }
}

async function remaining(): Promise<number> {
  const r = await gh<{ resources: { core: { remaining: number } } }>('rate_limit')
  return r.resources.core.remaining
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]!)
    }),
  )
}

/** List runs created in [from, to), splitting the window while it exceeds the API's 1000-result cap. */
async function listRuns(from: number, to: number, opts: Options, out: Map<number, Run>): Promise<void> {
  const range = `${new Date(from).toISOString().replace('.000', '')}..${new Date(to - 1000).toISOString().replace('.000', '')}`
  const base = `repos/${REPO}/actions/runs?created=${encodeURIComponent(range)}&per_page=100`
  const first = await gh<{ total_count: number; workflow_runs: Run[] }>(`${base}&page=1`)
  if (first.total_count > 1000 && to - from > 10 * 60000) {
    const mid = from + Math.floor((to - from) / 2 / 1000) * 1000
    await listRuns(from, mid, opts, out)
    await listRuns(mid, to, opts, out)
    return
  }
  for (const r of first.workflow_runs) out.set(r.id, r)
  const pages = Math.ceil(Math.min(first.total_count, 1000) / 100)
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, k) => k + 2)
  await pool(rest, opts.concurrency, async (page) => {
    const res = await gh<{ workflow_runs: Run[] }>(`${base}&page=${page}`)
    for (const r of res.workflow_runs) out.set(r.id, r)
  })
}

async function fetchJobs(run: Run, opts: Options): Promise<Job[] | null> {
  const file = join(opts.cache, 'jobs', `${run.id}-${run.run_attempt}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Job[]
  const jobs: Job[] = []
  for (let page = 1; page <= 10; page++) {
    const res = await gh<{ total_count: number; jobs: Job[] }>(
      `repos/${REPO}/actions/runs/${run.id}/jobs?filter=all&per_page=100&page=${page}`,
    )
    jobs.push(...res.jobs)
    if (jobs.length >= res.total_count || res.jobs.length === 0) break
  }
  const slim = jobs.map((j) => ({
    id: j.id,
    run_id: j.run_id,
    run_attempt: j.run_attempt,
    name: j.name,
    status: j.status,
    conclusion: j.conclusion,
    created_at: j.created_at,
    started_at: j.started_at,
    completed_at: j.completed_at,
    labels: j.labels,
    runner_name: j.runner_name,
    steps: (j.steps ?? []).map((s) => ({
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
      number: s.number,
      started_at: s.started_at,
      completed_at: s.completed_at,
    })),
  }))
  if (run.status === 'completed') writeFileSync(file, JSON.stringify(slim))
  return slim
}

export interface Report {
  window: { since: string; until: string }
  runs: number
  jobFetchCoverage: { fetched: number; eligible: number }
  workflows: {
    workflow: string
    runs: number
    byEvent: Record<string, number>
    byConclusion: Record<string, number>
    runMinutes: Stat
  }[]
  jobs: JobRow[]
  minutesByOs: Record<string, number>
  minutesByEvent: Record<string, number>
  peakConcurrency: Record<string, { peak: number; at: string | null }>
  prShas: {
    count: number
    toGreen: Stat
    runnerMinutes: Stat
    linuxMinutes: Stat
    macosMinutes: Stat
    criticalPath: { job: string; count: number; queue: Stat; work: Stat }[]
  }
  pushMain: { runs: number; runnerMinutes: Stat }
  supersededNotCancelled: { workflow: string; count: number }[]
  housekeeping: { workflow: string; runs: number; perPrPush: number | null }[]
}

/** Which job finished last on green PR SHAs, with that job's own queue and work. */
export function criticalPath(shas: ShaVerdict[]): { job: string; count: number; queue: Stat; work: Stat }[] {
  const by = new Map<string, { q: number[]; w: number[] }>()
  for (const s of shas) {
    if (!s.critical) continue
    const g = by.get(s.critical.job) ?? { q: [], w: [] }
    g.q.push(s.critical.queue)
    g.w.push(s.critical.work)
    by.set(s.critical.job, g)
  }
  return [...by]
    .map(([job, g]) => ({ job, count: g.q.length, queue: stat(g.q), work: stat(g.w) }))
    .sort((a, b) => b.count - a.count)
}

export function buildReport(
  opts: Pick<Options, 'since' | 'until'>,
  runList: Run[],
  jobsByRun: Map<number, Job[]>,
): Report {
  const runs = new Map(runList.map((r) => [r.id, r]))
  const allJobs = [...jobsByRun.values()].flat()
  const wf = new Map<string, Run[]>()
  for (const r of runList) {
    const list = wf.get(workflowFamily(r.name)) ?? []
    list.push(r)
    wf.set(workflowFamily(r.name), list)
  }
  const count = <T,>(list: T[], key: (x: T) => string) => {
    const m: Record<string, number> = {}
    for (const x of list) m[key(x)] = (m[key(x)] ?? 0) + 1
    return m
  }
  const minutesByOs: Record<string, number> = {}
  const minutesByEvent: Record<string, number> = {}
  for (const job of allJobs) {
    const t = timing(job)
    if (!t) continue
    minutesByOs[os(job)] = (minutesByOs[os(job)] ?? 0) + t.work
    const ev = runs.get(job.run_id)?.event ?? '?'
    minutesByEvent[ev] = (minutesByEvent[ev] ?? 0) + t.work
  }
  const shas = perPrSha(runList, jobsByRun)
  const prPushes = shas.length
  const mainPushes = new Map<string, number>()
  for (const r of runList) {
    if (r.event !== 'push' || r.head_branch !== 'main') continue
    let m = mainPushes.get(r.head_sha) ?? 0
    for (const job of jobsByRun.get(r.id) ?? []) m += timing(job)?.work ?? 0
    mainPushes.set(r.head_sha, m)
  }
  const housekeeping = [...wf]
    .filter(([, list]) => list.some((r) => r.event === 'workflow_run'))
    .map(([workflow, list]) => ({
      workflow,
      runs: list.length,
      perPrPush: prPushes ? Math.round((list.length / prPushes) * 100) / 100 : null,
    }))
  return {
    window: { since: opts.since, until: opts.until },
    runs: runList.length,
    jobFetchCoverage: { fetched: jobsByRun.size, eligible: runList.length },
    workflows: [...wf]
      .map(([workflow, list]) => ({
        workflow,
        runs: list.length,
        byEvent: count(list, (r) => r.event),
        byConclusion: count(list, (r) => r.conclusion ?? r.status),
        runMinutes: stat(
          list
            .filter((r) => r.status === 'completed' && r.run_started_at)
            .map((r) => (ms(r.updated_at)! - ms(r.run_started_at)!) / 60000),
        ),
      }))
      .sort((a, b) => b.runs - a.runs),
    jobs: jobRows(runs, allJobs),
    minutesByOs,
    minutesByEvent,
    peakConcurrency: peakConcurrency(allJobs),
    prShas: {
      count: prPushes,
      toGreen: stat(shas.flatMap((s) => (s.minutesToGreen === null ? [] : [s.minutesToGreen]))),
      runnerMinutes: stat(shas.map((s) => s.runnerMinutes)),
      linuxMinutes: stat(shas.map((s) => s.linuxMinutes)),
      macosMinutes: stat(shas.map((s) => s.macosMinutes)),
      criticalPath: criticalPath(shas),
    },
    pushMain: { runs: mainPushes.size, runnerMinutes: stat([...mainPushes.values()]) },
    supersededNotCancelled: supersededNotCancelled(runList),
    housekeeping,
  }
}

const f = (n: number | null, d = 1) => (n === null ? '-' : n.toFixed(d))

function printReport(r: Report): void {
  const lines: string[] = []
  lines.push(`CI throughput ${r.window.since} → ${r.window.until}`)
  lines.push(`runs: ${r.runs}; jobs fetched for ${r.jobFetchCoverage.fetched} of them`)
  lines.push('')
  lines.push('runner minutes by OS: ' + Object.entries(r.minutesByOs).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '))
  lines.push('runner minutes by event: ' + Object.entries(r.minutesByEvent).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '))
  lines.push('peak concurrent jobs: ' + Object.entries(r.peakConcurrency).map(([k, v]) => `${k} ${v.peak} (${v.at})`).join(', '))
  lines.push('')
  const p = r.prShas
  lines.push(`PR head SHAs: ${p.count}; time-to-green (all required workflows green) n=${p.toGreen.n} median ${f(p.toGreen.median)} p90 ${f(p.toGreen.p90)} min`)
  lines.push(`runner minutes per PR push: median ${f(p.runnerMinutes.median)} p90 ${f(p.runnerMinutes.p90)} (linux median ${f(p.linuxMinutes.median)}, macOS median ${f(p.macosMinutes.median)} p90 ${f(p.macosMinutes.p90)})`)
  lines.push('critical path (job that finished last on a green SHA): ' + p.criticalPath.map((c) => `${c.job} ×${c.count} (queue median ${f(c.queue.median)}, work median ${f(c.work.median)})`).join('; '))
  lines.push(`runner minutes per default-branch push: n=${r.pushMain.runs} median ${f(r.pushMain.runnerMinutes.median)} p90 ${f(r.pushMain.runnerMinutes.p90)}`)
  lines.push('')
  lines.push('workflow | runs | events | conclusions | run minutes median/p90')
  for (const w of r.workflows) {
    lines.push(`${w.workflow} | ${w.runs} | ${JSON.stringify(w.byEvent)} | ${JSON.stringify(w.byConclusion)} | ${f(w.runMinutes.median)}/${f(w.runMinutes.p90)}`)
  }
  lines.push('')
  lines.push('job family | os | ran | runner-min | work median/p90/max | queue median/p90/max | ok/fail/timeout/cancel-run/cancel-queued/skip')
  for (const j of r.jobs) {
    const o = j.outcomes
    lines.push(`${j.workflow} › ${j.job} | ${j.os} | ${j.work.n} | ${j.work.sum.toFixed(0)} | ${f(j.work.median)}/${f(j.work.p90)}/${f(j.work.max)} | ${f(j.queue.median)}/${f(j.queue.p90)}/${f(j.queue.max)} | ${o.success}/${o.failure}/${o.timeout}/${o['cancelled-running']}/${o['cancelled-queued']}/${o.skipped}`)
  }
  lines.push('')
  lines.push('superseded PR runs not cancelled: ' + JSON.stringify(r.supersededNotCancelled))
  lines.push('workflow_run housekeeping: ' + JSON.stringify(r.housekeeping))
  console.log(lines.join('\n'))
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  mkdirSync(join(opts.cache, 'jobs'), { recursive: true })
  let runList: Run[]
  if (opts.offline) {
    // Re-analyse what an earlier run cached: no API calls at all.
    const lo = Date.parse(opts.since)
    const hi = Date.parse(opts.until)
    runList = (JSON.parse(readFileSync(join(opts.cache, 'runs.json'), 'utf8')) as Run[]).filter(
      (r) => ms(r.created_at)! >= lo && ms(r.created_at)! < hi,
    )
  } else {
    const runMap = new Map<number, Run>()
    await listRuns(Date.parse(opts.since), Date.parse(opts.until), opts, runMap)
    runList = [...runMap.values()]
    writeFileSync(join(opts.cache, 'runs.json'), JSON.stringify(runList))
  }
  // Housekeeping workflow_run runs have one tiny job. Their jobs are fetched only
  // with --include-workflow-run, and only for runs whose job was not skipped
  // (a skipped run, or one cancelled while pending, never held a runner).
  const eligible = runList.filter(
    (r) =>
      r.event !== 'workflow_run' ||
      (opts.includeWorkflowRun && (r.conclusion === 'success' || r.conclusion === 'failure')),
  )
  const cached = eligible.filter((r) => existsSync(join(opts.cache, 'jobs', `${r.id}-${r.run_attempt}.json`)))
  const cachedIds = new Set(cached.map((r) => r.id))
  const todo = eligible.filter((r) => !cachedIds.has(r.id))
  const budget = opts.offline ? 0 : Math.min(opts.maxJobFetches, Math.max(0, (await remaining()) - opts.reserve))
  // Newest first: when the budget is short the recent window is complete.
  todo.sort((a, b) => ms(b.created_at)! - ms(a.created_at)!)
  const jobsByRun = new Map<number, Job[]>()
  for (const r of cached) jobsByRun.set(r.id, (await fetchJobs(r, opts))!)
  let fetched = 0
  await pool(todo.slice(0, budget), opts.concurrency, async (r) => {
    const jobs = await fetchJobs(r, opts)
    if (jobs) jobsByRun.set(r.id, jobs)
    if (++fetched % 200 === 0 && !opts.json) process.stderr.write(`[ci-throughput] jobs ${fetched}/${Math.min(budget, todo.length)}\n`)
  })
  const report = buildReport(opts, runList, jobsByRun)
  report.jobFetchCoverage = { fetched: jobsByRun.size, eligible: eligible.length }
  if (opts.json) console.log(JSON.stringify({ report, runs: runList.length }, null, 2))
  else printReport(report)
}

if (import.meta.main) await main()
