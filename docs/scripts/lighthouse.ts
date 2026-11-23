/**
 * Lighthouse gate for the built docs site (https://pyreon.dev).
 *
 * Serves `docs/dist` the way GitHub Pages serves it (gzip, `max-age=600`,
 * `/dir/` → `dir/index.html`, `404.html` for a miss), runs Lighthouse with its
 * default MOBILE config (Moto G Power emulation, simulated slow-4G + 4× CPU
 * throttling — the configuration PageSpeed Insights reports) several times per
 * page, and fails when:
 *
 * - any run scores below 1.0 in Accessibility, Best Practices, SEO or Agentic
 *   Browsing, or fails any audit that counts towards one of them;
 * - the MEDIAN performance score across the runs is below the floor, or the
 *   median of any metric across the runs exceeds its budget.
 *
 * Why the performance half is a median with budgets and not "every run = 100":
 * `.agents/guides/ci/README.md`, "Lighthouse gate".
 *
 * Usage (after `cd docs && bunx vite build`):
 *   bun run lighthouse                      # the CI check
 *   bun run lighthouse -- --runs 3 --cpu 8  # diagnose: fewer runs, slower CPU
 *   bun run lighthouse -- --pages / --out .cache/lh
 *
 * Flags: --dist <dir> (default dist), --pages <comma list>, --runs <n>
 * (default 5), --cpu <multiplier | auto> (default auto: see `calibratedCpu`),
 * --out <dir> (write every report as JSON), --latency <ms> (delay every
 * response, to stand in for the live host's server response time when
 * diagnosing; default 0), --no-assert (report only).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import { serveStatic } from './lighthouse-server'

/** Home page, one docs page, one marketing page. */
export const DEFAULT_PAGES = ['/', '/docs/getting-started/', '/products/reactivity/'] as const

/** Categories that must be exactly 1.0 on EVERY run, with every scored audit passing. */
export const STRICT_CATEGORIES = ['accessibility', 'best-practices', 'seo', 'agentic-browsing'] as const

/**
 * Performance floor (on the median score) and per-metric budgets (on each
 * metric's median). A category score of 1 is what Lighthouse shows as 100.
 * The budgets sit inside the "good" band of each metric's scoring curve, so a
 * regression in one metric fails here with its name even while the total
 * still rounds to 100.
 */
export const PERFORMANCE_FLOOR = 1
export const METRIC_BUDGETS = {
  'first-contentful-paint': 1500,
  'largest-contentful-paint': 2000,
  'speed-index': 2500,
  'total-blocking-time': 150,
  'cumulative-layout-shift': 0.02,
} as const

interface AuditResult {
  id: string
  title: string
  score: number | null
  scoreDisplayMode: string
  numericValue?: number
  displayValue?: string
}

interface CategoryResult {
  id: string
  score: number | null
  auditRefs: { id: string; weight: number }[]
}

export interface Lhr {
  finalDisplayedUrl: string
  categories: Record<string, CategoryResult>
  audits: Record<string, AuditResult>
  runtimeError?: { code: string; message: string }
}

/**
 * The audits of a category that count towards its score and did not pass.
 * A weight-0 audit, a not-applicable one and an informative one do not count.
 */
export function failingScoredAudits(lhr: Lhr, categoryId: string): AuditResult[] {
  const category = lhr.categories[categoryId]
  if (!category) return []
  return category.auditRefs
    .filter((ref) => ref.weight > 0)
    .map((ref) => lhr.audits[ref.id]!)
    .filter(
      (audit) =>
        audit.scoreDisplayMode !== 'notApplicable' &&
        audit.scoreDisplayMode !== 'informative' &&
        audit.scoreDisplayMode !== 'manual' &&
        audit.score !== 1,
    )
}

