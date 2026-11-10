import { describe, expect, it } from 'vitest'
import {
  fetchGithubStats,
  fetchNpmStats,
  fetchOpenStats,
  formatCount,
  formatTimestamp,
  HEADLINE_PACKAGES,
  type OpenStats,
  type RepoStats,
  weeklyTrend,
} from '../stats'

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

/** 40 days of downloads: day i has i downloads. */
const DAYS = Array.from({ length: 40 }, (_, i) => ({
  day: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
  downloads: i,
}))

const healthy: Route = (url) => {
  if (url.endsWith('/repos/pyreon/pyreon')) return json({ stargazers_count: 1234, forks_count: 56 })
  if (url.includes('/search/issues')) {
    const q = decodeURIComponent(url)
    if (q.includes('is:issue is:open')) return json({ total_count: 11 })
    if (q.includes('is:issue is:closed')) return json({ total_count: 210 })
    if (q.includes('is:pr is:merged')) return json({ total_count: 4100 })
  }
  if (url.includes('/contributors')) {
    return json([{ login: 'a' }], 200, {
      link: '<https://api.github.com/repositories/1/contributors?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/contributors?per_page=1&page=17>; rel="last"',
    })
  }
  if (url.endsWith('/releases/latest')) {
    return json({ tag_name: 'v0.53.0', published_at: '2026-10-13T08:24:31Z', html_url: 'https://github.com/pyreon/pyreon/releases/tag/v0.53.0' })
  }
  if (url.startsWith('https://api.npmjs.org/downloads/range/last-year/')) {
    return json({ package: url.split('/last-year/')[1], downloads: DAYS })
  }
  return json({ message: 'Not Found' }, 404)
}

const fetchOf = (route: Route) => {
  const calls: string[] = []
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push(url)
    return route(url, init)
  }
  return { fetch, calls }
}

const REPO: RepoStats = { publishedPackages: 77, lintRules: 133, lintCategories: 25, mcpTools: 24, docPages: 223, testFiles: 3800 }
const NO_WAIT = { retryDelaysMs: [0] }

describe('fetchOpenStats — every source answering', () => {
  it('reads each number from its source', async () => {
    const { fetch } = fetchOf(healthy)
    const stats = await fetchOpenStats({ fetch, ...NO_WAIT, now: () => new Date('2026-11-10T00:07:00Z') }, () => REPO)
    expect(stats.generatedAt).toBe('2026-11-10T00:07:00.000Z')
    expect(stats.github).toEqual({
      stars: { ok: true, value: 1234 },
      forks: { ok: true, value: 56 },
      openIssues: { ok: true, value: 11 },
      closedIssues: { ok: true, value: 210 },
      mergedPrs: { ok: true, value: 4100 },
      contributors: { ok: true, value: 17 },
      latestRelease: {
        ok: true,
        value: { tag: 'v0.53.0', date: '2026-10-13T08:24:31Z', url: 'https://github.com/pyreon/pyreon/releases/tag/v0.53.0' },
      },
    })
    // Last 7 days are 33..39, last 30 are 10..39.
    const week = 33 + 34 + 35 + 36 + 37 + 38 + 39
    const month = (10 + 39) * 15
    expect(stats.npm.packages.map((p) => p.name)).toEqual([...HEADLINE_PACKAGES])
    for (const p of stats.npm.packages) {
      expect(p.weekly).toEqual({ ok: true, value: week })
      expect(p.monthly).toEqual({ ok: true, value: month })
    }
    expect(stats.npm.trend.ok).toBe(true)
    expect(stats.repo).toEqual({ ok: true, value: REPO })
  })

  it('sends the token only when it has one', async () => {
    const seen: (string | null)[] = []
    const fetch = async (url: string, init?: RequestInit) => {
      if (url.includes('api.github.com')) seen.push(new Headers(init?.headers).get('authorization'))
      return healthy(url, init)
    }
    await fetchGithubStats({ fetch, ...NO_WAIT })
    await fetchGithubStats({ fetch, githubToken: 'abc', ...NO_WAIT })
    expect(seen.slice(0, 6).every((h) => h === null)).toBe(true)
    expect(seen.slice(6).every((h) => h === 'Bearer abc')).toBe(true)
  })

  it('counts contributors from the body when there is only one page', async () => {
    const { fetch } = fetchOf((url, init) =>
      url.includes('/contributors') ? json([{ login: 'a' }, { login: 'b' }]) : healthy(url, init),
    )
    expect((await fetchGithubStats({ fetch, ...NO_WAIT })).contributors).toEqual({ ok: true, value: 2 })
  })

  it('treats a package npm has never heard of as zero downloads, not an outage', async () => {
    const { fetch } = fetchOf((url, init) =>
      url.endsWith('/@pyreon/create-zero') ? json({ error: 'package not found' }, 404) : healthy(url, init),
    )
    const npm = await fetchNpmStats({ fetch, ...NO_WAIT })
    expect(npm.packages[2]).toEqual({ name: '@pyreon/create-zero', weekly: { ok: true, value: 0 }, monthly: { ok: true, value: 0 } })
  })
})

