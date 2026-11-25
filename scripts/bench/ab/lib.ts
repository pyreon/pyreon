/**
 * Pure parts of the interleaved, load-gated A/B runner (`run.ts`) and its
 * analyzer (`analyze.ts`). Everything here is deterministic given its inputs —
 * clocks, process tables, file systems and pid probes are injected — so the
 * rules are unit-tested without booting a browser or timing anything
 * (`packages/internals/test-utils/src/tests/bench-ab.test.ts`).
 *
 * The protocol these rules implement is `.agents/guides/benchmarks/README.md`,
 * "Interleaved A/B runner". In short:
 *  - jobs run one at a time under a cross-session lock, arms strictly
 *    interleaved (the arm order rotates every pass);
 *  - a run is VALID only if the 1-minute load average stayed below the
 *    threshold at every sample from start to end, the samples were dense
 *    enough, the command exited 0, no foreign bench process ran alongside it,
 *    and the arm's built entry still hashes to what the preflight recorded;
 *  - a verdict is a win or a loss only when the two arms' CI95s are disjoint
 *    in the same direction in EVERY run (at least two); a row under 10 clock
 *    quanta has no verdict; anything else is a tie.
 */
import { createHash } from 'node:crypto'
import { clusterBootstrapCI95, medianOf } from '../../../examples/benchmark/cluster-bootstrap.ts'

// ─── Jobs file ───────────────────────────────────────────────────────────────

export interface ArmSpec {
  /** Worktree (or any directory) the arm's commands run from, absolute. */
  dir: string
  /**
   * Globs (relative to `dir`) of the BUILT artifact whose content identifies
   * the arm — e.g. `examples/benchmark/dist/assets/index-*.js`. Two arms with
   * the same hash are the same build, which is a broken A/B, not a result.
   */
  entry: string[]
  /** Optional preflight build, run in `dir/<build.cwd>` before anything is timed. */
  build?: { cwd?: string; command: string }
}

export interface JobSpec {
  /** Short label, used in result file names. `[A-Za-z0-9._-]+`. */
  label: string
  /** Working directory relative to the arm's `dir`. Default `.`. */
  cwd?: string
  /**
   * Shell command. Placeholders: `{out}` (absolute path the job must write its
   * JSON to), `{pass}` (global pass index, 1-based), `{run}`, `{arm}`.
   */
  command: string
}

export interface JobsFile {
  /** Results directory name and lock owner label. `[A-Za-z0-9._-]+`. */
  name: string
  arms: Record<string, ArmSpec>
  jobs: JobSpec[]
  /** Independent runs; a verdict needs agreement across all of them. Default 2. */
  runs?: number
  /** Interleaved passes per run (each pass runs every job once per arm). Default 5. */
  passes?: number
}

const LABEL_RE = /^[A-Za-z0-9._-]+$/

function armErrors(id: string, a: Partial<ArmSpec> | undefined): string[] {
  const errs: string[] = []
  if (!LABEL_RE.test(id)) errs.push(`arm id "${id}" must match [A-Za-z0-9._-]+`)
  if (typeof a?.dir !== 'string' || !a.dir.startsWith('/')) {
    errs.push(`arm "${id}": "dir" must be an absolute path`)
  }
  if (!Array.isArray(a?.entry) || a.entry.length === 0) {
    errs.push(`arm "${id}": "entry" needs at least one glob`)
  }
  if (a?.build !== undefined && typeof a.build.command !== 'string') {
    errs.push(`arm "${id}": "build.command" must be a string`)
  }
  return errs
}

function jobErrors(jobs: readonly Partial<JobSpec>[]): string[] {
  const errs: string[] = []
  const seen = new Set<string>()
  for (const job of jobs) {
    const label = job?.label
    if (typeof label !== 'string' || !LABEL_RE.test(label)) {
      errs.push(`job label "${label}" must match [A-Za-z0-9._-]+`)
    } else if (seen.has(label)) {
      errs.push(`duplicate job label "${label}"`)
    } else {
      seen.add(label)
    }
    if (typeof job?.command !== 'string' || !job.command.includes('{out}')) {
      errs.push(`job "${label}": "command" must write its result to {out}`)
    }
  }
  return errs
}

