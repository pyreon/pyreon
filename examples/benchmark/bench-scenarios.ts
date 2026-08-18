#!/usr/bin/env bun
/**
 * Cross-framework COVERAGE-EXPANSION driver — the scenarios the nine-op
 * row-list suite structurally cannot measure.
 *
 *   dbmon  sustained WIDE update: 100 rows × 6 cells, every value changing
 *          every tick. Deliberately the shape where fine-grained reactivity
 *          has no structural advantage (nothing can be skipped).
 *   tree   deep component tree: 2,047-instance mount, and context propagation
 *          to 1,024 consumers through 1,023 non-consuming interior nodes.
 *
 * Protocol is the repo standard (mirrors bench-fair.ts / bench-hydration.ts):
 *  - production `vite build`, real Chromium, `--expose-gc`;
 *  - ONE framework per fresh page (`?mode=scenarios&scenario=X&framework=Y`),
 *    so no cross-suite heap or JIT bias;
 *  - `--repeat N` pools raw samples across N passes, with the framework order
 *    reshuffled per pass;
 *  - median + 95% bootstrap CI, and a `🤝` marker whenever a framework's CI
 *    overlaps the leader's — an overlap is a TIE, not a loss;
 *  - per-iteration DOM verification in-page: dbmon reads back cell text AND
 *    threshold class on three rows; the tree checks all 1,024 leaves. A
 *    framework that silently no-ops fails the run instead of posting a fast
 *    number.
 *
 * AUTHOR-JUDGE CAVEAT: written and judged by the Pyreon authors, like the rest
 * of this suite. Ratios are the portable signal; absolute ms are machine- and
 * load-dependent. Stamp `uptime` and discard anything measured above load ~8.
 *
 * Run: bun bench-scenarios.ts [--repeat N] [--scenario dbmon|tree]
 */
import { execSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const argv = process.argv
const REPEAT = (() => {
  const i = argv.indexOf('--repeat')
  return i >= 0 ? Math.max(1, Number(argv[i + 1]) || 1) : 3
})()
const ONLY_SCENARIO = (() => {
  const i = argv.indexOf('--scenario')
  return i >= 0 ? argv[i + 1] : undefined
})()
const PORT = 4181

// Kept in sync with src/impl/scenarios.ts. Duplicated rather than imported
// because this driver runs in bun with no bundler and the impl module pulls in
// every framework's browser entry.
const SCENARIOS: { id: string; label: string; frameworks: string[] }[] = [
  {
    id: 'dbmon',
    label: 'dbmon — sustained wide update (100 rows × 6 cells, all changing)',
    frameworks: ['Vanilla JS', 'Pyreon', 'React 19', 'Preact', 'Vue 3', 'SolidJS', 'Svelte 5'],
  },
  {
    id: 'tree',
    label: 'deep tree — 2,047-component mount + context → 1,024 consumers',
    frameworks: [
      'Vanilla JS',
      'Pyreon',
      'React 19',
      'Preact',
      'Vue 3',
      'SolidJS',
      'SolidJS (eager props)',
      'Svelte 5',
    ],
  },
]

/**
 * Entries excluded from "best FRAMEWORK" ranking.
 *  - Vanilla is the raw-DOM floor, not a competitor.
 *  - `SolidJS (eager props)` is a diagnostic arm using a prop shape Solid's
 *    compiler does NOT emit (verified against babel-preset-solid). Ranking
 *    against it would reintroduce the very handicap this arm exists to expose.
 */
const NON_RANKING = new Set(['Vanilla JS', 'SolidJS (eager props)'])

interface SuiteResult {
  framework: string
  results: { name: string; median: number; samples: number[] }[]
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  if (s.length === 0) return 0
  return s.length % 2 ? (s[s.length >> 1] as number) : ((s[s.length / 2 - 1] as number) + (s[s.length / 2] as number)) / 2
}

function ci95(xs: number[]): [number, number] {
  // Percentile bootstrap on the median, 1000 resamples, deterministic LCG.
  let seed = 42
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff)
  const meds: number[] = []
  for (let b = 0; b < 1000; b++) {
    const re: number[] = []
    for (let i = 0; i < xs.length; i++) re.push(xs[Math.floor(rnd() * xs.length)] as number)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[Math.floor(0.025 * meds.length)] as number, meds[Math.floor(0.975 * meds.length)] as number]
}

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`
}

function stamp(label: string): void {
  try {
    console.log(`[bench-scenarios] ${label}: ${execSync('uptime').toString().trim()}`)
  } catch {
    /* uptime is unavailable on some platforms — not worth failing the run */
  }
}

const scenarios = ONLY_SCENARIO ? SCENARIOS.filter((s) => s.id === ONLY_SCENARIO) : SCENARIOS
if (scenarios.length === 0) {
  console.error(`[bench-scenarios] unknown scenario "${ONLY_SCENARIO}". Valid: ${SCENARIOS.map((s) => s.id).join(', ')}`)
  process.exit(1)
}

stamp('load BEFORE')
console.log('[bench-scenarios] building…')
execSync('bun run build', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })

console.log(`[bench-scenarios] starting preview on :${PORT}`)
const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: false,
})
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})

try {
  // key: `${scenarioId}\u0000${opName}\u0000${framework}` → pooled samples
  const pooled = new Map<string, number[]>()

  for (const scenario of scenarios) {
    for (let pass = 1; pass <= REPEAT; pass++) {
      const order = [...scenario.frameworks]
      for (let i = order.length - 1; i > 0; i--) {
        const j = (i * 7 + pass * 13) % (i + 1)
        ;[order[i], order[j]] = [order[j] as string, order[i] as string]
      }
      console.log(`[bench-scenarios] === ${scenario.id} pass ${pass}/${REPEAT} (${order.join(', ')}) ===`)
      for (const fw of order) {
        process.stdout.write(`[bench-scenarios]   ▸ ${fw} … `)
        const page = await browser.newPage()
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(String(e)))
        await page.goto(
          `http://localhost:${PORT}/?mode=scenarios&scenario=${scenario.id}&framework=${encodeURIComponent(fw)}`,
        )
        await page.waitForFunction(
          () => {
            const s = document.getElementById('status')?.textContent ?? ''
            return s.includes('Done') || s.includes('FAILED') || s.includes('Unknown')
          },
          { timeout: 300_000 },
        )
        const status = await page.evaluate(() => document.getElementById('status')?.textContent)
        if (!status?.includes('Done')) {
          throw new Error(`[bench-scenarios] ${scenario.id}/${fw} FAILED: ${status}\n${errors.join('\n')}`)
        }
        const suites = (await page.evaluate(
          () => (globalThis as { __benchResults?: unknown }).__benchResults,
        )) as SuiteResult[]
        for (const s of suites) {
          for (const r of s.results) {
            const key = `${scenario.id}\u0000${r.name}\u0000${s.framework}`
            pooled.set(key, [...(pooled.get(key) ?? []), ...r.samples])
          }
        }
        console.log('ok')
        await page.close()
      }
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  for (const scenario of scenarios) {
    console.log(`\n${scenario.label}`)
    console.log('═'.repeat(78))
    const ops = [
      ...new Set(
        [...pooled.keys()]
          .filter((k) => k.startsWith(`${scenario.id}\u0000`))
          .map((k) => k.split('\u0000')[1] as string),
      ),
    ]
    for (const op of ops) {
      console.log(`\n  ${op}`)
      console.log('  ' + '─'.repeat(74))
      const rows = scenario.frameworks
        .map((fw) => {
          const samples = pooled.get(`${scenario.id}\u0000${op}\u0000${fw}`) ?? []
          return { fw, med: median(samples), ci: ci95(samples), n: samples.length }
        })
        .filter((r) => r.n > 0)
        .sort((a, b) => a.med - b.med)
      if (rows.length === 0) continue
      const best = rows[0] as (typeof rows)[number]
      // Rank against the best RANKING framework — Vanilla is the floor and the
      // eager-props arm is a diagnostic; calling either "the winner" would
      // misreport the framework race.
      const bestFw = rows.find((r) => !NON_RANKING.has(r.fw)) ?? best
      for (const r of rows) {
        const tiedWithLeader =
          r !== bestFw && r.ci[0] <= bestFw.ci[1] && bestFw.ci[0] <= r.ci[1]
        const marker =
          r.fw === 'Vanilla JS'
            ? '(floor)'
            : r.fw === 'SolidJS (eager props)'
              ? `(diagnostic — ${(r.med / bestFw.med).toFixed(2)}× vs SolidJS)`
              : r === bestFw
                ? '🥇'
                : tiedWithLeader
                  ? '🤝 tie'
                  : `${(r.med / bestFw.med).toFixed(2)}× slower`
        console.log(
          `  ${r.fw.padEnd(11)} ${fmt(r.med).padStart(9)}  [${fmt(r.ci[0])}–${fmt(r.ci[1])}]  n=${String(r.n).padStart(3)}  ${marker}`,
        )
      }
    }
  }
} finally {
  await browser.close()
  preview.kill()
  stamp('load AFTER')
}
