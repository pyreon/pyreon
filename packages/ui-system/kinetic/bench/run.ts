/**
 * @pyreon/kinetic animation-overhead benchmark — real Chromium via Playwright.
 *
 * Measures the main-thread framework JS to reveal N elements with an
 * equivalent enter / stagger animation — trigger through the 2nd animation
 * frame, the same end point for every arm — comparing:
 *   - kinetic   — the idiomatic `kinetic(tag).<config>` component API
 *   - motion    — Motion One (`animate` from the `motion` package, real dep)
 *   - baseline  — hand-rolled bare-CSS transitions (the theoretical floor)
 *
 * HONEST FRAMING (author-judge disclosed): kinetic is CSS-transition-based —
 * it applies enter/leave classes/styles and lets the browser COMPOSITOR run
 * the tween. Motion One's `animate` on compositable props uses WAAPI, also
 * compositor-driven. So the actual animation is off-main-thread and IDENTICAL
 * in smoothness across all three — the only framework-attributable cost is the
 * main-thread JS to set up + commit the reveal (including kinetic's
 * double-rAF enter-to application), which is what this measures.
 * kinetic's number includes full Pyreon component mount semantics (VNode→DOM,
 * reactive props, an enter state machine, transitionend wiring) that the
 * raw-DOM contenders (motion / baseline) never pay — so this is a "total JS to
 * ship a declarative animated reveal" bench, and the raw-DOM floors are
 * EXPECTED to be lower. What kinetic buys for that overhead: a declarative,
 * SSR-safe, reactive-prop component model. What it CANNOT do (architectural,
 * not a perf axis): spring physics, interruptible value animation, layout
 * animations, gestures — Motion One / Framer Motion own those.
 *
 * OBJECTIVITY: NODE_ENV=production forced before any framework import; real
 * published `motion`; real Chromium; per-sample fresh container + teardown;
 * un-timed element creation (only the reveal is timed); correctness gate per
 * sample; median + 95% bootstrap CI + CI-overlap tie marker; randomized run
 * order per (op,n); machine stamp printed.
 *
 * Usage: bun bench/run.ts [--quick]   (from packages/ui-system/kinetic)
 */
process.env.NODE_ENV = 'production'

import { cpus, loadavg } from 'node:os'
import { join } from 'node:path'
import { serve } from 'bun'
import { chromium } from 'playwright'

const HERE = import.meta.dir

// ─── Stats (median + bootstrap CI95 + tie marker) ────────────────────────────

function pct(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!
  const idx = p * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

function bootstrapCI(samples: number[], B = 1000): { median: number; lo: number; hi: number } {
  const sorted = samples.slice().sort((a, b) => a - b)
  const median = pct(sorted, 0.5)
  const medians = new Array<number>(B)
  for (let b = 0; b < B; b++) {
    const resample = new Array<number>(samples.length)
    for (let i = 0; i < samples.length; i++) {
      resample[i] = samples[Math.floor(Math.random() * samples.length)]!
    }
    resample.sort((a, b2) => a - b2)
    medians[b] = pct(resample, 0.5)
  }
  medians.sort((a, b2) => a - b2)
  return { median, lo: pct(medians, 0.025), hi: pct(medians, 0.975) }
}

interface Row {
  lib: string
  median: number
  lo: number
  hi: number
}

// ─── Bundle scenarios for the browser ────────────────────────────────────────

async function bundleScenarios(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(HERE, 'scenarios.ts')],
    target: 'browser',
    format: 'esm',
    minify: false,
    conditions: ['bun'], // resolve @pyreon/* workspace deps to src
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error('bench bundle failed')
  }
  return await result.outputs[0]!.text()
}

// ─── Runner ──────────────────────────────────────────────────────────────────

// N scaled so every timed block lands WELL above Chromium's ~100µs
// performance.now() clamp — small-N reveals sit at the resolution floor and
// produce unstable ratios.
const SCENARIOS: Array<{ op: string; n: number; label: string }> = [
  { op: 'enter', n: 500, label: 'enter 500' },
  { op: 'enter', n: 2000, label: 'enter 2000' },
  { op: 'stagger', n: 300, label: 'stagger 300' },
  { op: 'stagger', n: 1000, label: 'stagger 1000' },
]
const LIBS = ['kinetic', 'motion', 'baseline'] as const
// `--quick`: structural/correctness smoke only (tiny N, few samples) — its
// timings are not meaningful.
const QUICK = process.argv.includes('--quick')
const WARMUP = QUICK ? 1 : 8
const SAMPLES = QUICK ? 3 : 25

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

