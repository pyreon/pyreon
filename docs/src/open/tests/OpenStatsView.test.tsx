import { describe, expect, it } from 'vitest'
import { fill, OPEN_COPY } from '../../site/content/channels'
import { downloadTiles, fillHint, statOf, tileView } from '../model'
import type { OpenStats, Stat } from '../stats'

const down: Stat<never> = { ok: false, reason: 'rate-limited' }
const ok = <T,>(value: T): Stat<T> => ({ ok: true, value })

const allDown: OpenStats = {
  generatedAt: '2026-11-10T00:07:00.000Z',
  github: { stars: down, forks: down, openIssues: down, closedIssues: down, mergedPrs: down, contributors: down, commits: down, releases: down, latestRelease: down },
  npm: {
    packages: ['@pyreon/core', '@pyreon/zero', '@pyreon/create-zero'].map((name) => ({ name, weekly: down, monthly: down })),
    trend: down,
  },
  repo: down,
}

const allUp: OpenStats = {
  generatedAt: '2026-11-10T00:07:00.000Z',
  github: {
    stars: ok(1234),
    forks: ok(56),
    openIssues: ok(11),
    closedIssues: ok(210),
    mergedPrs: ok(4100),
    contributors: ok(17),
    commits: ok(3895),
    releases: ok(2004),
    latestRelease: ok({ tag: 'v0.53.0', date: '2026-10-13T08:24:31Z', url: 'https://github.com/pyreon/pyreon/releases/tag/v0.53.0' }),
  },
  npm: {
    packages: [{ name: '@pyreon/core', weekly: ok(273), monthly: ok(1980) }],
    trend: ok({ label: '@pyreon/core', points: [{ week: '2026-11-03', downloads: 273 }] }),
  },
  repo: ok({ publishedPackages: 77, lintRules: 133, lintCategories: 25, mcpTools: 24, docPages: 223, testFiles: 3805, browserTestFiles: 274 }),
}

const allTiles = [...OPEN_COPY.work.tiles, ...OPEN_COPY.community.tiles]

describe('/open model', () => {
  it('every missing number is unavailable (null), never zero, and keeps its reason', () => {
    const tiles = [...allTiles.map((t) => tileView(allDown, t)), ...downloadTiles(allDown, OPEN_COPY)]
    expect(tiles).toHaveLength(16)
    for (const t of tiles) {
      expect(t.value, t.label).toBeNull()
      expect(t.reason).toBe('rate-limited')
      // A hint that names a missing number is dropped, not printed half-filled.
      expect(t.hint).toBeUndefined()
    }
  })

  it('formats the numbers it has and fills the hints', () => {
    const byLabel = new Map(allTiles.map((t) => [t.label, tileView(allUp, t)]))
    const values = [...byLabel.values()].map((t) => t.value)
    for (const shown of ['1,234', '4,100', '3,895', '2,004', '133', '3,805']) expect(values).toContain(shown)
    const hints = [...byLabel.values()].map((t) => t.hint).filter(Boolean)
    expect(hints).toEqual(expect.arrayContaining(['Latest: v0.53.0, 13 October 2026', 'in 25 categories', '274 of them run in real Chromium']))
    const releases = [...byLabel.values()].find((t) => t.hint?.startsWith('Latest'))
    expect(releases?.href).toBe('https://github.com/pyreon/pyreon/releases/tag/v0.53.0')
    expect(downloadTiles(allUp, OPEN_COPY)[0]).toMatchObject({ value: '273', hint: '1,980 in the last 30 days' })
  })

  it('reads every stat id from its source', () => {
    for (const t of allTiles) expect(statOf(allUp, t.stat).ok, t.stat).toBe(true)
  })

  it('fillHint drops a hint whose value is missing and fill throws on an unknown placeholder', () => {
    expect(fillHint('in {n} categories', {})).toBeUndefined()
    expect(fillHint('in {n} categories', { n: '3' })).toBe('in 3 categories')
    expect(fillHint(undefined, {})).toBeUndefined()
    expect(() => fill('{missing}', {})).toThrow(/\{missing\}/)
  })
})
