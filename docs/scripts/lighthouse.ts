/**
 * Lighthouse check of the built docs site (https://pyreon.dev).
 *
 * Serves `docs/dist` the way GitHub Pages serves it (gzip, `max-age=600`,
 * `/dir/` → `dir/index.html`, `404.html` for a miss) and runs the pinned
 * Lighthouse CLI with its default MOBILE config several times per page, a
 * fresh Chrome per run. Lighthouse stays out of the bun workspace: CI installs
 * it from `scripts/lighthouse-tools/package-lock.json` (`PYREON_LIGHTHOUSE_BIN`),
 * a local run falls back to `npx lighthouse@LIGHTHOUSE_VERSION`.
 *
 * HARD (fails the run, deterministic):
 * - any run scoring below 1.0 in Accessibility, Best Practices, SEO or Agentic
 *   Browsing, or failing an audit that counts towards one of them;
 * - a page whose inline CSS holds an empty rule block (`sel { }`), the
 *   deterministic proxy for the first-load style cost that cost performance
 *   points (see `pageProxies`).
 *
 * TIMING (report-only unless `--perf assert`): the median performance score
 * and per-metric medians against `PERFORMANCE_FLOOR` / `METRIC_BUDGETS`,
 * written to the job summary and to `<out>/medians.json`. Why it is not a hard
 * gate in CI: `.agents/guides/ci/README.md`, "Lighthouse check".
 *
 * Usage (after `cd docs && bunx vite build`):
 *   bun run lighthouse                          # what CI runs
 *   bun run lighthouse -- --perf assert         # also fail on the timing budgets
 *   bun run lighthouse -- --cpu 16 --latency 170 --pages /   # ~PageSpeed Insights hardware
 *
 * Flags: --dist <dir> (default dist), --pages <comma list>, --runs <n>
 * (default 5), --cpu <multiplier | auto> (default auto: see `calibratedCpu`),
 * --out <dir> (every report as JSON, plus medians.json), --latency <ms> (delay
 * every response, to stand in for the live host's server time; default 0),
 * --perf <report | assert> (default report).
 */
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { resolvePagesPath, serveStatic } from './lighthouse-server'

/**
 * Pinned exactly: a new Lighthouse can add audits. Bump on purpose, together
 * with `scripts/lighthouse-tools/package.json` + its lock (a test keeps them
 * equal) and `lighthouseLlmsTxtFailures` in `@pyreon/test-utils/llms-txt`.
 */
export const LIGHTHOUSE_VERSION = '13.6.0'

/** Home page, one docs page, one marketing page. */
export const DEFAULT_PAGES = ['/', '/docs/getting-started/', '/products/reactivity/'] as const

/** Categories that must be exactly 1.0 on EVERY run, with every scored audit passing. */
export const STRICT_CATEGORIES = ['accessibility', 'best-practices', 'seo', 'agentic-browsing'] as const

/**
 * Performance floor (on the median score) and per-metric budgets (on each
 * metric's median), reported in CI and enforced with `--perf assert`. On
 * GitHub's runners the docs page's median sat on the 99/100 boundary (Total
 * Blocking Time 0–180 ms between runs of the same build), which is why timing
 * is not a hard CI gate.
 */
export const PERFORMANCE_FLOOR = 0.99

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

/**
 * Run the pinned Lighthouse CLI and return its report. A Chrome that dies
 * before the audit starts ("Target closed") is retried once with a new
 * browser; a second failure, or a report with a runtime error, fails the run.
 */
type Report = Lhr & { environment?: { benchmarkIndex?: number } }

async function runLighthouse(url: string, extra: string[]): Promise<Report> {
  try {
    return await runLighthouseOnce(url, extra)
  } catch (error) {
    if (!/Target closed|ECONNREFUSED|Unable to connect to Chrome/.test(String(error))) throw error
    // oxlint-disable-next-line no-console
    console.warn(`[Pyreon] Lighthouse lost its browser on ${url}; retrying once.`)
    return runLighthouseOnce(url, extra)
  }
}

/** Spawned asynchronously: the static server answering Lighthouse runs in this process. */
function exec(cmd: string, args: string[], cwd: string): Promise<{ status: number | null; stderr: string }> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', fail)
    child.on('close', (status) => done({ status, stderr }))
  })
}

