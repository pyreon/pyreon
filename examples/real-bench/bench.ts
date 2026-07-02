/**
 * Playwright harness for @pyreon/example-real-bench. Builds the production bundle,
 * serves it via `vite preview`, then drives each framework in its OWN fresh
 * page (`?framework=<name>` isolation) under a Chromium launched with
 * `--js-flags=--expose-gc` so the in-page runner can force GC between
 * iterations. Prints a median + CI95 comparison table.
 *
 * Run: `bun bench.ts` (from examples/real-bench). Optional: `--runs N`.
 */
import { spawn, spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4319
const FRAMEWORKS = ['pyreon', 'react'] as const
const SCENARIOS = ['add-100', 'toggle-1000', 'clear-1000'] as const

interface Stats {
  median: number
  p90: number
  ci95: [number, number]
  cv: number
  n: number
}
interface FrameworkResult {
  framework: string
  scenarios: Record<string, Stats>
}

const runsArg = process.argv.indexOf('--runs')
const runs = runsArg >= 0 ? Number(process.argv[runsArg + 1]) : 20

function fmtMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  for (;;) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > timeoutMs) throw new Error(`server not up at ${url}`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

async function main(): Promise<void> {
  console.log('[real-bench] vite build…')
  const build = spawnSync('bunx', ['vite', 'build'], { stdio: 'inherit' })
  if (build.status !== 0) throw new Error('vite build failed')

  console.log('[real-bench] vite preview…')
  const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  })
  try {
    await waitForServer(`http://localhost:${PORT}/`)

    console.log('[real-bench] launching Chromium with --expose-gc…')
    const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
    const results: FrameworkResult[] = []

    for (const framework of FRAMEWORKS) {
      const page = await browser.newPage()
      const url = `http://localhost:${PORT}/?framework=${framework}&runs=${runs}`
      console.log(`[real-bench] ${framework} → ${url}`)
      await page.goto(url, { waitUntil: 'load' })
      await page.waitForFunction(
        () => Boolean((window as never as { __REAL_BENCH__?: unknown }).__REAL_BENCH__),
        {
          timeout: 120_000,
        },
      )
      const result = (await page.evaluate(
        () => (window as never as { __REAL_BENCH__: FrameworkResult }).__REAL_BENCH__,
      )) as FrameworkResult
      results.push(result)
      await page.close()
    }

    await browser.close()
    printTable(results)
  } finally {
    preview.kill()
  }
}

function printTable(results: FrameworkResult[]): void {
  console.log(
    `\n=== @pyreon/example-real-bench — real-app head-to-head (${runs} runs, median + CI95) ===\n`,
  )
  const head: string[] = ['scenario', ...results.map((r) => r.framework)]
  const rows: string[][] = [head]
  for (const scenario of SCENARIOS) {
    const row: string[] = [scenario]
    for (const r of results) {
      const s = r.scenarios[scenario]
      row.push(s ? `${fmtMs(s.median)} (cv ${(s.cv * 100).toFixed(0)}%)` : '—')
    }
    rows.push(row)
  }
  const widths = head.map((_, i) => Math.max(...rows.map((row) => (row[i] ?? '').length)))
  for (const [ri, row] of rows.entries()) {
    console.log(
      row.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  |  '),
    )
    if (ri === 0) console.log(widths.map((w) => '-'.repeat(w)).join('--+--'))
  }
  console.log(
    '\nMachine-dependent ms — the column-to-column ratios are the signal. Pyreon = fine-grained signals; React = useState + memo whole-list re-render.\n',
  )
}

void main()