/** Validate a parsed jobs file; returns a list of problems (empty = valid). */
export function validateJobsFile(j: unknown): string[] {
  if (typeof j !== 'object' || j === null) return ['jobs file must be a JSON object']
  const f = j as Partial<JobsFile>
  const errs: string[] = []
  if (typeof f.name !== 'string' || !LABEL_RE.test(f.name)) {
    errs.push('"name" must match [A-Za-z0-9._-]+')
  }
  const arms = f.arms && typeof f.arms === 'object' ? Object.entries(f.arms) : []
  if (arms.length < 2) errs.push('"arms" needs at least two arms')
  for (const [id, a] of arms) errs.push(...armErrors(id, a))
  const jobs = Array.isArray(f.jobs) ? f.jobs : []
  if (jobs.length === 0) errs.push('"jobs" needs at least one job')
  errs.push(...jobErrors(jobs))
  for (const k of ['runs', 'passes'] as const) {
    const v = f[k]
    if (v !== undefined && (!Number.isInteger(v) || v < 1)) {
      errs.push(`"${k}" must be a positive integer`)
    }
  }
  return errs
}

export interface ScheduledJob {
  /** `<job>-<arm>-r<run>-p<pass>` — unique, stable across retries. */
  id: string
  job: string
  arm: string
  run: number
  /** Global pass index, 1-based, continuing across runs. */
  pass: number
}

/**
 * Strict interleaving. Runs → passes → jobs → arms; the arm order rotates by
 * one every pass (A,B / B,A / A,B … for two arms), so neither arm always runs
 * first after a pause and drift lands on both equally.
 */
export function expandSchedule(f: JobsFile): ScheduledJob[] {
  const arms = Object.keys(f.arms)
  const runs = f.runs ?? 2
  const passes = f.passes ?? 5
  const out: ScheduledJob[] = []
  for (let r = 1; r <= runs; r++) {
    for (let p = 1; p <= passes; p++) {
      const pass = (r - 1) * passes + p
      const rot = (pass - 1) % arms.length
      const order = [...arms.slice(rot), ...arms.slice(0, rot)]
      for (const job of f.jobs) {
        for (const arm of order) {
          out.push({ id: `${job.label}-${arm}-r${r}-p${pass}`, job: job.label, arm, run: r, pass })
        }
      }
    }
  }
  return out
}

/** Substitute `{out}`, `{pass}`, `{run}`, `{arm}` in a job command. */
export function renderCommand(
  command: string,
  v: { out: string; pass: number; run: number; arm: string },
): string {
  return command
    .replaceAll('{out}', v.out)
    .replaceAll('{pass}', String(v.pass))
    .replaceAll('{run}', String(v.run))
    .replaceAll('{arm}', v.arm)
}

// ─── Arm identity ────────────────────────────────────────────────────────────

/** Content hash over files (relative path + bytes), order-independent. */
export function hashFiles(
  files: readonly { path: string; content: Uint8Array | string }[],
): string {
  const h = createHash('sha256')
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    h.update(f.path)
    h.update('\0')
    h.update(f.content)
    h.update('\0')
  }
  return h.digest('hex').slice(0, 16)
}

/**
 * Arms must be different builds. Returns the groups of arms that share a hash
 * (empty = all distinct).
 */
export function identicalArms(hashes: Record<string, string>): string[][] {
  const by = new Map<string, string[]>()
  for (const [arm, h] of Object.entries(hashes)) by.set(h, [...(by.get(h) ?? []), arm])
  return [...by.values()].filter((g) => g.length > 1)
}

// ─── Deadline ────────────────────────────────────────────────────────────────

/**
 * Resolve a deadline spec to an absolute epoch-ms timestamp, ONCE, at start:
 *  - `+90m`, `+2h`, `+1h30m`, `+45s` — relative to `now`;
 *  - `HH:MM` — the NEXT occurrence of that local wall-clock time after `now`
 *    (a queue started at 23:50 with `07:30` stops at 07:30 tomorrow; one
 *    started at 01:13 with `14:30` stops at 14:30 today);
 *  - anything `Date` parses with a date part (`2026-11-26T07:30`, ISO with
 *    offset) — taken literally.
 * Comparing a time-of-day STRING to `date +%H:%M`, as the ad-hoc queues did,
 * never fires for a run started after the cut-off's string value and breaks
 * across midnight; an absolute timestamp has neither problem.
 */
