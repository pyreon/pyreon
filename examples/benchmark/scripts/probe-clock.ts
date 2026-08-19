#!/usr/bin/env bun
/**
 * Measure the EFFECTIVE `performance.now()` quantum in the exact Chromium the
 * benchmarks run in.
 *
 * The suite's `RESOLUTION_FLOOR_MS = 0.1` encodes Chromium's documented 100µs
 * clamp for a non-isolated page. That constant decides which medians are
 * reportable and which are "too fast to time", so it is load-bearing for every
 * verdict — and it is an ASSUMPTION about the browser, not something the suite
 * measures. A headless launch, a flag, or a Chromium version bump can change
 * it, and if the real quantum is finer the suite is discarding measurements it
 * could have made; if it is coarser the suite is reporting noise.
 *
 * Method: sample `performance.now()` in a tight loop and take the smallest
 * NON-ZERO forward delta. Under a clamp every observed delta is a multiple of
 * the quantum, so the minimum non-zero delta IS the quantum.
 *
 * MEASURED RESULT (Chromium 151, 2026-08): `about:blank` gives 100µs, but the
 * benchmark page gives 5µs — because `vite.config.ts` serves COOP `same-origin`
 * + COEP `require-corp`, so the page is cross-origin ISOLATED and Chromium
 * lifts the Spectre-mitigation clamp by 20×. Probing the wrong URL therefore
 * gives the wrong floor in the CONSERVATIVE direction, which silently discards
 * measurements the suite is entitled to make. Always probe the page you are
 * actually going to measure in.
 *
 *   bun scripts/probe-clock.ts                              # about:blank (100µs)
 *   bun scripts/probe-clock.ts http://localhost:4179/       # the bench page (5µs)
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'about:blank'

const browser = await chromium.launch({
  headless: true,
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})
const page = await browser.newPage()
await page.goto(url)

const out = await page.evaluate(() => {
  const deltas: number[] = []
  for (let round = 0; round < 20; round++) {
    let prev = performance.now()
    for (let i = 0; i < 200_000; i++) {
      const now = performance.now()
      const d = now - prev
      if (d > 0) {
        deltas.push(d)
        prev = now
      }
    }
  }
  deltas.sort((a, b) => a - b)
  return {
    crossOriginIsolated: globalThis.crossOriginIsolated ?? false,
    samples: deltas.length,
    min: deltas[0] ?? 0,
    p01: deltas[Math.floor(deltas.length * 0.01)] ?? 0,
    median: deltas[Math.floor(deltas.length * 0.5)] ?? 0,
  }
})

console.log(`Chromium               ${browser.version()}`)
console.log(`crossOriginIsolated    ${out.crossOriginIsolated}`)
console.log(`non-zero deltas seen   ${out.samples}`)
console.log(`SMALLEST non-zero Δ    ${(out.min * 1000).toFixed(3)}µs   ← the effective quantum`)
console.log(`1st-percentile Δ       ${(out.p01 * 1000).toFixed(3)}µs`)
console.log(`median Δ               ${(out.median * 1000).toFixed(3)}µs`)

await browser.close()