describe('fetchOpenStats — failures never become zeros', () => {
  const expectAllUnavailable = (stats: OpenStats) => {
    for (const stat of Object.values(stats.github)) expect(stat.ok).toBe(false)
    for (const p of stats.npm.packages) {
      expect(p.weekly.ok).toBe(false)
      expect(p.monthly.ok).toBe(false)
    }
    expect(stats.npm.trend.ok).toBe(false)
  }

  it('survives a network that is down', async () => {
    const fetch = async () => {
      throw new TypeError('fetch failed')
    }
    const stats = await fetchOpenStats({ fetch, ...NO_WAIT }, () => REPO)
    expectAllUnavailable(stats)
    expect(stats.github.stars).toEqual({ ok: false, reason: 'fetch failed' })
    // The repo counts do not need the network.
    expect(stats.repo).toEqual({ ok: true, value: REPO })
  })

  it('reports a timeout as a timeout', async () => {
    const fetch = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    const stats = await fetchOpenStats({ fetch, timeoutMs: 5, ...NO_WAIT }, () => REPO)
    expectAllUnavailable(stats)
    expect(stats.github.forks).toEqual({ ok: false, reason: 'timed out' })
  })

  it('reports rate limits as rate-limited after retrying', async () => {
    const { fetch, calls } = fetchOf(() => json({ message: 'API rate limit exceeded' }, 403))
    const stats = await fetchOpenStats({ fetch, ...NO_WAIT }, () => REPO)
    expectAllUnavailable(stats)
    expect(stats.github.openIssues).toEqual({ ok: false, reason: 'rate-limited' })
    expect(stats.npm.packages[0]!.weekly).toEqual({ ok: false, reason: 'rate-limited' })
    // Each search and each npm package is tried twice: once, then one retry.
    expect(calls.filter((u) => u.includes('/search/issues'))).toHaveLength(6)
    expect(calls.filter((u) => u.includes('api.npmjs.org'))).toHaveLength(6)
  })

  it('recovers when a retry succeeds', async () => {
    let first = true
    const { fetch } = fetchOf((url, init) => {
      if (url.endsWith('/@pyreon/core') && first) {
        first = false
        return json({}, 429)
      }
      return healthy(url, init)
    })
    const npm = await fetchNpmStats({ fetch, ...NO_WAIT })
    expect(npm.packages[0]!.weekly.ok).toBe(true)
  })

  it('retries a response whose body is cut off', async () => {
    let first = true
    const { fetch } = fetchOf((url, init) => {
      if (url.endsWith('/releases/latest') && first) {
        first = false
        const stream = new ReadableStream({ start: (c) => c.error(new Error('body timed out')) })
        return new Response(stream, { status: 200 })
      }
      return healthy(url, init)
    })
    const gh = await fetchGithubStats({ fetch, ...NO_WAIT })
    expect(gh.latestRelease.ok).toBe(true)
  })

  it('rejects a malformed body instead of rendering garbage', async () => {
    const { fetch } = fetchOf((url) => {
      if (url.includes('api.npmjs.org')) return json({ downloads: [{ day: '2026-11-01', downloads: 'many' }] })
      if (url.endsWith('/repos/pyreon/pyreon')) return json({ stargazers_count: -1, forks_count: '3' })
      if (url.endsWith('/releases/latest')) return new Response('<html>oops</html>', { status: 200 })
      return json({})
    })
    const stats = await fetchOpenStats({ fetch, ...NO_WAIT }, () => REPO)
    expectAllUnavailable(stats)
  })

  it('reports one failing source without losing the others', async () => {
    const { fetch } = fetchOf((url, init) =>
      url.includes('api.github.com') ? json({ message: 'Server Error' }, 502) : healthy(url, init),
    )
    const stats = await fetchOpenStats({ fetch, ...NO_WAIT }, () => REPO)
    expect(stats.github.stars).toEqual({ ok: false, reason: 'HTTP 502' })
    expect(stats.npm.packages.every((p) => p.weekly.ok)).toBe(true)
  })

  it('reports repo counts that throw as unavailable', async () => {
    const { fetch } = fetchOf(healthy)
    const stats = await fetchOpenStats({ fetch, ...NO_WAIT }, () => {
      throw new Error('ENOENT: packages')
    })
    expect(stats.repo).toEqual({ ok: false, reason: 'ENOENT: packages' })
  })
})

describe('weeklyTrend', () => {
  it('sums whole weeks ending on the last day and drops weeks before the first download', () => {
    const days = [
      ...Array.from({ length: 10 }, (_, i) => ({ day: `2026-01-${String(i + 1).padStart(2, '0')}`, downloads: 0 })),
      ...Array.from({ length: 14 }, (_, i) => ({ day: `2026-01-${String(i + 11).padStart(2, '0')}`, downloads: 1 })),
    ]
    expect(weeklyTrend(days, 26)).toEqual([
      { week: '2026-01-11', downloads: 7 },
      { week: '2026-01-18', downloads: 7 },
    ])
  })

  it('is empty without data', () => {
    expect(weeklyTrend([], 26)).toEqual([])
  })
})

describe('formatting', () => {
  it('uses a fixed locale and UTC, so the prerender and hydration agree', () => {
    expect(formatCount(1234567)).toBe('1,234,567')
    expect(formatTimestamp('2026-11-10T00:07:31Z')).toBe('10 November 2026, 00:07 UTC')
  })
})