export function resolveDeadline(spec: string, now: Date): number {
  const s = spec.trim()
  const rel = /^\+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s)
  if (rel && (rel[1] || rel[2] || rel[3])) {
    const ms = (Number(rel[1] ?? 0) * 3600 + Number(rel[2] ?? 0) * 60 + Number(rel[3] ?? 0)) * 1000
    return now.getTime() + ms
  }
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (hm) {
    const h = Number(hm[1])
    const m = Number(hm[2])
    if (h > 23 || m > 59) throw new Error(`[bench-ab] invalid time of day "${spec}"`)
    const d = new Date(now.getTime())
    d.setHours(h, m, 0, 0)
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s)
    if (!Number.isNaN(t)) return t
  }
  throw new Error(
    `[bench-ab] unrecognised deadline "${spec}" — use +2h30m, HH:MM or an ISO date-time`,
  )
}

export function pastDeadline(deadlineMs: number | null, nowMs: number): boolean {
  return deadlineMs !== null && nowMs >= deadlineMs
}

// ─── Cross-session lock ──────────────────────────────────────────────────────

/** File-system operations the lock needs, injectable for tests. */
export interface LockFs {
  /** Create `path` with `content` atomically; throw `EEXIST` if it exists. */
  createExclusive(path: string, content: string): void
  /** File content, or null when the file does not exist. */
  read(path: string): string | null
  /** Inode-like identity of the file, or null when it does not exist. */
  identity(path: string): string | null
  /** Atomic rename; throws if `from` is missing. */
  rename(from: string, to: string): void
  /** Hard-link `from` to `to`; throws `EEXIST` if `to` exists. */
  link(from: string, to: string): void
  unlink(path: string): void
}

/**
 * The pid a lock names: the LAST whitespace-separated token of its first line
 * (`<owner> <pid>` — the format every queue on this machine has written), or
 * null when it is not a positive integer.
 */
export function lockPid(content: string): number | null {
  const first = content.split('\n')[0]?.trim() ?? ''
  const tok = first.split(/\s+/).pop() ?? ''
  if (!/^\d+$/.test(tok)) return null
  const n = Number(tok)
  return n > 0 ? n : null
}

export type LockAttempt =
  | { acquired: true; reclaimed: { content: string } | null }
  | { acquired: false; holder: string; reason: 'held' | 'held-unknown-pid' }

/**
 * Try once to take the lock.
 *
 * Creation is atomic (`O_EXCL`). A lock that exists is reclaimed ONLY when the
 * pid it names is provably dead (`isAlive(pid) === false`); a live pid, or a
 * lock whose pid cannot be parsed, is never touched. Reclaim is race-safe
 * between two reclaimers: the stale file is renamed aside and its identity
 * compared with the one inspected; if another session already replaced it
 * with a fresh lock, that fresh lock is linked back and left alone.
 */
export function tryAcquireLock(
  fs: LockFs,
  path: string,
  content: string,
  isAlive: (pid: number) => boolean,
  tmpSuffix: string,
): LockAttempt {
  try {
    fs.createExclusive(path, content)
    return { acquired: true, reclaimed: null }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
  }
  const holder = fs.read(path)
  const id = fs.identity(path)
  if (holder === null || id === null) {
    // Released between our create and read — try once more.
    try {
      fs.createExclusive(path, content)
      return { acquired: true, reclaimed: null }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      return { acquired: false, holder: fs.read(path) ?? '', reason: 'held' }
    }
  }
  const pid = lockPid(holder)
  if (pid === null) return { acquired: false, holder, reason: 'held-unknown-pid' }
  if (isAlive(pid)) return { acquired: false, holder, reason: 'held' }
  // Stale: move it aside, then confirm we moved the file we inspected.
  const aside = `${path}.stale-${tmpSuffix}`
  try {
    fs.rename(path, aside)
  } catch {
    return { acquired: false, holder, reason: 'held' }
  }
  if (fs.identity(aside) !== id) {
    // We grabbed someone's fresh lock; put it back (fails only if a third lock now exists).
    try {
      fs.link(aside, path)
    } catch {
      /* a newer lock exists; the one we moved is superseded either way */
    }
    fs.unlink(aside)
    return { acquired: false, holder: fs.read(path) ?? holder, reason: 'held' }
  }
  fs.unlink(aside)
  try {
    fs.createExclusive(path, content)
    return { acquired: true, reclaimed: { content: holder } }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    return { acquired: false, holder: fs.read(path) ?? '', reason: 'held' }
  }
}