/** Every strict-category problem in one run, as human-readable lines. */
export function strictProblems(lhr: Lhr): string[] {
  const problems: string[] = []
  for (const id of STRICT_CATEGORIES) {
    const category = lhr.categories[id]
    if (!category) {
      problems.push(`${id}: category missing from the report`)
      continue
    }
    if (category.score !== 1) problems.push(`${id}: score ${category.score} (must be 1)`)
    for (const audit of failingScoredAudits(lhr, id)) {
      problems.push(`${id}: audit "${audit.id}" (${audit.title}) scored ${audit.score}`)
    }
  }
  return problems
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export interface PerformanceMedians {
  score: number
  metrics: Record<string, number>
}

/**
 * The median performance score and the median of each budgeted metric, each
 * taken across ALL runs independently. Lighthouse's own `computeMedianRun`
 * picks one whole run by FCP and TTI, which can be the run whose Total
 * Blocking Time was the outlier; per-value medians are what the budgets mean.
 */
export function performanceMedians(lhrs: Lhr[]): PerformanceMedians {
  const metrics: Record<string, number> = {}
  for (const id of Object.keys(METRIC_BUDGETS)) {
    metrics[id] = median(lhrs.map((l) => l.audits[id]?.numericValue ?? Number.POSITIVE_INFINITY))
  }
  return { score: median(lhrs.map((l) => l.categories.performance?.score ?? 0)), metrics }
}

/** Performance problems in the medians. */
export function performanceProblems(medians: PerformanceMedians): string[] {
  const problems: string[] = []
  if (medians.score < PERFORMANCE_FLOOR) {
    problems.push(`performance: median score ${medians.score} (floor ${PERFORMANCE_FLOOR})`)
  }
  for (const [id, budget] of Object.entries(METRIC_BUDGETS)) {
    const value = medians.metrics[id]!
    if (value > budget) problems.push(`performance: median ${id} ${round(value)} over its budget ${budget}`)
  }
  return problems
}

const round = (n: number) => (n < 1 ? Math.round(n * 1000) / 1000 : Math.round(n))

function summary(lhr: Lhr): string {
  const cats = Object.values(lhr.categories)
    .map((c) => `${c.id}=${c.score}`)
    .join(' ')
  const metrics = Object.keys(METRIC_BUDGETS)
    .map((id) => `${id.replace(/-/g, ' ').replace(/\b(\w)\w*/g, '$1').replace(/ /g, '')}=${round(lhr.audits[id]?.numericValue ?? NaN)}`)
    .join(' ')
  return `${cats} | ${metrics}`
}

/**
 * Lighthouse's 4× CPU slowdown is calibrated for a host whose benchmarkIndex
 * is in the high-end-desktop bracket (1500–2000; docs/throttling.md in the
 * Lighthouse repo): 4× on such a host lands in "mid-tier mobile". A faster
 * host (a current laptop measures ~3700) at 4× emulates a much faster phone,
 * which is how a regression can score 100 locally and 98 on PageSpeed
 * Insights. The gate scales the multiplier to the host so every machine
 * emulates the same device: 4 × benchmarkIndex / CALIBRATION_BENCHMARK_INDEX,
 * never below Lighthouse's 4×.
 */
export const CALIBRATION_BENCHMARK_INDEX = 1750

export function calibratedCpu(benchmarkIndex: number): number {
  return Math.max(4, Math.round((4 * benchmarkIndex * 10) / CALIBRATION_BENCHMARK_INDEX) / 10)
}

function launchChrome() {
  return chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] })
}

