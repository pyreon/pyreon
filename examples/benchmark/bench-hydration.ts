#!/usr/bin/env bun
/**
 * Cross-framework HYDRATION benchmark driver — SSR HTML → interactive, real
 * Chromium, per-framework page isolation. The client half of SSR: every
 * SSR/SSG page pays this cost before first interaction works.
 *
 * Protocol (mirrors bench-fair.ts):
 *  - fixtures regenerated from each framework's OWN server renderer
 *    (scripts/gen-hydration-fixtures.ts) before the production `vite build`;
 *  - fresh Chromium page per framework per pass (`?mode=hydration&framework=X`);
 *  - `--repeat N` pools samples across N passes with per-pass order shuffle;
 *  - median + 95% bootstrap CI + CI-overlap `🤝` tie verdicts;
 *  - correctness gates run IN-PAGE per iteration (adoption node-identity,
 *    row count, real-click interactivity) — a failing gate fails the run.
 *
 * AUTHOR-JUDGE CAVEAT: written + judged by the Pyreon authors; scoped to this
 * page shape (1000-row keyed table). React's number includes its own
 * post-hydration lane commit wait (that IS its time-to-interactive); Solid /
 * Svelte / Octane are ABSENT — their hydration requires hydratable-mode
 * compiler output that cannot be hand-written faithfully; adding them needs
 * their real compile toolchains wired into this app (follow-up).
 */
import { execSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const REPEAT = (() => {
  const i = process.argv.indexOf('--repeat')
  return i >= 0 ? Math.max(1, Number(process.argv[i + 1]) || 1) : 3
})()
const PORT = 4179
const FRAMEWORKS = ['Pyreon', 'React 19', 'Preact', 'Vue 3']

interface SuiteResult {
  framework: string
  results: { name: string; median: number; samples: number[] }[]
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}

function ci95(xs: number[]): [number, number] {
  // Percentile bootstrap on the median, 1000 resamples (deterministic LCG).
  let seed = 42
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff)
  const meds: number[] = []
  for (let b = 0; b < 1000; b++) {
    const re: number[] = []
    for (let i = 0; i < xs.length; i++) re.push(xs[Math.floor(rnd() * xs.length)]!)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[Math.floor(0.025 * meds.length)]!, meds[Math.floor(0.975 * meds.length)]!]
}

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`
}

console.log('[bench-hydration] generating SSR fixtures (each framework’s own server renderer)…')
execSync('bun scripts/gen-hydration-fixtures.ts', { stdio: 'inherit' })
console.log('[bench-hydration] building…')
execSync('bun run build', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })

console.log(`[bench-hydration] starting preview on :${PORT}`)
const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: false,
})
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})

try {
  const pooled = new Map<string, number[]>()
  for (let pass = 1; pass <= REPEAT; pass++) {
    // Per-pass order shuffle (deterministic per pass index).
    const order = [...FRAMEWORKS]
    for (let i = order.length - 1; i > 0; i--) {
      const j = (i * 7 + pass * 13) % (i + 1)
      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }
    console.log(`[bench-hydration] === pass ${pass}/${REPEAT} (order: ${order.join(', ')}) ===`)
    for (const fw of order) {
      console.log(`[bench-hydration]   ▸ ${fw}`)
      const page = await browser.newPage()
      await page.goto(
        `http://localhost:${PORT}/?mode=hydration&framework=${encodeURIComponent(fw)}`,
      )
      await page.waitForFunction(
        () => {
          const s = document.getElementById('status')?.textContent ?? ''
          return s.includes('Done') || s.includes('FAILED')
        },
        { timeout: 180_000 },
      )
      const status = await page.evaluate(() => document.getElementById('status')?.textContent)
      if (status?.includes('FAILED')) {
        throw new Error(`[bench-hydration] ${fw} FAILED: ${status}`)
      }
      const suites = (await page.evaluate(
        () => (globalThis as { __benchResults?: unknown }).__benchResults,
      )) as SuiteResult[]
      for (const s of suites) {
        for (const r of s.results) {
          const key = s.framework
          pooled.set(key, [...(pooled.get(key) ?? []), ...r.samples])
        }
      }
      await page.close()
    }
  }

  console.log('\nHydration: 1,000-row SSR table → interactive (adoption + click gates in-page)')
  console.log('─'.repeat(78))
  const rows = [...pooled.entries()]
    .map(([fw, samples]) => ({ fw, med: median(samples), ci: ci95(samples), n: samples.length }))
    .sort((a, b) => a.med - b.med)
  const best = rows[0]!
  for (const r of rows) {
    const ratio = r.med / best.med
    const tied = r !== best && r.ci[0] <= best.ci[1] && best.ci[0] <= r.ci[1]
    const marker = r === best ? '🥇' : tied ? '🤝' : `${ratio.toFixed(2)}× slower`
    console.log(
      `  ${r.fw.padEnd(10)} ${fmt(r.med).padStart(9)}  [${fmt(r.ci[0])}–${fmt(r.ci[1])}]  n=${r.n}  ${marker}`,
    )
  }
} finally {
  await browser.close()
  preview.kill()
}