/** Release only a lock whose content is exactly ours. Returns whether it was removed. */
export function releaseLock(fs: LockFs, path: string, content: string): boolean {
  if (fs.read(path) !== content) return false
  fs.unlink(path)
  return true
}

// ─── Load sampling and run validity ──────────────────────────────────────────

export interface LoadSample {
  /** Epoch ms. */
  t: number
  load1: number
}

/** Shortest allowed sampling interval. */
export const MIN_SAMPLE_INTERVAL_MS = 1000
/** Timer jitter tolerated on top of the required gap (event-loop delay, `ps`). */
export const SAMPLE_JITTER_MS = 500

/**
 * The densest gap the validity rule accepts for a run of `durationMs`:
 * every `durationMs / 5`, but never required finer than once a second. The
 * runner samples every `MIN_SAMPLE_INTERVAL_MS`, which satisfies this for any
 * duration; the rule is what makes a sparse trace (the ad-hoc queues took ~2
 * samples of a 10 s job) INVALID instead of silently trusted.
 */
export function requiredGapMs(durationMs: number): number {
  return Math.max(MIN_SAMPLE_INTERVAL_MS, durationMs / 5)
}

export interface RunRecordInput {
  startedAt: number
  endedAt: number
  exitCode: number | null
  samples: readonly LoadSample[]
  maxLoad: number
  /** Foreign bench processes seen at any sample (see `foreignProcesses`). */
  foreign: readonly string[]
  expectedEntryHash: string
  entryHashAfter: string | null
}

/** Every reason the run is invalid; empty = VALID. */
export function runInvalidReasons(r: RunRecordInput): string[] {
  const out: string[] = []
  if (r.exitCode !== 0) out.push(`exit-${r.exitCode ?? 'signal'}`)
  const s = [...r.samples].sort((a, b) => a.t - b.t)
  if (s.length < 2) out.push('load-trace-too-short')
  else {
    const first = s[0] as LoadSample
    const last = s[s.length - 1] as LoadSample
    const gap = requiredGapMs(r.endedAt - r.startedAt) + SAMPLE_JITTER_MS
    if (first.t > r.startedAt + SAMPLE_JITTER_MS) out.push('no-load-sample-at-start')
    if (last.t < r.endedAt - SAMPLE_JITTER_MS) out.push('no-load-sample-at-end')
    for (let i = 1; i < s.length; i++) {
      const d = (s[i] as LoadSample).t - (s[i - 1] as LoadSample).t
      if (d > gap) {
        out.push(`load-sample-gap-${Math.round(d)}ms>${Math.round(gap)}ms`)
        break
      }
    }
  }
  const peak = s.reduce((m, x) => Math.max(m, x.load1), 0)
  if (peak >= r.maxLoad) out.push(`load1-peak-${peak.toFixed(2)}>=${r.maxLoad}`)
  if (r.foreign.length > 0) out.push(`foreign-bench:${[...new Set(r.foreign)].join(';')}`)
  if (r.entryHashAfter === null) out.push('entry-missing-after-run')
  else if (r.entryHashAfter !== r.expectedEntryHash) {
    out.push(`entry-changed:${r.expectedEntryHash}->${r.entryHashAfter}`)
  }
  return out
}

/**
 * Quiet-stretch tracker: the time load has stayed below `maxLoad` without a
 * break, from every sample the runner takes (while waiting AND while a job
 * runs, so a VALID run leaves the stretch unbroken).
 */
export function quietSince(samples: readonly LoadSample[], maxLoad: number): number | null {
  let since: number | null = null
  for (const s of samples) {
    if (s.load1 >= maxLoad) since = null
    else if (since === null) since = s.t
  }
  return since
}

// ─── Foreign processes ───────────────────────────────────────────────────────

export interface PsRow {
  pid: number
  ppid: number
  command: string
}

/** Parse `ps -axo pid=,ppid=,command=`. */
export function parsePs(out: string): PsRow[] {
  const rows: PsRow[] = []
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] as string })
  }
  return rows
}

/**
 * Default definition of a FOREIGN BENCH: a process running one of the repo's
 * timing drivers or a session's ad-hoc timing script. Any such process outside
 * this runner's own process tree makes the run INVALID: two benches on one
 * machine compete for cores and caches even when the load average stays low.
 * Builds, test suites and simulators are NOT on this list — their cost shows
 * up in the load average, which the load rule already gates on.
 */
