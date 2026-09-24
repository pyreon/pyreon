/**
 * Playwright harness for @pyreon/example-real-bench. Builds the production bundle,
 * serves it via `vite preview --strictPort`, then drives each framework in its
 * OWN fresh browser context (`?framework=<name>` isolation — the page loads only
 * that framework's chunk) under a Chromium launched with `--js-flags=--expose-gc`
 * so the in-page runner can force GC between iterations. Framework order is
 * rotated every pass (each arm leads equally often); samples are pooled. Prints median +
 * 95% bootstrap CI + a tie verdict when the CIs overlap.
 *
 * Same objectivity contract as `examples/benchmark/bench-fair.ts`: the page
 * must be cross-origin isolated (5µs clock, not Chromium's 100µs clamp) or the
 * run ABORTS; the announced preview port is asserted; machine identity + load
 * average are stamped before and after.
 *
 * Run: `bun bench.ts` (from examples/real-bench).
 *   --runs N          timed runs per scenario per pass (default 20)
 *   --repeat N        passes, order rotated each (default 1)
 *   --wait-quiet [L]  wait for load1 ≤ L before measuring
 *   --json out.json   write the pooled results + timer + load stamps
 */
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { LoadRecorder, parseWaitQuiet, waitForQuietMachine } from '../benchmark/machine-load'
import { computeStats, type Stats } from './src/stats'

const PORT = 4319
const FRAMEWORKS = ['pyreon', 'react'] as const
const SCENARIOS = ['add-100', 'toggle-1000', 'clear-1000'] as const

interface InPageResult {
  framework: string
  scenarios: Record<string, Stats & { samples: number[] }>
}

const argv = process.argv.slice(2)
const argNum = (flag: string, def: number): number => {
  const i = argv.indexOf(flag)
  const n = i >= 0 ? Number(argv[i + 1]) : Number.NaN
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : def
}
const runs = argNum('--runs', 20)
const repeat = argNum('--repeat', 1)
const waitQuiet = parseWaitQuiet(argv)
const jsonIdx = argv.indexOf('--json')
const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : undefined

function fmtMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`
}

// Rotate, don't shuffle: with two arms a shuffle lands the same order in every
// pass one time in four (observed 2026-09-24: React first in all 3 passes), so
// the arm that always runs second inherits whatever the first left behind.
// Rotation gives each arm the first slot in exactly 1/N of the passes, so use a
// --repeat that is a multiple of the arm count.
function rotated<T>(xs: readonly T[], pass: number): T[] {
  const k = pass % xs.length
  return [...xs.slice(k), ...xs.slice(0, k)]
}

async function measureClockQuantum(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseUrl: string,
): Promise<{ isolated: boolean; quantumMs: number }> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try {
    await page.goto(baseUrl, { waitUntil: 'load' })
    return await page.evaluate(() => {
      let smallest = Number.POSITIVE_INFINITY
      let prev = performance.now()
      const end = prev + 150
      while (performance.now() < end) {
        const t = performance.now()
        if (t > prev) {
          if (t - prev < smallest) smallest = t - prev
          prev = t
        }
      }
      return {
        isolated: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
        quantumMs: smallest,
      }
    })
  } finally {
    await ctx.close()
  }
}

async function main(): Promise<void> {
  console.log('[real-bench] vite build…')
  // NODE_ENV forced: `vite build` only sets it when unset, so an inherited
  // `development`/`test` would silently produce a dev build.
  const build = spawnSync('bunx', ['vite', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (build.status !== 0) throw new Error('vite build failed')

  console.log('[real-bench] vite preview…')
  const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const load = new LoadRecorder('real-bench', waitQuiet)
  try {
    // Readiness = vite's own `Local:` line naming OUR port. A bare fetch() would
    // happily succeed against a stale server that already held the port.
    await new Promise<void>((res, rej) => {
      const to = setTimeout(() => rej(new Error('preview start timeout')), 30_000)
      preview.stdout?.on('data', (c: Buffer) => {
        const text = c.toString()
        if (!text.includes('Local:')) return
        clearTimeout(to)
        if (!text.includes(`:${PORT}`)) rej(new Error(`[real-bench] preview announced another port: ${text.trim()}`))
        else res()
      })
      preview.on('exit', (code) =>
        rej(new Error(`preview exited ${code} — :${PORT} probably held (lsof -ti tcp:${PORT} | xargs kill -9)`)),
      )
    })

    console.log('[real-bench] launching Chromium with --expose-gc…')
    const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
    const baseUrl = `http://localhost:${PORT}`
    const clock = await measureClockQuantum(browser, baseUrl)
    console.log(
      `[real-bench] timer: crossOriginIsolated=${clock.isolated} · quantum ${(clock.quantumMs * 1000).toFixed(1)}µs`,
    )
    if (!clock.isolated || clock.quantumMs > 0.02) {
      await browser.close()
      throw new Error('[real-bench] timer too coarse — COOP/COEP headers not served? (need isolation + ≤20µs)')
    }

    load.printIdentity()
    if (waitQuiet !== null) await waitForQuietMachine('real-bench', waitQuiet)
    load.stamp('before measuring')

    const pooled = new Map<string, Map<string, number[]>>()
    const names = new Map<string, string>()
    for (let pass = 0; pass < repeat; pass++) {
      const order = rotated(FRAMEWORKS, pass)
      console.log(`[real-bench] pass ${pass + 1}/${repeat} — order: ${order.join(', ')}`)
      for (const framework of order) {
        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        page.on('pageerror', (e) => console.error(`[chromium:${framework}] pageerror:`, e.message))
        await page.goto(`${baseUrl}/?framework=${framework}&runs=${runs}`, { waitUntil: 'load' })
        await page.waitForFunction(
          () => {
            const w = window as never as { __REAL_BENCH__?: unknown; __REAL_BENCH_ERROR__?: string }
            return Boolean(w.__REAL_BENCH__ ?? w.__REAL_BENCH_ERROR__)
          },
          null,
          { timeout: 180_000 },
        )
        const failure = await page.evaluate(
          () => (window as never as { __REAL_BENCH_ERROR__?: string }).__REAL_BENCH_ERROR__,
        )
        if (failure) throw new Error(`[real-bench] ${framework} FAILED its correctness gates:\n${failure}`)
        const result = (await page.evaluate(
          () => (window as never as { __REAL_BENCH__: InPageResult }).__REAL_BENCH__,
        )) as InPageResult
        await ctx.close()
        names.set(framework, result.framework)
        const byScenario = pooled.get(framework) ?? new Map<string, number[]>()
        for (const [name, s] of Object.entries(result.scenarios)) {
          byScenario.set(name, [...(byScenario.get(name) ?? []), ...s.samples])
        }
        pooled.set(framework, byScenario)
      }
    }
    load.stamp('after measuring')
    await browser.close()
    const table = printTable(pooled, names)
    if (jsonOut) {
      writeFileSync(
        jsonOut,
        JSON.stringify({ runs, repeat, timer: clock, load: load.report(), results: table }, null, 2),
      )
      console.log(`[real-bench] wrote ${jsonOut}`)
    }
  } finally {
    preview.kill()
  }
}

function printTable(
  pooled: Map<string, Map<string, number[]>>,
  names: Map<string, string>,
): Record<string, Record<string, Stats>> {
  const fws = FRAMEWORKS.filter((f) => pooled.has(f))
  console.log(
    `\n=== @pyreon/example-real-bench — real-app head-to-head (${runs} runs × ${repeat} pass(es), median [95% CI]) ===\n`,
  )
  const head: string[] = ['scenario', ...fws.map((f) => names.get(f) ?? f), 'verdict']
  const rows: string[][] = [head]
  const out: Record<string, Record<string, Stats>> = {}
  for (const scenario of SCENARIOS) {
    const stats = fws.map((f) => {
      const xs = pooled.get(f)?.get(scenario) ?? []
      return { f, s: xs.length ? computeStats(xs) : null }
    })
    out[scenario] = Object.fromEntries(stats.filter((x) => x.s).map((x) => [x.f, x.s!]))
    const row: string[] = [scenario]
    for (const { s } of stats) {
      row.push(s ? `${fmtMs(s.median)} [${fmtMs(s.ci95[0])}–${fmtMs(s.ci95[1])}] cv${(s.cv * 100).toFixed(0)}%` : 'FAILED')
    }
    const ok = stats.filter((x) => x.s).sort((a, b) => a.s!.median - b.s!.median)
    const [lead, next] = ok
    let verdict = '—'
    if (lead && next) {
      const tie = lead.s!.ci95[0] <= next.s!.ci95[1] && next.s!.ci95[0] <= lead.s!.ci95[1]
      verdict = tie ? `🤝 tie (CI overlap)` : `${names.get(lead.f) ?? lead.f} ${(next.s!.median / lead.s!.median).toFixed(2)}×`
    }
    row.push(verdict)
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
    '\nMachine-dependent ms — the column-to-column ratios are the signal. Pyreon = fine-grained signals; React = useState + memo whole-list re-render, committed via flushSync.\n',
  )
  return out
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
