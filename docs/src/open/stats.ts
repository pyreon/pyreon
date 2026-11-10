/**
 * Live project numbers for `/open`, fetched once per build.
 *
 * Everything here is pure: the network is the `fetch` the caller passes in,
 * and every number comes back as a `Stat` that is either a value or the
 * reason it is missing. A source that is down, slow or rate-limited costs
 * that one number, never the build, and never shows up as a zero.
 */

/** A number we either have, or say plainly that we do not. */
export type Stat<T> = { ok: true; value: T } | { ok: false; reason: string }

export interface Release {
  tag: string
  date: string
  url: string
}

export interface GithubStats {
  stars: Stat<number>
  forks: Stat<number>
  openIssues: Stat<number>
  closedIssues: Stat<number>
  mergedPrs: Stat<number>
  contributors: Stat<number>
  latestRelease: Stat<Release>
}

export interface PackageDownloads {
  name: string
  weekly: Stat<number>
  monthly: Stat<number>
}

export interface WeekPoint {
  /** First day of the week, `YYYY-MM-DD`. */
  week: string
  downloads: number
}

export interface Trend {
  label: string
  points: WeekPoint[]
}

export interface NpmStats {
  /** The headline packages, in display order. */
  packages: PackageDownloads[]
  /** Weekly downloads of `@pyreon/core` over the last 26 weeks. */
  trend: Stat<Trend>
}

export interface RepoStats {
  publishedPackages: number
  lintRules: number
  lintCategories: number
  mcpTools: number
  docPages: number
  testFiles: number
}

export interface OpenStats {
  /** ISO timestamp of the build that fetched these numbers. */
  generatedAt: string
  github: GithubStats
  npm: NpmStats
  repo: Stat<RepoStats>
}

export const REPO = 'pyreon/pyreon'
/**
 * The packages whose downloads the page shows. Deliberately few: the npm
 * downloads API rate-limits an address after a handful of requests (measured:
 * about five in a burst, then HTTP 429), and scoped packages cannot be
 * batched, so a total over every `@pyreon/*` package would cost one request
 * per package and fail more often than not.
 */
export const HEADLINE_PACKAGES = ['@pyreon/core', '@pyreon/zero', '@pyreon/create-zero'] as const
/** The package the trend chart follows: every Pyreon app depends on it. */
export const TREND_PACKAGE = '@pyreon/core'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface FetchOptions {
  fetch: Fetch
  /** GitHub token. Optional: public reads work without one, at a lower rate limit. */
  githubToken?: string | undefined
  /** Per-request timeout. */
  timeoutMs?: number
  /** Waits between retries of a rate-limited request, in ms. */
  retryDelaysMs?: readonly number[]
  now?: () => Date
}

const unavailable = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })

/** The value of a stat, or `undefined` — for display code that only needs one branch. */
export function valueOf<T>(stat: Stat<T>): T | undefined {
  return stat.ok ? stat.value : undefined
}

function reasonOf(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timed out'
    return error.message
  }
  return String(error)
}