export const DEFAULT_FOREIGN_PATTERNS: readonly string[] = [
  'bench-fair\\.ts',
  'bench-scenarios\\.ts',
  'bench-crossover\\.ts',
  'bench-hydration[\\w-]*\\.ts',
  'bench-apppage[\\w-]*\\.ts',
  'bench-ssr\\.ts',
  'bench-tree\\w*\\.ts',
  'bench-\\w*profile\\.ts',
  'scripts/bench/core/\\w+\\.ts',
  'scripts/bench/dom(-micro)?\\.ts',
  'scripts/bench/ab/run\\.ts',
  'treeheap',
  'mlheap',
]

/**
 * Processes matching `patterns` that are NOT `selfPid` or one of its
 * descendants. Returns `"<pid> <command>"` strings (command truncated).
 */
export function foreignProcesses(
  rows: readonly PsRow[],
  selfPid: number,
  patterns: readonly string[],
): string[] {
  const children = new Map<number, number[]>()
  for (const r of rows) children.set(r.ppid, [...(children.get(r.ppid) ?? []), r.pid])
  const own = new Set<number>([selfPid])
  // Ancestors too: the shell or `caffeinate` that launched this runner carries
  // its command line.
  const parent = new Map(rows.map((r) => [r.pid, r.ppid]))
  for (let p = parent.get(selfPid); p !== undefined && p > 0 && !own.has(p); p = parent.get(p)) {
    own.add(p)
  }
  const stack = [selfPid]
  while (stack.length > 0) {
    for (const c of children.get(stack.pop() as number) ?? []) {
      if (!own.has(c)) {
        own.add(c)
        stack.push(c)
      }
    }
  }
  const re = new RegExp(patterns.join('|'))
  return rows
    .filter((r) => !own.has(r.pid) && re.test(r.command) && !/\bps -axo\b/.test(r.command))
    .map((r) => `${r.pid} ${r.command.slice(0, 120)}`)
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/** Rows (op × framework) → clusters (page loads or processes) of samples. */
export type RowClusters = Map<string, number[][]>

/**
 * Extract per-row clusters from one job's output, whatever harness wrote it:
 *  - `bench-scenarios.ts --raw-out`: `{ clusters: [key, number[][]][] }`,
 *    key `scenario\0op\0framework`;
 *  - `bench-fair.ts --json`: `{ suites: [{ framework, results: [{ name, samples, pages }] }] }`,
 *    samples page-major;
 *  - `scripts/bench/core/reactivity.ts --json`: `{ sections: { id: [{ lib, processes }] } }`.
 * Returns the clusters and whether the samples are window averages (micro),
 * whose resolution is not a clock quantum.
 */
export function extractClusters(json: unknown): { rows: RowClusters; windowAveraged: boolean } {
  const rows: RowClusters = new Map()
  const j = json as Record<string, unknown>
  if (Array.isArray(j.clusters)) {
    for (const [k, v] of j.clusters as [string, number[][]][]) {
      const [sc, op, fw] = k.split('\u0000')
      rows.set(`${sc} · ${op} · ${fw}`, [...(rows.get(`${sc} · ${op} · ${fw}`) ?? []), ...v])
    }
    return { rows, windowAveraged: false }
  }
  if (Array.isArray(j.suites)) {
    for (const s of j.suites as {
      framework: string
      results: { name: string; samples: number[]; pages?: number }[]
    }[]) {
      for (const r of s.results) {
        const pages = r.pages ?? 1
        const n = r.samples.length / pages
        if (!Number.isInteger(n)) {
          throw new Error(
            `[bench-ab] ${s.framework}/${r.name}: ${r.samples.length} samples do not split into ${pages} pages`,
          )
        }
        const cl: number[][] = []
        for (let i = 0; i < pages; i++) cl.push(r.samples.slice(i * n, (i + 1) * n))
        const key = `${r.name} · ${s.framework}`
        rows.set(key, [...(rows.get(key) ?? []), ...cl])
      }
    }
    return { rows, windowAveraged: false }
  }
  if (j.sections && typeof j.sections === 'object') {
    for (const [id, stats] of Object.entries(
      j.sections as Record<string, { lib: string; processes?: number[][] }[]>,
    )) {
      for (const st of stats) {
        if (!st.processes) {
          throw new Error(
            `[bench-ab] micro JSON for ${id}/${st.lib} has no per-process samples (pre-cluster-bootstrap harness)`,
          )
        }
        const key = `${id} · ${st.lib}`
        rows.set(key, [...(rows.get(key) ?? []), ...st.processes])
      }
    }
    return { rows, windowAveraged: true }
  }
  throw new Error(
    '[bench-ab] unrecognised result JSON (expected bench-scenarios --raw-out, bench-fair --json or reactivity --json)',
  )
}

/**
 * The resolution observed in a row: the smallest positive difference between
 * two distinct sample values (rounded to 1 ns of ms). For a per-op Chromium row
 * that is the clock quantum (5 µs isolated, 100 µs clamped); for a batch row
 * (region / K) it is far finer, as it should be. `Infinity` with fewer than
 * two distinct values.
 */
export function observedQuantum(samples: readonly number[]): number {
  const u = [...new Set(samples.map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b)
  let q = Number.POSITIVE_INFINITY
  for (let i = 1; i < u.length; i++) q = Math.min(q, (u[i] as number) - (u[i - 1] as number))
  return q
}

export interface Cell {
  median: number
  ci: [number, number]
  /** Pooled CV as a fraction. */
  cv: number
  n: number
  clusters: number
  /** median ÷ observed quantum; `Infinity` for window-averaged micro rows. */
  quanta: number
}

export function cellOf(clusters: readonly (readonly number[])[], windowAveraged: boolean): Cell {
  const nonEmpty = clusters.filter((c) => c.length > 0)
  const all = nonEmpty.flat()
  const mean = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length)
  const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, all.length - 1))
  const median = medianOf(all)
  const q = observedQuantum(all)
  return {
    median,
    ci: clusterBootstrapCI95(nonEmpty, { resamples: 1000 }),
    cv: mean > 0 ? sd / mean : 0,
    n: all.length,
    clusters: nonEmpty.length,
    quanta: windowAveraged ? Number.POSITIVE_INFINITY : Number.isFinite(q) ? median / q : 0,
  }
}

