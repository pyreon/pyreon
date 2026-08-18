#!/usr/bin/env bun
/**
 * Cross-framework APP-PAGE hydration benchmark driver — SSR HTML → interactive
 * for a statically composed page (320 components), real Chromium, per-
 * framework page isolation.
 *
 * Companion to bench-hydration.ts, not a replacement. That bench hydrates a
 * 1000-row keyed `<For>` table; this one hydrates the ordinary app-page shape
 * (nested sections / form rows composed as components). The distinction is
 * load-bearing rather than cosmetic: Pyreon's `<For>` rows already adopt their
 * server nodes, while a statically composed component tree takes a different
 * hydration path entirely.
 *
 * Protocol (mirrors bench-fair.ts / bench-hydration.ts):
 *  - fixtures regenerated from each framework's OWN server renderer, with a
 *    markup-equality gate across all four, before the production `vite build`;
 *  - cross-origin isolation asserted + clock quantum MEASURED before trusting
 *    any number (Chromium clamps performance.now() to 100µs otherwise);
 *  - the bundle the PAGE loaded is compared against the bundle on DISK, so a
 *    stale preview file map cannot silently measure the wrong build;
 *  - fresh Chromium page per framework per pass, `--repeat N` pools samples
 *    with a per-pass order shuffle;
 *  - median + 95% bootstrap CI + CI-overlap `🤝` tie verdicts;
 *  - 1-min load average stamped before AND after each pass.
 *
 * AUTHOR-JUDGE CAVEAT: written and judged by the Pyreon authors. Solid /
 * Svelte / Octane are absent for the same reason as in bench-hydration.ts —
 * their hydration needs hydratable-mode compiler output that cannot be
 * hand-written faithfully.
 */