async function getJson(
  fetchFn: Fetch,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
  const text = await response.text()
  let body: unknown = null
  try {
    body = JSON.parse(text)
  } catch {
    // A non-JSON body (an HTML error page from a proxy) is just "no body".
  }
  return { status: response.status, body, headers: response.headers }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberField(body: unknown, key: string): number | undefined {
  if (!isRecord(body)) return undefined
  const value = body[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function httpReason(status: number): string {
  if (status === 403 || status === 429) return 'rate-limited'
  return `HTTP ${status}`
}

/** Run a request again after each delay while it is rate-limited or failing server-side. */
async function withRetry(
  options: FetchOptions,
  run: () => Promise<{ status: number; body: unknown; headers: Headers }>,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const delays = options.retryDelaysMs ?? [2_000, 5_000]
  for (let attempt = 0; ; attempt++) {
    let res: { status: number; body: unknown; headers: Headers } | undefined
    try {
      res = await run()
    } catch (error) {
      // A dropped connection or a body cut off by the timeout: worth one more try.
      if (attempt >= delays.length) throw error
    }
    if (res) {
      const retryable = res.status === 403 || res.status === 429 || res.status >= 500
      if (!retryable || attempt >= delays.length) return res
    }
    await new Promise((r) => setTimeout(r, delays[attempt]))
  }
}

// ── GitHub ────────────────────────────────────────────────────────────────

export async function fetchGithubStats(options: FetchOptions): Promise<GithubStats> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pyreon-docs-open-stats',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (options.githubToken) headers.Authorization = `Bearer ${options.githubToken}`
  const api = 'https://api.github.com'

  const settle = async <T>(work: () => Promise<Stat<T>>): Promise<Stat<T>> => {
    try {
      return await work()
    } catch (error) {
      return unavailable(reasonOf(error))
    }
  }

  const repo = settle(async () => {
    const res = await withRetry(options, () => getJson(options.fetch, `${api}/repos/${REPO}`, headers, timeoutMs))
    if (res.status !== 200) return unavailable(httpReason(res.status))
    return { ok: true as const, value: res.body }
  })
  const fromRepo = async (key: string): Promise<Stat<number>> => {
    const r = await repo
    if (!r.ok) return r
    const value = numberField(r.value, key)
    return value === undefined ? unavailable(`no ${key} in the response`) : { ok: true, value }
  }

  // The search API allows 10 unauthenticated requests a minute and rejects
  // bursts, so the three searches run one after another, each retried once.
  const searchCount = (query: string): Promise<Stat<number>> =>
    settle(async () => {
      const q = encodeURIComponent(`repo:${REPO} ${query}`)
      const res = await withRetry(options, () =>
        getJson(options.fetch, `${api}/search/issues?q=${q}&per_page=1`, headers, timeoutMs),
      )
      if (res.status !== 200) return unavailable(httpReason(res.status))
      const value = numberField(res.body, 'total_count')
      return value === undefined ? unavailable('no total_count in the response') : { ok: true, value }
    })
  const searches = (async () => {
    const openIssues = await searchCount('is:issue is:open')
    const closedIssues = await searchCount('is:issue is:closed')
    const mergedPrs = await searchCount('is:pr is:merged')
    return { openIssues, closedIssues, mergedPrs }
  })()

  const contributors = settle<number>(async () => {
    const res = await withRetry(options, () =>
      getJson(options.fetch, `${api}/repos/${REPO}/contributors?per_page=1&anon=false`, headers, timeoutMs),
    )
    if (res.status !== 200) return unavailable(httpReason(res.status))
    // One contributor per page: the `last` page number IS the count.
    const link = res.headers.get('link') ?? ''
    const last = /[?&]page=(\d+)>;\s*rel="last"/.exec(link)
    if (last?.[1]) return { ok: true, value: Number(last[1]) }
    if (Array.isArray(res.body)) return { ok: true, value: res.body.length }
    return unavailable('unexpected response')
  })

  const latestRelease = settle<Release>(async () => {
    const res = await withRetry(options, () =>
      getJson(options.fetch, `${api}/repos/${REPO}/releases/latest`, headers, timeoutMs),
    )
    if (res.status !== 200) return unavailable(httpReason(res.status))
    const body = res.body
    if (
      !isRecord(body) ||
      typeof body.tag_name !== 'string' ||
      typeof body.published_at !== 'string' ||
      typeof body.html_url !== 'string'
    ) {
      return unavailable('unexpected response')
    }
    return { ok: true, value: { tag: body.tag_name, date: body.published_at, url: body.html_url } }
  })

  const [stars, forks, counts, contributorCount, release] = await Promise.all([
    fromRepo('stargazers_count'),
    fromRepo('forks_count'),
    searches,
    contributors,
    latestRelease,
  ])
  return {
    stars,
    forks,
    ...counts,
    contributors: contributorCount,
    latestRelease: release,
  }
}

// ── npm ───────────────────────────────────────────────────────────────────

interface DailySeries {
  name: string
  days: { day: string; downloads: number }[]
}

/**
 * One package's daily downloads for the last year. A package npm has never
 * heard of (in the repo, not released yet) has had zero downloads — that is
 * a real value, not an outage.
 */
async function fetchDaily(options: FetchOptions, name: string): Promise<Stat<DailySeries>> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const url = `https://api.npmjs.org/downloads/range/last-year/${name}`
  try {
    const res = await withRetry(options, () =>
      getJson(options.fetch, url, { 'User-Agent': 'pyreon-docs-open-stats' }, timeoutMs),
    )
    if (res.status === 404) return { ok: true, value: { name, days: [] } }
    if (res.status !== 200) return unavailable(httpReason(res.status))
    if (!isRecord(res.body) || !Array.isArray(res.body.downloads)) return unavailable('unexpected response')
    const days: DailySeries['days'] = []
    for (const entry of res.body.downloads) {
      const downloads = numberField(entry, 'downloads')
      if (downloads === undefined || !isRecord(entry) || typeof entry.day !== 'string') {
        return unavailable('unexpected response')
      }
      days.push({ day: entry.day, downloads })
    }
    return { ok: true, value: { name, days } }
  } catch (error) {
    return unavailable(reasonOf(error))
  }
}

const sumLast = (days: DailySeries['days'], n: number): number =>
  days.slice(-n).reduce((sum, d) => sum + d.downloads, 0)

/** Sum a daily series into weeks ending on the last day npm has data for. */
export function weeklyTrend(days: DailySeries['days'], weeks: number): WeekPoint[] {
  const points: WeekPoint[] = []
  for (let w = 0; w < weeks; w++) {
    const end = days.length - w * 7
    const start = end - 7
    if (start < 0) break
    let total = 0
    for (let i = start; i < end; i++) total += days[i]!.downloads
    points.unshift({ week: days[start]!.day, downloads: total })
  }
  // Weeks before the first release are noise, not history.
  while (points.length > 0 && points[0]!.downloads === 0) points.shift()
  return points
}

export async function fetchNpmStats(options: FetchOptions): Promise<NpmStats> {
  // One request at a time: the API answers a burst with 429.
  const series = new Map<string, Stat<DailySeries>>()
  for (const name of HEADLINE_PACKAGES) series.set(name, await fetchDaily(options, name))

  const packages: PackageDownloads[] = HEADLINE_PACKAGES.map((name) => {
    const r = series.get(name)!
    if (!r.ok) return { name, weekly: r, monthly: r }
    return {
      name,
      weekly: { ok: true, value: sumLast(r.value.days, 7) },
      monthly: { ok: true, value: sumLast(r.value.days, 30) },
    }
  })

  const core = series.get(TREND_PACKAGE)!
  let trend: NpmStats['trend'] = core.ok
    ? { ok: true, value: { label: TREND_PACKAGE, points: weeklyTrend(core.value.days, 26) } }
    : unavailable(core.reason)
  if (trend.ok && trend.value.points.length === 0) trend = unavailable('no download history yet')

  return { packages, trend }
}

/** Every network-backed number on the page. Never throws. */
export async function fetchOpenStats(
  options: FetchOptions,
  repo: () => RepoStats,
): Promise<OpenStats> {
  const [github, npm] = await Promise.all([fetchGithubStats(options), fetchNpmStats(options)])
  let repoStats: Stat<RepoStats>
  try {
    repoStats = { ok: true, value: repo() }
  } catch (error) {
    repoStats = unavailable(reasonOf(error))
  }
  return { generatedAt: (options.now?.() ?? new Date()).toISOString(), github, npm, repo: repoStats }
}

// ── Display ───────────────────────────────────────────────────────────────

const numberFormat = new Intl.NumberFormat('en-US')

/** `12,345` — a fixed locale, so the prerendered HTML and hydration agree. */
export function formatCount(n: number): string {
  return numberFormat.format(n)
}

/** "10 November 2026" in UTC. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** "10 November 2026, 00:07 UTC". */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${formatDay(iso)}, ${time} UTC`
}