export type RunVerdict = 'B faster' | 'B slower' | 'tie'
export type FinalVerdict = 'WIN' | 'LOSS' | 'TIE' | 'NO VERDICT'

/** One run: disjoint CIs → a direction, otherwise a tie. B is the candidate. */
export function runVerdict(a: Cell, b: Cell): RunVerdict {
  if (b.ci[1] < a.ci[0]) return 'B faster'
  if (b.ci[0] > a.ci[1]) return 'B slower'
  return 'tie'
}

/** Below this many clock quanta a row's median is not a measurement. */
export const MIN_QUANTA = 10

/**
 * The guide's verdict rule, from B's (the candidate's) side:
 *  - fewer than 2 runs, or any cell of any run under `MIN_QUANTA` → NO VERDICT;
 *  - CIs disjoint in the same direction in EVERY run → WIN (B faster) / LOSS;
 *  - anything else (overlap in any run, or runs disagreeing) → TIE.
 */
export function finalVerdict(runs: readonly { a: Cell; b: Cell }[]): {
  verdict: FinalVerdict
  why: string
} {
  if (runs.length < 2) {
    return { verdict: 'NO VERDICT', why: `${runs.length} run(s); a verdict needs two` }
  }
  const low = runs.find((r) => Math.min(r.a.quanta, r.b.quanta) < MIN_QUANTA)
  if (low) {
    return {
      verdict: 'NO VERDICT',
      why: `${Math.min(low.a.quanta, low.b.quanta).toFixed(1)} clock quanta < ${MIN_QUANTA}`,
    }
  }
  const vs = runs.map((r) => runVerdict(r.a, r.b))
  if (vs.every((v) => v === 'B faster')) {
    return { verdict: 'WIN', why: 'B faster, CIs disjoint in every run' }
  }
  if (vs.every((v) => v === 'B slower')) {
    return { verdict: 'LOSS', why: 'B slower, CIs disjoint in every run' }
  }
  return {
    verdict: 'TIE',
    why: vs.some((v) => v !== 'tie') ? `split: ${vs.join(' / ')}` : 'CIs overlap in every run',
  }
}
