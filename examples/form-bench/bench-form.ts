#!/usr/bin/env bun
/**
 * Tier-B form benchmark — Playwright driver (the canonical objective run).
 *
 * Same objectivity discipline as `examples/benchmark/bench-fair.ts`:
 *   1. `vite preview` serves the production build (real bundler output).
 *   2. Per-framework page isolation — each framework runs in its OWN fresh
 *      `page.goto('?framework=<name>')` (zero cross-suite heap/JIT bias).
 *   3. Chromium launched with `--js-flags=--expose-gc` so `runner.ts` forces
 *      GC between iterations + `--enable-precise-memory-info` for retained heap.
 *   4. Adaptive warmup + 20 timed runs + median + 95% bootstrap CI + CV (in
 *      `runner.ts`); DOM verification per iteration.
 *   5. Randomized framework EXECUTION order (thermal/cache bias can't favour a
 *      column); OUTPUT pinned to canonical order.
 *   6. Retained-heap (post-GC `usedJSHeapSize`) reported next to speed.
 *   7. Tied-within-noise `🤝` when the two CIs overlap.
 *   8. Machine stamp printed.
 *
 * Usage: bun bench-form.ts [--json out.json] [--repeat N]
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = 4188
const ALL_FRAMEWORKS = [
  'Pyreon',
  'React Hook Form',
  'TanStack Form',
  'Formik',
  'Vue (vee-validate)',
  'Svelte (Felte)',
  'Solid (modular-forms)',
] as const

interface BenchResult {
  name: string
  median: number
  p90: number
  ci95: [number, number]
  cv: number
  samples: number[]
}
interface SuiteResult {
  framework: string
  results: BenchResult[]
}
interface FrameworkRun {
  suite: SuiteResult
  retainedHeapBytes: number | null
}

function shuffled<T>(input: readonly T[]): T[] {
  const out = [...input]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}

async function runOne(
  framework: string,
  baseUrl: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<FrameworkRun | null> {
  const ctx = await browser.newContext()
  const page: Page = await ctx.newPage()
  page.on('console', (m) => {
    const t = m.text()
    if (t.includes('benchmark failed') || t.includes('[form-bench]') || t.includes('Error')) {
      console.error(`[chromium:${framework}]`, t)
    }
  })
  page.on('pageerror', (e) => console.error(`[chromium:${framework}] pageerror:`, e.message))
  try {
    await page.goto(`${baseUrl}/?framework=${encodeURIComponent(framework)}`, { waitUntil: 'load' })
    await page.waitForFunction(
      () => document.getElementById('status')?.textContent === 'Done ✓',
      null,
      { timeout: 180_000 },
    )
    const suites: SuiteResult[] = await page.evaluate(
      () => (globalThis as { __benchResults?: SuiteResult[] }).__benchResults ?? [],
    )
    if (suites.length !== 1 || !suites[0]) {
      console.error(`[form-bench] ${framework}: expected 1 suite, got ${suites.length}`)
      return null
    }
    const retainedHeapBytes = await page.evaluate(() => {
      const gc = (globalThis as { gc?: () => void }).gc
      if (gc) {
        gc()
        gc()
        gc()
      }
      const perf = performance as Performance & { memory?: { usedJSHeapSize?: number } }
      return perf.memory?.usedJSHeapSize ?? null
    })
    return { suite: suites[0], retainedHeapBytes }
  } finally {
    await ctx.close()
  }
}

const fmt = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`)
const overlap = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1]

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : undefined
  const repeatIdx = argv.indexOf('--repeat')
  const repeat = repeatIdx >= 0 ? Math.max(1, Math.min(20, Number(argv[repeatIdx + 1]) || 1)) : 1
  // `--only "Pyreon,Vue (vee-validate)"` restricts to a subset (fast per-framework
  // verification). Default = all frameworks. Pyreon is always kept (it's the column
  // every multiplier is relative to).
  const onlyIdx = argv.indexOf('--only')
  const CANONICAL: readonly string[] =
    onlyIdx >= 0 && argv[onlyIdx + 1]
      ? ALL_FRAMEWORKS.filter((f) => {
          const req = argv[onlyIdx + 1]!.split(',').map((s) => s.trim())
          return f === 'Pyreon' || req.includes(f)
        })
      : ALL_FRAMEWORKS

  console.log('[form-bench] building…')
  execSync('bun run build', { cwd: HERE, stdio: 'inherit' })

  console.log(`[form-bench] starting preview on :${PORT}`)
  const preview: ChildProcess = spawn('bun', ['x', 'vite', 'preview', '--port', String(PORT)], {
    cwd: HERE,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise<void>((res, rej) => {
    const to = setTimeout(() => rej(new Error('preview start timeout')), 15_000)
    preview.stdout?.on('data', (c: Buffer) => {
      if (c.toString().includes('Local:')) {
        clearTimeout(to)
        res()
      }
    })
    preview.on('exit', (code) => rej(new Error(`preview exited ${code}`)))
  })

  const browser = await chromium.launch({
    headless: true,
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  })
  const baseUrl = `http://localhost:${PORT}`

  // Pool samples across passes (per framework, per scenario) for tighter CI.
  const pooled = new Map<string, Map<string, number[]>>()
  const heaps = new Map<string, number[]>()
  try {
    for (let pass = 0; pass < repeat; pass++) {
      const order = shuffled(CANONICAL)
      console.log(`[form-bench] pass ${pass + 1}/${repeat} — order: ${order.join(', ')}`)
      for (const fw of order) {
        const run = await runOne(fw, baseUrl, browser)
        if (!run) continue
        const byScenario = pooled.get(fw) ?? new Map<string, number[]>()
        for (const r of run.suite.results) {
          const acc = byScenario.get(r.name) ?? []
          acc.push(...r.samples)
          byScenario.set(r.name, acc)
        }
        pooled.set(fw, byScenario)
        if (run.retainedHeapBytes != null) {
          const h = heaps.get(fw) ?? []
          h.push(run.retainedHeapBytes)
          heaps.set(fw, h)
        }
      }
    }
  } finally {
    await browser.close()
    preview.kill('SIGTERM')
  }

  // Aggregate pooled samples → median + CI95.
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor((s.length - 1) * 0.5)] ?? 0
  }
  const ci95 = (xs: number[]): [number, number] => {
    const n = xs.length
    const meds: number[] = []
    for (let b = 0; b < 1000; b++) {
      const rs: number[] = []
      for (let i = 0; i < n; i++) rs.push(xs[Math.floor(Math.random() * n)] ?? 0)
      rs.sort((a, c) => a - c)
      meds.push(rs[Math.floor((n - 1) * 0.5)] ?? 0)
    }
    meds.sort((a, b) => a - b)
    return [meds[25] ?? 0, meds[974] ?? 0]
  }

  const scenarios = [...(pooled.get('Pyreon')?.keys() ?? [])]
  const machine = `${os.cpus()[0]?.model ?? 'unknown'} · ${os.cpus().length} cores · ${(os.totalmem() / 1e9).toFixed(0)} GB · ${os.platform()} · Chromium ${browser.version?.() ?? '?'}`

  const peers = CANONICAL.filter((f) => f !== 'Pyreon').join(' / ')
  console.log(`\nTIER B — REAL-APP FORM BENCHMARK — Pyreon vs ${peers}`)
  console.log(`${machine}`)
  console.log(`Median ± 95% bootstrap CI, CV%, pooled ${repeat * 20} samples/scenario. Lower = faster.\n`)
  const head = ['scenario', ...CANONICAL, 'verdict']
  console.log(head.map((h) => h.padEnd(h === 'scenario' ? 22 : 26)).join(''))
  console.log('─'.repeat(100))

  const jsonRows: unknown[] = []
  for (const name of scenarios) {
    const stats = CANONICAL.map((fw) => {
      const xs = pooled.get(fw)?.get(name) ?? []
      return { fw, median: median(xs), ci95: ci95(xs) }
    })
    const ranked = [...stats].sort((a, b) => a.median - b.median)
    const leader = ranked[0]!
    const runnerUp = ranked[1]
    const best = leader.median
    // Tied-within-noise: the leader's CI overlaps the runner-up's → the win is
    // not resolvable at this sample size (don't read a winner).
    const tied = !!runnerUp && overlap(leader.ci95, runnerUp.ci95)
    const verdict = tied ? `🤝 ${leader.fw}≈${runnerUp.fw} (CI overlap)` : leader.fw
    // Ratio is only meaningful when the fastest column is above the timer floor;
    // at the floor (best === 0) show "—" rather than a misleading 0.0x.
    const ratio = (m: number) => (best > 0 ? `${(m / best).toFixed(1)}×` : '—')
    const cells = stats.map((s) => `${fmt(s.median)}(${ratio(s.median)})`.padEnd(26)).join('')
    console.log(name.padEnd(22) + cells + verdict)
    jsonRows.push({ scenario: name, verdict, tied, frameworks: stats })
  }

  console.log(`\nRetained JS heap after suite (post-GC, MB):`)
  for (const fw of CANONICAL) {
    const h = heaps.get(fw) ?? []
    const mb = h.length ? (median(h) / 1e6).toFixed(2) : 'n/a'
    console.log(`  ${fw.padEnd(20)} ${mb} MB`)
  }

  if (jsonOut) {
    writeFileSync(
      jsonOut,
      JSON.stringify(
        {
          tier: 'B-real-app',
          machine,
          passes: repeat,
          rows: jsonRows,
          retainedHeapMB: Object.fromEntries(
            CANONICAL.map((fw) => [fw, (heaps.get(fw) ?? []).map((b) => +(b / 1e6).toFixed(2))]),
          ),
        },
        null,
        2,
      ),
    )
    console.log(`\n[form-bench] wrote ${jsonOut}`)
  }
}

void main()