import { execSync, spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const REPEAT = (() => {
  const i = process.argv.indexOf('--repeat')
  return i >= 0 ? Math.max(1, Number(process.argv[i + 1]) || 1) : 3
})()
const PORT = 4181
const FRAMEWORKS = ['Pyreon', 'React 19', 'Preact', 'Vue 3']

interface SuiteResult {
  framework: string
  results: { name: string; median: number; samples: number[] }[]
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}

function ci95(xs: number[]): [number, number] {
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

const fmt = (ms: number): string => (ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`)
const load1 = (): string =>
  execSync("uptime | sed 's/.*load averages*: *//' | awk '{print $1}'").toString().trim()
const cv = (xs: number[]): number => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m
}

console.log('[bench-apppage] generating Pyreon page source…')
execSync('bun scripts/gen-apppage-source.ts', { stdio: 'inherit' })
console.log('[bench-apppage] generating SSR fixtures (own renderers + markup-equality gate)…')
execSync('bun scripts/gen-apppage-fixtures.ts', { stdio: 'inherit' })
console.log('[bench-apppage] building…')
execSync('bun run build', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })

// Entry bundle ON DISK — compared against what the page actually loads.
const assetDir = join(import.meta.dirname, 'dist/assets')
const diskEntry = readdirSync(assetDir).filter((f) => /^index-.*\.js$/.test(f))
if (diskEntry.length !== 1) {
  throw new Error(`[bench-apppage] expected exactly 1 dist entry chunk, found: ${diskEntry.join(', ')}`)
}
const diskBundle = diskEntry[0]!
const diskBytes = readFileSync(join(assetDir, diskBundle)).byteLength
console.log(`[bench-apppage] disk entry bundle: ${diskBundle} (${diskBytes} bytes)`)

console.log(`[bench-apppage] starting preview on :${PORT}`)
const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 1500))

const baseUrl = `http://localhost:${PORT}/`
const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})

try {
  // ── Preflight 1: timer resolution ────────────────────────────────────────
  const clockPage = await browser.newPage()
  await clockPage.goto(baseUrl, { waitUntil: 'load' })
  const clock = await clockPage.evaluate(() => {
    let smallest = Number.POSITIVE_INFINITY
    let prev = performance.now()
    const end = prev + 150
    while (performance.now() < end) {
      const t = performance.now()
      if (t > prev) {
        const d = t - prev
        if (d < smallest) smallest = d
        prev = t
      }
    }
    return {
      isolated: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
      quantumMs: Number.isFinite(smallest) ? smallest : Number.POSITIVE_INFINITY,
    }
  })
  console.log(
    `[bench-apppage] timer: crossOriginIsolated=${clock.isolated} · measured quantum ${(clock.quantumMs * 1000).toFixed(1)}µs`,
  )
  if (!clock.isolated || clock.quantumMs > 0.02) {
    throw new Error(
      `[bench-apppage] timer too coarse: isolated=${clock.isolated}, quantum=${(clock.quantumMs * 1000).toFixed(1)}µs`,
    )
  }

  // ── Preflight 2: the page must load the bundle that is on DISK ───────────
  const loaded = await clockPage.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => /assets\/index-.*\.js/.test(n)),
  )
  if (!loaded.some((u) => u.includes(diskBundle))) {
    throw new Error(
      `[bench-apppage] ARM MISMATCH — page loaded [${loaded.join(', ')}] but disk has ${diskBundle}. ` +
        `A stale preview file map would measure the wrong build.`,
    )
  }
  console.log(`[bench-apppage] verified page loaded ${diskBundle}`)
  await clockPage.close()

  // ── Passes ───────────────────────────────────────────────────────────────
  const pooled = new Map<string, number[]>()
  const adoption = new Map<string, string>()
  for (let pass = 1; pass <= REPEAT; pass++) {
    const order = [...FRAMEWORKS]
    for (let i = order.length - 1; i > 0; i--) {
      const j = (i * 7 + pass * 13) % (i + 1)
      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }
    const l0 = load1()
    console.log(`[bench-apppage] === pass ${pass}/${REPEAT} (order: ${order.join(', ')}) load=${l0} ===`)
    for (const fw of order) {
      const page = await browser.newPage()
      await page.goto(`${baseUrl}?mode=apppage&framework=${encodeURIComponent(fw)}`)
      await page.waitForFunction(
        () => {
          const s = document.getElementById('status')?.textContent ?? ''
          return s.includes('Done') || s.includes('FAILED')
        },
        { timeout: 300_000 },
      )
      const status = await page.evaluate(() => document.getElementById('status')?.textContent)
      if (status?.includes('FAILED')) throw new Error(`[bench-apppage] ${fw} FAILED: ${status}`)
      const suites = (await page.evaluate(
        () => (globalThis as { __benchResults?: unknown }).__benchResults,
      )) as SuiteResult[]
      const adopt = (await page.evaluate(
        () => (globalThis as { __appPageAdoption?: unknown }).__appPageAdoption,
      )) as { retained: number; total: number } | undefined
      if (adopt) adoption.set(fw, `${adopt.retained}/${adopt.total}`)
      for (const s of suites) {
        for (const r of s.results) {
          pooled.set(s.framework, [...(pooled.get(s.framework) ?? []), ...r.samples])
        }
      }
      console.log(`[bench-apppage]   ▸ ${fw}  adopted ${adoption.get(fw) ?? 'n/a'}`)
      await page.close()
    }
    console.log(`[bench-apppage] === pass ${pass} end load=${load1()} ===`)
  }

  console.log(
    `\nApp-page hydration: 320-component static composition, SSR HTML → interactive`,
  )
  console.log('─'.repeat(92))
  const rows = [...pooled.entries()]
    .map(([fw, s]) => ({ fw, med: median(s), ci: ci95(s), n: s.length, cv: cv(s) }))
    .sort((a, b) => a.med - b.med)
  const best = rows[0]!
  for (const r of rows) {
    const tied = r !== best && r.ci[0] <= best.ci[1] && best.ci[0] <= r.ci[1]
    const marker = r === best ? '🥇' : tied ? '🤝 tie' : `${(r.med / best.med).toFixed(2)}× slower`
    console.log(
      `  ${r.fw.padEnd(10)} ${fmt(r.med).padStart(9)}  [${fmt(r.ci[0])}–${fmt(r.ci[1])}]  ` +
        `n=${r.n}  cv=${(r.cv * 100).toFixed(0)}%  adopted=${(adoption.get(r.fw) ?? 'n/a').padStart(9)}  ${marker}`,
    )
  }
} finally {
  await browser.close()
  preview.kill()
}