async function runLighthouseOnce(url: string, extra: string[]): Promise<Report> {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-lh-'))
  const out = join(dir, 'report.json')
  try {
    const args = [
      url,
      '--quiet',
      '--output=json',
      `--output-path=${out}`,
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
      ...extra,
    ]
    // CI installs Lighthouse from the integrity-pinned lock in
    // scripts/lighthouse-tools (npm ci --ignore-scripts) and points
    // PYREON_LIGHTHOUSE_BIN at it. Locally, without it, npx fetches the same
    // version, run outside the workspace: npx inside it reads the root
    // package.json's overrides and refuses to install (EOVERRIDE).
    const bin = process.env.PYREON_LIGHTHOUSE_BIN
    const result = bin
      ? await exec(bin, args, dir)
      : await exec('npx', ['-y', `lighthouse@${LIGHTHOUSE_VERSION}`, ...args], dir)
    if (result.status !== 0) {
      throw new Error(`[Pyreon] Lighthouse exited ${result.status} for ${url}: ${result.stderr.slice(-2000)}`)
    }
    const lhr = JSON.parse(readFileSync(out, 'utf-8')) as Report
    if (lhr.runtimeError) {
      throw new Error(`[Pyreon] Lighthouse could not audit ${url}: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`)
    }

    return lhr
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Deterministic page checks, read from the built HTML (no timing). An empty
 * rule block in the inline CSS is how the home page carried 372 dead
 * `&:hover { }` rules that inflated first-load style work: zero is the gate.
 * Inline CSS bytes and element count are reported for the trend.
 */
export function pageProxies(html: string): { emptyRules: number; inlineCssBytes: number; elements: number } {
  let emptyRules = 0
  let inlineCssBytes = 0
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const raw = m[1]!
    inlineCssBytes += raw.length
    // Strings may hold braces (`content: "{}"`); they are not rule blocks.
    const css = raw.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""')
    // A selector (not an at-rule prelude) followed by an empty block.
    for (const r of css.matchAll(/(^|[;{}])\s*([^;{}@]+?)\s*\{\s*\}/g)) if (r[2]!.trim() !== '') emptyRules++
  }
  const elements = (html.match(/<[a-zA-Z][a-zA-Z0-9-]*[\s>/]/g) ?? []).length

  return { emptyRules, inlineCssBytes, elements }
}

interface Options {
  dist: string
  pages: string[]
  runs: number
  cpu: string
  latency: number
  assertPerf: boolean
  outDir: string | undefined
}

interface PageResult {
  page: string
  medians: PerformanceMedians
  perRun: (number | null | undefined)[]
  problems: string[]
}

const log = (line: string) => {
  // oxlint-disable-next-line no-console
  console.log(line)
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      dist: { type: 'string', default: 'dist' },
      pages: { type: 'string' },
      runs: { type: 'string', default: '5' },
      cpu: { type: 'string', default: 'auto' },
      out: { type: 'string' },
      latency: { type: 'string', default: '0' },
      perf: { type: 'string', default: 'report' },
    },
  })
  const docsDir = fileURLToPath(new URL('..', import.meta.url))
  return {
    dist: resolve(docsDir, values.dist!),
    pages: values.pages ? values.pages.split(',') : [...DEFAULT_PAGES],
    runs: Number(values.runs),
    cpu: values.cpu!,
    latency: Number(values.latency),
    assertPerf: values.perf === 'assert',
    outDir: values.out ? resolve(process.cwd(), values.out) : undefined,
  }
}

/** The deterministic HTML checks for every page; returns the failures. */
function checkPageProxies(dist: string, pages: string[], report: Record<string, unknown>): string[] {
  const failures: string[] = []
  for (const page of pages) {
    const resolved = resolvePagesPath(dist, page)
    if (!('file' in resolved) || resolved.status !== 200) {
      failures.push(`${page}: not a page in ${dist}`)
      continue
    }
    const proxies = pageProxies(readFileSync(resolved.file, 'utf-8'))
    log(`${page} proxies: empty rule blocks=${proxies.emptyRules} inline CSS=${proxies.inlineCssBytes} B elements=${proxies.elements}`)
    if (proxies.emptyRules > 0) failures.push(`${page}: ${proxies.emptyRules} empty CSS rule block(s) in the inline styles`)
    report[page] = { proxies }
  }

  return failures
}

async function cpuMultiplier(cpu: string, firstUrl: string): Promise<number> {
  if (cpu !== 'auto') return Number(cpu)
  const index = (await runLighthouse(firstUrl, ['--only-categories=performance'])).environment?.benchmarkIndex
  if (!index) throw new Error('[Pyreon] Lighthouse reported no benchmarkIndex; pass --cpu <multiplier>.')
  const multiplier = calibratedCpu(index)
  log(`benchmarkIndex ${Math.round(index)} → cpuSlowdownMultiplier ${multiplier} (calibrated to ${CALIBRATION_BENCHMARK_INDEX} at 4×)`)

  return multiplier
}