async function main() {
  const bundle = await bundleScenarios()
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">${bundle}</script></body></html>`

  const server = serve({
    port: 0,
    fetch() {
      // Cross-origin isolation unlocks Chromium's fine-grained clock (~5µs).
      // Without it performance.now() is clamped to 100µs and every sample here
      // (0.4–1.1ms) is a handful of ticks — the previous results were quantized.
      return new Response(html, {
        headers: {
          'content-type': 'text/html',
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-embedder-policy': 'require-corp',
        },
      })
    },
  })
  const url = `http://localhost:${server.port}/`

  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('console', (m) => console.error('[page]', m.type(), m.text()))
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(url)
  await page.waitForFunction(() => typeof (globalThis as any).__kbench?.runScenario === 'function')
  if (!(await page.evaluate(() => globalThis.crossOriginIsolated))) {
    console.error('[kinetic-bench] page is not cross-origin isolated — the clock is clamped to 100µs; aborting')
    process.exit(1)
  }

  const results = new Map<string, Row[]>()

  // KBENCH_SCENARIOS=enter:250,enter:500 — ad-hoc sizes (scaling probes).
  const custom = process.env.KBENCH_SCENARIOS?.split(',').map((t) => {
    const [op, size] = t.split(':')
    return { op: op!, n: Number(size), label: `${op} ${size}` }
  })
  const scenarios = custom ?? (QUICK ? [{ op: 'enter', n: 50, label: 'enter 50 (quick)' }, { op: 'stagger', n: 50, label: 'stagger 50 (quick)' }] : SCENARIOS)
  for (const { op, n, label } of scenarios) {
    const rows: Row[] = []
    for (const lib of shuffle([...LIBS])) {
      console.error(`[kinetic-bench] ${label} · ${lib}…`)
      const armStart = performance.now()
      const samples: number[] = await page.evaluate(
        ([l, o, size, w, s]) =>
          (globalThis as any).__kbench.runScenario(l, o, size, w, s) as Promise<number[]>,
        [lib, op, n, WARMUP, SAMPLES] as const,
      )
      console.error(`[kinetic-bench]   ${label} · ${lib} done in ${((performance.now() - armStart) / 1000).toFixed(1)}s`)
      const { median, lo, hi } = bootstrapCI(samples)
      rows.push({ lib, median, lo, hi })
    }
    rows.sort((a, b) => a.median - b.median)
    results.set(label, rows)
  }

  const browserVersion = browser.version()
  await browser.close()
  server.stop()

  // ─── Report ────────────────────────────────────────────────────────────────
  const chromiumVersion = browserVersion
  const machine =
    `${cpus()[0]?.model ?? 'unknown'} · Chromium ${chromiumVersion} (Playwright, V8) · ` +
    `harness bun ${Bun.version} · loadavg ${loadavg().map((l) => l.toFixed(2)).join(' ')}`
  console.log(`\n@pyreon/kinetic — animation JS-overhead benchmark`)
  console.log(`${machine}`)
  console.log(`warmup ${WARMUP} · ${SAMPLES} samples · median ± 95% bootstrap CI · lower = faster`)
  console.log('  timed = main-thread JS from the reveal trigger through the 2nd animation frame')
  console.log('  (same end point for every arm; idle + browser render time excluded)\n')

  for (const [label, rows] of results) {
    console.log(`  ${label}`)
    // `baseline` is the raw-CSS FLOOR (it runs no animation abstraction — no
    // state machine, completion callback, reduced-motion, or reactivity), so
    // it is the "cost of abstraction" reference, NOT the peer. The real
    // head-to-head is kinetic vs the animation-library peer (motion).
    const kin = rows.find((r) => r.lib === 'kinetic')!
    const mot = rows.find((r) => r.lib === 'motion')!
    const peerTie = kin.lo <= mot.hi && mot.lo <= kin.hi
    const animWinner = peerTie ? null : kin.median < mot.median ? 'kinetic' : 'motion'
    for (const r of rows) {
      let rel: string
      if (r.lib === 'baseline') {
        rel = 'raw-CSS floor'
      } else if (peerTie) {
        rel = '🤝 anim-lib tie'
      } else if (r.lib === animWinner) {
        rel = '🥇 fastest anim-lib'
      } else {
        const peer = r.lib === 'kinetic' ? mot : kin
        rel = `${(r.median / peer.median).toFixed(2)}× vs peer`
      }
      console.log(
        `    ${r.lib.padEnd(10)} ${r.median.toFixed(3).padStart(9)} ms  ` +
          `[${r.lo.toFixed(3)}, ${r.hi.toFixed(3)}]  ${rel}`,
      )
    }
    console.log('')
  }
  console.log('  Lower is faster. `baseline` = hand-rolled bare-CSS transitions (the floor —')
  console.log('  no state machine / callbacks / reduced-motion / reactivity). 🥇/🤝 = the')
  console.log('  kinetic-vs-Motion-One head-to-head (🤝 = CI95 overlap = statistical tie).')
  console.log('  See bench/run.ts header for the honest CSS-offload framing + what each buys.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