/** One discarded Lighthouse run that only reads the host's benchmarkIndex. */
async function measureBenchmarkIndex(url: string): Promise<number> {
  const chrome = await launchChrome()
  try {
    const result = await lighthouse(
      url,
      { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'] },
    )
    const index = (result?.lhr as unknown as { environment?: { benchmarkIndex?: number } })?.environment
      ?.benchmarkIndex
    if (!index) throw new Error('[Pyreon] Lighthouse reported no benchmarkIndex; pass --cpu <multiplier> explicitly.')
    return index
  } finally {
    chrome.kill()
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dist: { type: 'string', default: 'dist' },
      pages: { type: 'string' },
      runs: { type: 'string', default: '5' },
      cpu: { type: 'string', default: 'auto' },
      out: { type: 'string' },
      latency: { type: 'string', default: '0' },
      'no-assert': { type: 'boolean', default: false },
    },
  })
  const docsDir = fileURLToPath(new URL('..', import.meta.url))
  const dist = resolve(docsDir, values.dist!)
  const pages = values.pages ? values.pages.split(',') : [...DEFAULT_PAGES]
  const runs = Number(values.runs)
  const outDir = values.out ? resolve(process.cwd(), values.out) : undefined
  if (outDir) mkdirSync(outDir, { recursive: true })

  const server = await serveStatic(dist, { latencyMs: Number(values.latency) })
  const failures: string[] = []
  try {
    let cpuSlowdownMultiplier: number
    if (values.cpu === 'auto') {
      const index = await measureBenchmarkIndex(`${server.origin}${pages[0]}`)
      cpuSlowdownMultiplier = calibratedCpu(index)
      // oxlint-disable-next-line no-console
      console.log(
        `benchmarkIndex ${Math.round(index)} → cpuSlowdownMultiplier ${cpuSlowdownMultiplier} (calibrated to ${CALIBRATION_BENCHMARK_INDEX} at 4×)`,
      )
    } else {
      cpuSlowdownMultiplier = Number(values.cpu)
    }
    for (const page of pages) {
      const url = `${server.origin}${page}`
      const lhrs: Lhr[] = []
      for (let i = 0; i < runs; i++) {
        // A fresh browser per run, as the Lighthouse CLI and PageSpeed
        // Insights do: a reused renderer carries the previous run's heap, and
        // DevTools instrumentation walks it before the next navigation — a
        // task that lands in the simulated timeline as an unattributable long
        // task and swings Total Blocking Time between runs.
        const chrome = await launchChrome()
        let result: Awaited<ReturnType<typeof lighthouse>>
        try {
          result = await lighthouse(
            url,
            { port: chrome.port, output: 'json', logLevel: 'error' },
            {
              extends: 'lighthouse:default',
              settings: { throttling: { cpuSlowdownMultiplier } as never },
            },
          )
        } finally {
          chrome.kill()
        }
        if (!result) throw new Error(`[Pyreon] Lighthouse returned no result for ${url}`)
        const lhr = result.lhr as unknown as Lhr
        if (lhr.runtimeError) {
          throw new Error(
            `[Pyreon] Lighthouse could not audit ${url}: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`,
          )
        }
        lhrs.push(lhr)
        // oxlint-disable-next-line no-console
        console.log(`${page} run ${i + 1}/${runs}: ${summary(lhr)}`)
        if (outDir) {
          const name = `${page.replace(/\//g, '_') || '_'}-run${i + 1}.json`
          writeFileSync(resolve(outDir, name), JSON.stringify(lhr))
        }
        for (const p of strictProblems(lhr)) failures.push(`${page} run ${i + 1}: ${p}`)
      }
      const medians = performanceMedians(lhrs)
      const metricText = Object.entries(medians.metrics)
        .map(([id, v]) => `${id}=${round(v)}`)
        .join(' ')
      // oxlint-disable-next-line no-console
      console.log(`${page} MEDIAN: performance=${medians.score} | ${metricText}`)
      for (const p of performanceProblems(medians)) failures.push(`${page}: ${p}`)
    }
  } finally {
    await server.close()
  }

  if (failures.length > 0) {
    // oxlint-disable-next-line no-console
    console.error(`\n[Pyreon] Lighthouse gate failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`)
    // oxlint-disable-next-line no-console
    console.error('\nReproduce: cd docs && bunx vite build && bun run lighthouse -- --out .cache/lh')
    if (!values['no-assert']) process.exit(1)
  } else {
    // oxlint-disable-next-line no-console
    console.log('\n[Pyreon] Lighthouse gate passed.')
  }
}

if (import.meta.main) await main()