/** All runs of one page: strict failures go to `failures`; returns the timing result. */
async function measurePage(page: string, origin: string, cpu: number, opts: Options, failures: string[]): Promise<PageResult> {
  const lhrs: Lhr[] = []
  for (let i = 0; i < opts.runs; i++) {
    // The CLI launches a fresh Chrome per run, as PageSpeed Insights does:
    // a reused renderer carries the previous run's heap, which DevTools
    // instrumentation walks before the next navigation.
    const lhr = await runLighthouse(`${origin}${page}`, [`--throttling.cpuSlowdownMultiplier=${cpu}`])
    lhrs.push(lhr)
    log(`${page} run ${i + 1}/${opts.runs}: ${summary(lhr)}`)
    if (opts.outDir) writeFileSync(resolve(opts.outDir, `${page.replace(/\//g, '_') || '_'}-run${i + 1}.json`), JSON.stringify(lhr))
    for (const p of strictProblems(lhr)) failures.push(`${page} run ${i + 1}: ${p}`)
  }
  const medians = performanceMedians(lhrs)
  log(`${page} MEDIAN: performance=${medians.score} | ${Object.entries(medians.metrics).map(([id, v]) => `${id}=${round(v)}`).join(' ')}`)

  return { page, medians, perRun: lhrs.map((l) => l.categories.performance?.score), problems: performanceProblems(medians) }
}

function writeStepSummary(results: PageResult[], cpu: number, opts: Options, hardFailures: number): void {
  if (!process.env.GITHUB_STEP_SUMMARY) return
  const rows = results.map(
    (r) =>
      `| \`${r.page}\` | ${r.medians.score} | ${r.perRun.join(', ')} | ${Object.values(r.medians.metrics).map(round).join(' / ')} | ${r.problems.length === 0 ? 'within budget' : r.problems.join('; ')} |`,
  )
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      `### Lighthouse ${LIGHTHOUSE_VERSION} (mobile, CPU ${cpu}×, ${opts.runs} runs per page)`,
      '',
      `Timing is ${opts.assertPerf ? 'asserted' : 'report-only'}. Hard checks: ${hardFailures === 0 ? 'passed' : `${hardFailures} failure(s)`}.`,
      '',
      '| page | median perf | per run | median FCP / LCP / SI / TBT / CLS | budgets |',
      '| --- | --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'),
  )
}

function finish(failures: string[], timing: string[], assertPerf: boolean): void {
  if (timing.length > 0) {
    // oxlint-disable-next-line no-console
    console.error(`\n[Pyreon] Lighthouse timing outside budget${assertPerf ? '' : ' (report-only)'}:\n${timing.map((f) => `  - ${f}`).join('\n')}`)
    if (assertPerf) failures.push(...timing)
  }
  if (failures.length > 0) {
    // oxlint-disable-next-line no-console
    console.error(`\n[Pyreon] Lighthouse check failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`)
    // oxlint-disable-next-line no-console
    console.error('\nReproduce: cd docs && bunx vite build && bun run lighthouse -- --out .cache/lh')
    process.exit(1)
  }
  log('\n[Pyreon] Lighthouse check passed.')
}

async function main(): Promise<void> {
  const opts = parseOptions()
  if (opts.outDir) mkdirSync(opts.outDir, { recursive: true })
  const pagesReport: Record<string, unknown> = {}
  const failures = checkPageProxies(opts.dist, opts.pages, pagesReport)
  const results: PageResult[] = []
  const server = await serveStatic(opts.dist, { latencyMs: opts.latency })
  let cpu = 0
  try {
    cpu = await cpuMultiplier(opts.cpu, `${server.origin}${opts.pages[0]}`)
    for (const page of opts.pages) results.push(await measurePage(page, server.origin, cpu, opts, failures))
  } finally {
    await server.close()
  }
  for (const r of results) pagesReport[r.page] = { ...(pagesReport[r.page] as object), performance: { median: r.medians, runs: r.perRun } }
  if (opts.outDir) {
    writeFileSync(
      resolve(opts.outDir, 'medians.json'),
      JSON.stringify({ lighthouse: LIGHTHOUSE_VERSION, cpuSlowdownMultiplier: cpu, pages: pagesReport }, null, 2),
    )
  }
  writeStepSummary(results, cpu, opts, failures.length)
  finish(failures, results.flatMap((r) => r.problems.map((p) => `${r.page}: ${p}`)), opts.assertPerf)
}

if (import.meta.main) await main()
