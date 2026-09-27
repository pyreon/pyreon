/**
 * Build-time cron validation + expansion for `export const schedule` on API
 * route files.
 *
 * The accepted grammar is deliberately the INTERSECTION of what every
 * supported platform accepts, so a schedule that validates here deploys
 * identically everywhere:
 *
 *   - exactly five space-separated fields: minute hour day-of-month month
 *     day-of-week
 *   - each field: `*`, a number, a range `a-b`, a step `*\/n` or `a-b/n`, or
 *     a comma list of those
 *   - numeric values only — NO month/weekday names (`JAN`, `MON`) and no
 *     macros (`@hourly`): Vercel rejects both, so accepting them here would
 *     move the failure from the build to the deploy
 *   - day-of-week `0`–`7` (both `0` and `7` are Sunday, normalised to `0`)
 *
 * Everything is UTC — the platforms all evaluate cron in UTC, and so does the
 * node/bun in-process scheduler.
 */

/** A validated schedule, expanded to the concrete values each field matches. */
export interface ParsedCron {
  readonly expression: string
  readonly minute: readonly number[]
  readonly hour: readonly number[]
  readonly dayOfMonth: readonly number[]
  readonly month: readonly number[]
  readonly dayOfWeek: readonly number[]
  /** Whether day-of-month / day-of-week were restricted (not `*`) — cron's OR rule. */
  readonly domRestricted: boolean
  readonly dowRestricted: boolean
}

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day-of-week', min: 0, max: 7 },
] as const

function expandField(raw: string, field: (typeof FIELDS)[number]): number[] {
  const values = new Set<number>()
  for (const part of raw.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part)
    if (!m) {
      throw new Error(
        `[Pyreon] cron ${field.name} field "${raw}" is not valid (use a number, *, a-b, */n or a-b/n; names like MON/JAN are not portable across platforms)`,
      )
    }
    const step = m[4] !== undefined ? Number(m[4]) : 1
    if (step < 1) throw new Error(`[Pyreon] cron ${field.name} step must be >= 1 (got "${part}")`)
    let lo: number
    let hi: number
    if (m[1] === '*') {
      lo = field.min
      hi = field.max
    } else {
      lo = Number(m[2])
      hi = m[3] !== undefined ? Number(m[3]) : m[4] !== undefined ? field.max : lo
    }
    if (lo < field.min || hi > field.max || lo > hi) {
      throw new Error(`[Pyreon] cron ${field.name} value "${part}" is out of range ${field.min}-${field.max}`)
    }
    for (let v = lo; v <= hi; v += step) values.add(field.name === 'day-of-week' && v === 7 ? 0 : v)
  }
  return [...values].sort((a, b) => a - b)
}

/**
 * Parse and validate a cron expression. Throws an `Error` whose message
 * explains the first problem found (callers prefix it with the route file).
 *
 * @example
 * parseCron('0 0-23/6 * * *') // every 6 hours, UTC
 */
export function parseCron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(
      `[Pyreon] cron expected 5 fields (minute hour day-of-month month day-of-week), got ${parts.length}${expression.trim().startsWith('@') ? ' — macros like @hourly are not portable, write "0 * * * *"' : ''}`,
    )
  }
  const [minute, hour, dom, month, dow] = parts.map((p, i) => expandField(p, FIELDS[i]!))
  return {
    expression: parts.join(' '),
    minute: minute!,
    hour: hour!,
    dayOfMonth: dom!,
    month: month!,
    dayOfWeek: dow!,
    domRestricted: parts[2] !== '*',
    dowRestricted: parts[4] !== '*',
  }
}

/**
 * Whether `date` (evaluated in UTC, to the minute) matches `cron`. Standard
 * cron semantics: when BOTH day-of-month and day-of-week are restricted, a
 * day matches if EITHER does.
 */
export function cronMatches(cron: ParsedCron, date: Date): boolean {
  if (!cron.minute.includes(date.getUTCMinutes())) return false
  if (!cron.hour.includes(date.getUTCHours())) return false
  if (!cron.month.includes(date.getUTCMonth() + 1)) return false
  const domOk = cron.dayOfMonth.includes(date.getUTCDate())
  const dowOk = cron.dayOfWeek.includes(date.getUTCDay())
  if (cron.domRestricted && cron.dowRestricted) return domOk || dowOk
  return domOk && dowOk
}

/**
 * The in-process scheduler the node / bun runners embed when the adapter is
 * created with `{ scheduler: true }`. Plain JavaScript (the runner is emitted
 * source, not bundled), so it carries its own copy of `cronMatches` — kept
 * byte-for-byte equivalent by a differential test that evaluates THIS string
 * against the TypeScript function over a sweep of dates.
 *
 * `jobs` are build-time-expanded `ParsedCron`s plus the path to GET. The
 * timer re-arms to the next minute boundary each tick (no drift accumulation)
 * and is `unref`'d so it never keeps a process alive on its own. A job whose
 * previous run is still in flight is skipped for that minute, not stacked.
 */
export const SCHEDULER_RUNTIME = `function __pyreonCronMatches(cron, date) {
  if (!cron.minute.includes(date.getUTCMinutes())) return false
  if (!cron.hour.includes(date.getUTCHours())) return false
  if (!cron.month.includes(date.getUTCMonth() + 1)) return false
  const domOk = cron.dayOfMonth.includes(date.getUTCDate())
  const dowOk = cron.dayOfWeek.includes(date.getUTCDay())
  if (cron.domRestricted && cron.dowRestricted) return domOk || dowOk
  return domOk && dowOk
}

function __pyreonStartScheduler(jobs, run) {
  const running = new Set()
  const tick = () => {
    const now = new Date()
    for (const job of jobs) {
      if (running.has(job.path) || !__pyreonCronMatches(job, now)) continue
      running.add(job.path)
      Promise.resolve()
        .then(() => run(job.path))
        .then((res) => { if (res && !res.ok) console.error("[Pyreon] scheduled " + job.path + " answered", res.status) })
        .catch((err) => console.error("[Pyreon] scheduled " + job.path + " failed:", err))
        .finally(() => running.delete(job.path))
    }
    arm()
  }
  const arm = () => {
    const t = setTimeout(tick, 60000 - (Date.now() % 60000))
    if (typeof t === "object" && t && typeof t.unref === "function") t.unref()
  }
  arm()
}
`

/** Serialise schedules for embedding in an emitted runner. */
export function serializeJobs(
  schedules: readonly { path: string; cron: ParsedCron }[],
): string {
  return JSON.stringify(
    schedules.map(({ path, cron }) => ({
      path,
      minute: cron.minute,
      hour: cron.hour,
      dayOfMonth: cron.dayOfMonth,
      month: cron.month,
      dayOfWeek: cron.dayOfWeek,
      domRestricted: cron.domRestricted,
      dowRestricted: cron.dowRestricted,
    })),
  )
}
