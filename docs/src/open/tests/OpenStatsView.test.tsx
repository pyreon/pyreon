import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { OpenStatsView, UNAVAILABLE } from '../OpenStatsView'
import type { OpenStats, Stat } from '../stats'

const down: Stat<never> = { ok: false, reason: 'rate-limited' }

const allDown: OpenStats = {
  generatedAt: '2026-11-10T00:07:00.000Z',
  github: {
    stars: down,
    forks: down,
    openIssues: down,
    closedIssues: down,
    mergedPrs: down,
    contributors: down,
    latestRelease: down,
  },
  npm: {
    packages: ['@pyreon/core', '@pyreon/zero', '@pyreon/create-zero'].map((name) => ({ name, weekly: down, monthly: down })),
    trend: down,
  },
  repo: down,
}

const ok = <T,>(value: T): Stat<T> => ({ ok: true, value })

const allUp: OpenStats = {
  generatedAt: '2026-11-10T00:07:00.000Z',
  github: {
    stars: ok(1234),
    forks: ok(56),
    openIssues: ok(11),
    closedIssues: ok(210),
    mergedPrs: ok(4100),
    contributors: ok(17),
    latestRelease: ok({ tag: 'v0.53.0', date: '2026-10-13T08:24:31Z', url: 'https://github.com/pyreon/pyreon/releases/tag/v0.53.0' }),
  },
  npm: {
    packages: [{ name: '@pyreon/core', weekly: ok(273), monthly: ok(1980) }],
    trend: ok({ label: '@pyreon/core', points: [{ week: '2026-11-03', downloads: 273 }] }),
  },
  repo: ok({ publishedPackages: 77, lintRules: 133, lintCategories: 25, mcpTools: 24, docPages: 223, testFiles: 3805 }),
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('OpenStatsView', () => {
  it('renders every missing number as unavailable, never as zero', async () => {
    const html = await renderToString(h(OpenStatsView, { stats: allDown }))
    const text = textOf(html)
    // 7 GitHub tiles + 3 npm tiles + 5 repo tiles, and the chart's notice.
    expect(text.split(UNAVAILABLE).length - 1).toBe(16)
    expect(html).not.toMatch(/open-tile__value">0</)
    expect(text).toContain('Last updated 10 November 2026, 00:07 UTC')
    expect(text).toContain('Download history is unavailable right now')
  })

  it('renders the numbers it has', async () => {
    const text = textOf(await renderToString(h(OpenStatsView, { stats: allUp })))
    for (const shown of ['1,234', '4,100', 'v0.53.0', '13 October 2026', '273', '1,980 in the last 30 days', '133', 'in 25 categories', '3,805']) {
      expect(text).toContain(shown)
    }
    expect(text).not.toContain(UNAVAILABLE)
  })
})
