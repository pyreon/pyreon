/**
 * Real-app benchmark: classic vs cssVariables dark/light theme-toggle.
 *
 * Renders a real-component grid (N × `@pyreon/ui-components` Button across
 * states/sizes + N × genuinely mode-varying `mode(a, b)` rocketstyle boxes)
 * under `<PyreonUI mode={signal}>`, then measures the wall-clock + perf
 * counters of a batch of mode flips in BOTH modes — each in its own fresh
 * page (isolated JS heap), with forced GC + adaptive-ish warmup, median +
 * 95% bootstrap CI.
 *
 * Methodology mirrors `examples/benchmark/bench-fair.ts`: per-page isolation,
 * `--js-flags=--expose-gc`, `--enable-precise-memory-info`, optional CDP CPU
 * throttle (`--throttle 4`). Runs against the Vite DEV server so the
 * `import.meta.env.DEV`-gated perf counters fire — so absolute ms carries
 * dev overhead; the classic-vs-vars RATIO + the exact zero-work counters are
 * the signal (a prod build would be faster in both but drop the counters).
 *
 *   bun scripts/bench-cssvars.ts [--n 150] [--flips 20] [--runs 9] [--warmup 10] [--throttle 1]
 */
import { spawn } from 'node:child_process'
import { chromium, type Page } from 'playwright'

const PORT = 5210
const argv = process.argv.slice(2)
const argNum = (flag: string, def: number): number => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def
}
const N = argNum('--n', 150)
const FLIPS = argNum('--flips', 20)
const RUNS = argNum('--runs', 9)
const WARMUP = argNum('--warmup', 10)
const THROTTLE = argNum('--throttle', 1)

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (pos - lo) * (sorted[hi]! - sorted[lo]!)
}
function bootstrapCI95(samples: number[]): [number, number] {
  const medians: number[] = []
  for (let b = 0; b < 1000; b++) {
    const resample: number[] = []
    for (let i = 0; i < samples.length; i++) {
      resample.push(samples[Math.floor(Math.random() * samples.length)]!)
    }
    medians.push(quantile([...resample].sort((x, y) => x - y), 0.5))
  }
  medians.sort((a, b) => a - b)
  return [quantile(medians, 0.025), quantile(medians, 0.975)]
}

interface ModeResult {
  label: string
  medianMs: number
  ci95: [number, number]
  counts: Record<string, number>
  components: number
}

async function runMode(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  vars: boolean,
): Promise<ModeResult> {
  const ctx = await browser.newContext()
  const page: Page = await ctx.newPage()
  if (THROTTLE > 1) {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  }
  await page.goto(`http://localhost:${PORT}/?vars=${vars ? '1' : '0'}&n=${N}`, {
    waitUntil: 'networkidle',
  })
  await page.waitForFunction(() => (window as any).__bench !== undefined, { timeout: 15_000 })
  await page.waitForSelector('#sentinel', { timeout: 15_000 })

  const label = (await page.evaluate(() => (window as any).__bench.mode)) as string
  const components = (await page.evaluate(() => (window as any).__bench.components)) as number

  // Warm the JIT.
  await page.evaluate((w) => (window as any).__bench.warmup(w), WARMUP)

  const samples: number[] = []
  let lastCounts: Record<string, number> = {}
  for (let r = 0; r < RUNS; r++) {
    await page.evaluate(() => (globalThis as { gc?: () => void }).gc?.())
    const { ms, counts } = (await page.evaluate(
      (f) => (window as any).__bench.measure(f),
      FLIPS,
    )) as { ms: number; counts: Record<string, number> }
    samples.push(ms)
    lastCounts = counts
  }
  await ctx.close()

  samples.sort((a, b) => a - b)
  return {
    label,
    medianMs: quantile(samples, 0.5),
    ci95: bootstrapCI95(samples),
    counts: lastCounts,
    components,
  }
}

async function main(): Promise<void> {
  console.log('[bench-cssvars] starting Vite dev server…')
  const server = spawn(
    'bun',
    ['run', '--filter=@pyreon/example-cssvars-bench', 'dev', '--', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'inherit'], cwd: process.cwd() },
  )
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('dev server start timeout')), 30_000)
    server.stdout?.on('data', (c: Buffer) => {
      if (c.toString().includes('Local:') || c.toString().includes(`localhost:${PORT}`)) {
        clearTimeout(t)
        setTimeout(res, 500)
      }
    })
    server.on('exit', (code) => rej(new Error(`dev server exited ${code}`)))
  })

  const browser = await chromium.launch({
    headless: true,
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  })

  try {
    console.log(
      `[bench-cssvars] ${N * 2} components/page · ${FLIPS} flips/run · ${RUNS} runs · warmup ${WARMUP} · throttle ${THROTTLE}× · Chromium ${browser.version()}`,
    )
    const classic = await runMode(browser, false)
    const vars = await runMode(browser, true)

    const pad = (s: string, n: number): string => s.padEnd(n)
    const ms = (r: ModeResult): string =>
      `${r.medianMs.toFixed(2)} [${r.ci95[0].toFixed(2)}, ${r.ci95[1].toFixed(2)}]`
    console.log(`\n=== Theme-toggle: classic vs cssVariables (${classic.components} real components) ===\n`)
    console.log(`${pad('metric', 28)}${pad('classic', 26)}${pad('cssVariables', 26)}`)
    console.log('-'.repeat(80))
    console.log(`${pad(`wall-clock ms / ${FLIPS} flips`, 28)}${pad(ms(classic), 26)}${pad(ms(vars), 26)}`)
    const ratio = classic.medianMs / Math.max(vars.medianMs, 0.001)
    console.log(`${pad('→ speedup', 28)}${pad('1.00×', 26)}${pad(`${ratio.toFixed(2)}×`, 26)}`)
    const counterKeys = ['styler.resolve', 'rocketstyle.getTheme', 'styler.sheet.insert', 'runtime.mountChild']
    for (const k of counterKeys) {
      console.log(
        `${pad(k + ' (/run)', 28)}${pad(String(classic.counts[k] ?? 0), 26)}${pad(String(vars.counts[k] ?? 0), 26)}`,
      )
    }
    console.log('\n[bench-cssvars] counters are per-run (= per FLIPS-batch). vars=cssVariables.')
    console.log(JSON.stringify({ classic, vars, ratio, config: { N: N * 2, FLIPS, RUNS, WARMUP, THROTTLE } }))
  } finally {
    await browser.close()
    server.kill('SIGTERM')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
