/**
 * The assertion logic of `docs/scripts/lighthouse.ts` (the CI Lighthouse gate)
 * and the GitHub-Pages-shaped static server it measures through.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  CALIBRATION_BENCHMARK_INDEX,
  calibratedCpu,
  failingScoredAudits,
  type Lhr,
  median,
  METRIC_BUDGETS,
  performanceMedians,
  performanceProblems,
  strictProblems,
  STRICT_CATEGORIES,
} from '../../scripts/lighthouse'
import { resolvePagesPath, serveStatic } from '../../scripts/lighthouse-server'

function lhr(overrides: { categories?: Partial<Lhr['categories']>; audits?: Partial<Lhr['audits']> } = {}): Lhr {
  const audit = (id: string, score: number | null, scoreDisplayMode = 'binary', numericValue?: number) => ({
    id,
    title: id,
    score,
    scoreDisplayMode,
    ...(numericValue === undefined ? {} : { numericValue }),
  })
  const audits: Lhr['audits'] = {
    'first-contentful-paint': audit('first-contentful-paint', 1, 'numeric', 900),
    'largest-contentful-paint': audit('largest-contentful-paint', 1, 'numeric', 1000),
    'speed-index': audit('speed-index', 1, 'numeric', 1100),
    'total-blocking-time': audit('total-blocking-time', 1, 'numeric', 10),
    'cumulative-layout-shift': audit('cumulative-layout-shift', 1, 'numeric', 0.001),
    'llms-txt': audit('llms-txt', 1),
    'ard-schema': audit('ard-schema', 1, 'notApplicable'),
    'webmcp-form-coverage': audit('webmcp-form-coverage', 1, 'informative'),
    ...(overrides.audits as Lhr['audits']),
  }
  const categories: Lhr['categories'] = {
    performance: { id: 'performance', score: 1, auditRefs: [] },
    ...Object.fromEntries(
      STRICT_CATEGORIES.map((id) => [
        id,
        {
          id,
          score: 1,
          auditRefs: [
            { id: 'llms-txt', weight: 1 },
            { id: 'ard-schema', weight: 1 },
            { id: 'webmcp-form-coverage', weight: 1 },
            { id: 'cumulative-layout-shift', weight: 0 },
          ],
        },
      ]),
    ),
    ...(overrides.categories as Lhr['categories']),
  }
  return { finalDisplayedUrl: 'http://x/', categories, audits }
}

describe('lighthouse gate — strict categories', () => {
  it('passes a clean report', () => {
    expect(strictProblems(lhr())).toEqual([])
  })

  it('fails a category below 1 and names each failing scored audit', () => {
    const report = lhr({
      categories: {
        'agentic-browsing': {
          id: 'agentic-browsing',
          score: 0.67,
          auditRefs: [{ id: 'llms-txt', weight: 1 }],
        },
      },
      audits: { 'llms-txt': { id: 'llms-txt', title: 'llms.txt', score: 0, scoreDisplayMode: 'binary' } },
    })
    const problems = strictProblems(report)
    expect(problems).toContain('agentic-browsing: score 0.67 (must be 1)')
    expect(problems.some((p) => p.includes('"llms-txt"'))).toBe(true)
  })

  it('ignores not-applicable, informative and weight-0 audits', () => {
    const report = lhr({
      audits: {
        'webmcp-form-coverage': {
          id: 'webmcp-form-coverage',
          title: 't',
          score: 0,
          scoreDisplayMode: 'informative',
        },
      },
    })
    expect(failingScoredAudits(report, 'agentic-browsing')).toEqual([])
  })

  it('reports a category that is missing from the report (e.g. a Lighthouse upgrade renamed it)', () => {
    const report = lhr()
    delete report.categories.seo
    expect(strictProblems(report)).toContain('seo: category missing from the report')
  })
})

describe('lighthouse gate — performance on per-value medians', () => {
  const withPerf = (score: number, tbt: number) => {
    const r = lhr()
    r.categories.performance = { id: 'performance', score, auditRefs: [] }
    r.audits['total-blocking-time'] = { id: 'total-blocking-time', title: 't', score: 1, scoreDisplayMode: 'numeric', numericValue: tbt }
    return r
  }

  it('median of odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('passes inside every budget', () => {
    expect(performanceProblems(performanceMedians([lhr(), lhr(), lhr()]))).toEqual([])
  })

  it('one outlier run does not fail the gate; a majority does', () => {
    const outlier = withPerf(0.9, 400)
    expect(performanceProblems(performanceMedians([lhr(), outlier, lhr(), lhr(), lhr()]))).toEqual([])
    const problems = performanceProblems(performanceMedians([outlier, outlier, outlier, lhr(), lhr()]))
    expect(problems).toContain('performance: median score 0.9 (floor 1)')
    expect(problems.some((p) => p.includes('total-blocking-time 400 over its budget'))).toBe(true)
  })

  it('a metric missing from every run fails its budget', () => {
    const r = lhr()
    delete r.audits['speed-index']
    expect(performanceProblems(performanceMedians([r])).join()).toContain('speed-index')
  })

  it('every budget is enforced', () => {
    const over = lhr()
    for (const [id, budget] of Object.entries(METRIC_BUDGETS)) {
      over.audits[id] = { id, title: id, score: 0.5, scoreDisplayMode: 'numeric', numericValue: budget * 2 }
    }
    expect(performanceProblems(performanceMedians([over]))).toHaveLength(Object.keys(METRIC_BUDGETS).length)
  })
})

describe('lighthouse gate — CPU calibration', () => {
  it('scales 4× with the host benchmarkIndex, never below 4×', () => {
    expect(calibratedCpu(CALIBRATION_BENCHMARK_INDEX)).toBe(4)
    expect(calibratedCpu(CALIBRATION_BENCHMARK_INDEX * 2)).toBe(8)
    expect(calibratedCpu(3723)).toBe(8.5)
    expect(calibratedCpu(900)).toBe(4)
  })
})

describe('lighthouse gate — GitHub Pages path resolution', () => {
  const root = mkdtempSync(join(tmpdir(), 'lh-pages-'))
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'index.html'), '<h1>home</h1>')
  writeFileSync(join(root, 'docs', 'index.html'), '<h1>docs</h1>')
  writeFileSync(join(root, 'page.html'), 'page')
  writeFileSync(join(root, '404.html'), 'missing')
  writeFileSync(join(root, 'llms.txt'), '# T')
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('serves dir/index.html, redirects a slashless directory, falls back to .html and 404.html', () => {
    expect(resolvePagesPath(root, '/')).toEqual({ file: join(root, 'index.html'), status: 200 })
    expect(resolvePagesPath(root, '/docs/')).toEqual({ file: join(root, 'docs', 'index.html'), status: 200 })
    expect(resolvePagesPath(root, '/docs')).toEqual({ redirect: '/docs/' })
    expect(resolvePagesPath(root, '/page')).toEqual({ file: join(root, 'page.html'), status: 200 })
    expect(resolvePagesPath(root, '/nope')).toEqual({ file: join(root, '404.html'), status: 404 })
    expect(resolvePagesPath(root, '/../etc/passwd')).toEqual({ file: join(root, '404.html'), status: 404 })
  })

  it('serves gzip with the Pages cache lifetime and a text/plain llms.txt', async () => {
    const server = await serveStatic(root)
    try {
      const res = await fetch(`${server.origin}/llms.txt`, { headers: { 'accept-encoding': 'gzip' } })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      expect(res.headers.get('content-encoding')).toBe('gzip')
      expect(res.headers.get('cache-control')).toBe('max-age=600')
      expect(await res.text()).toBe('# T')
      expect((await fetch(`${server.origin}/missing`)).status).toBe(404)
    } finally {
      await server.close()
    }
  })
})
