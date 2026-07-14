/**
 * Responsive-resolution throughput benchmark — measures the @pyreon/unistyle
 * HOT PATHS that every styled / rocketstyle / coolgrid / elements component
 * rides on at render time.
 *
 * Usage: bun scripts/bench/core/unistyle.ts
 *
 * WHAT IT MEASURES (the real production pipeline, no mocks):
 *   - `styles()`          — flat theme → CSS via the 257-descriptor property map
 *                           (key→index fast path).
 *   - makeItResponsive    — the full responsive engine: normalize → transform →
 *                           optimize → optimizeBreakpointDeltas → @media wrap,
 *                           across the three input shapes (scalar / mobile-first
 *                           array / breakpoint object).
 *   - render-cache hit    — the WeakMap<internalTheme, WeakMap<outerTheme, …>>
 *                           verbatim-return fast path (stable-provider re-render).
 *   - optimizeBreakpointDeltas — the mobile-first cascade diff in isolation.
 *
 * OBJECTIVITY CONTRACT (the same discipline as scripts/bench/core/styler.ts):
 *
 * 1. `NODE_ENV=production` is forced FIRST — unistyle gates its `__pyreon_count__`
 *    perf-counter sinks on it; benching dev mode measures the instrumentation.
 *
 * 2. REAL pipeline. The `styles` callback IS the shipped `styles()` engine and
 *    `css` IS the styler tagged template — exactly what a `styled()` render runs.
 *    A CORRECTNESS GATE asserts each path emits the expected declarations (and
 *    the right per-breakpoint @media placement) BEFORE timing, so a path can't
 *    "win" by not doing the work.
 *
 * 3. VARIED inputs — a monotonic counter is baked into every theme value so JSC
 *    cannot hoist a loop-invariant resolve out of the timed window and
 *    manufacture fake single-digit-ns readings.
 *
 * 4. FRESH internal-theme object per cold op — the render/optimize caches key on
 *    object identity, so a fresh object is a genuine cold miss (full pipeline).
 *    The cache-hit row cycles a FIXED pool so every op after warmup is a real
 *    verbatim-return hit — the cold↔hit ratio is the headline number.
 *
 * 5. MEDIAN + 95% bootstrap CI — a single mean hides multi-modal JIT tiering.
 *
 * HONEST FRAMING (author-judge disclosed — the framework author wrote + judges
 * this bench): this is an INTERNAL THROUGHPUT bench, NOT a competitor head-to-
 * head. styled-system (`@styled-system/core`) and theme-ui (`@theme-ui/css`) —
 * the dominant responsive-style-prop systems — resolve responsive values into a
 * nested style OBJECT (`{ '@media …': { … } }`), whereas unistyle resolves into
 * a CSS STRING with `@media` blocks AND additionally runs a mobile-first delta
 * pass (`optimizeBreakpointDeltas`) that neither competitor does. A strict
 * "same output CSS" comparison is therefore not cleanly definable, and a rough
 * throughput race would compare different amounts of work. So this bench locks
 * unistyle's own hot-path throughput + the cache-hit speedup rather than
 * claiming a cross-library win. The one portable architectural claim (R2,
 * reasoned): unistyle emits fewer bytes per responsive cascade than either
 * competitor because the delta pass drops re-emitted unchanged declarations —
 * neither styled-system nor theme-ui deduplicate against the mobile-first
 * cascade, so their output re-states every property at every breakpoint.
 */

// Must run before any framework module evaluates its dev gates.
process.env.NODE_ENV = 'production'

import { css } from '../../../packages/ui-system/styler/src/css'
import { createMediaQueries, sortBreakpoints } from '../../../packages/ui-system/unistyle/src/responsive'
import makeItResponsive from '../../../packages/ui-system/unistyle/src/responsive/makeItResponsive'
import optimizeBreakpointDeltas from '../../../packages/ui-system/unistyle/src/responsive/optimizeBreakpointDeltas'
import styles from '../../../packages/ui-system/unistyle/src/styles/styles/index'

// ─── Stats harness (mirrors styler.ts) ──────────────────────────────────────

interface Sample {
  lib: string
  median: number // ops/sec
  lo: number
  hi: number
}

function pct(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

function bootstrapCI(samples: number[], B = 1000): { median: number; lo: number; hi: number } {
  const sorted = samples.slice().sort((a, b) => a - b)
  const median = pct(sorted, 0.5)
  const n = samples.length
  const medians: number[] = new Array(B)
  for (let b = 0; b < B; b++) {
    const resample: number[] = new Array(n)
    for (let i = 0; i < n; i++) resample[i] = samples[(Math.random() * n) | 0]!
    resample.sort((a, b2) => a - b2)
    medians[b] = pct(resample, 0.5)
  }
  medians.sort((a, b) => a - b)
  return { median, lo: pct(medians, 0.025), hi: pct(medians, 0.975) }
}

function measure(
  lib: string,
  op: (i: number) => void,
  opsPerWindow: number,
  windows = 30,
  warmupWindows = 6,
): Sample {
  let counter = 0
  for (let w = 0; w < warmupWindows; w++) for (let j = 0; j < opsPerWindow; j++) op(counter++)
  const opsPerSec: number[] = []
  for (let w = 0; w < windows; w++) {
    const start = performance.now()
    for (let j = 0; j < opsPerWindow; j++) op(counter++)
    const dt = performance.now() - start
    opsPerSec.push((opsPerWindow / dt) * 1000)
  }
  const { median, lo, hi } = bootstrapCI(opsPerSec)
  return { lib, median, lo, hi }
}

const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

function report(rows: Sample[]): void {
  const w = Math.max(...rows.map((r) => r.lib.length))
  for (const r of rows) {
    console.log(
      `    ${r.lib.padEnd(w)}  ${fmt(r.median).padStart(9)} ops/s  [${fmt(r.lo)}–${fmt(r.hi)}]`,
    )
  }
}

// ─── Shared setup ────────────────────────────────────────────────────────────

const BP = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1440 }
const OUTER = {
  rootSize: 16,
  breakpoints: BP,
  __PYREON__: {
    sortedBreakpoints: sortBreakpoints(BP),
    media: createMediaQueries({ breakpoints: BP, rootSize: 16, css }),
  },
}

const resolver = makeItResponsive({ key: '$s', css, styles, normalize: true })
const resolve = (t: Record<string, unknown>) => resolver({ theme: OUTER, $s: t })

// Realistic flat component theme (~10 recognized props) — the `styles()` input.
const flatTheme = (i: number) => ({
  display: 'flex',
  padding: 8 + (i & 7),
  margin: 4,
  color: `rgb(${i & 255},0,0)`,
  backgroundColor: '#f0f0f0',
  fontSize: 14,
  borderRadius: 4,
  borderWidthTop: 1,
  gap: 8,
  alignItems: 'center',
})

// Responsive shapes — a counter varies the values so JSC can't hoist.
const scalarTheme = (i: number) => ({
  padding: 8 + (i & 7),
  color: `rgb(${i & 255},0,0)`,
  fontSize: 14,
  display: 'flex',
})
const arrayTheme = (i: number) => ({
  padding: [8 + (i & 7), 12, 16, 24],
  fontSize: [12, null, 16, 18],
  color: [`rgb(${i & 255},0,0)`, null, 'blue'],
})
const objectTheme = (i: number) => ({
  padding: { xs: 8 + (i & 7), md: 16, lg: 24 },
  fontSize: { xs: 12, md: 16 },
  color: { xs: `rgb(${i & 255},0,0)`, lg: 'blue' },
})

// A pool of stable internal-theme objects for the cache-hit row.
const POOL_SIZE = 64
const pool = Array.from({ length: POOL_SIZE }, (_, i) => objectTheme(i * 977))

// Realistic 6-breakpoint per-breakpoint CSS for the optimizer row.
const deltaInput = (i: number): string[] => [
  `padding: ${8 + (i & 7)}px; color: red; font-size: 12px; display: flex;`,
  `padding: 12px; color: red; font-size: 12px; display: flex;`,
  `padding: 16px; color: blue; font-size: 14px; display: flex;`,
  `padding: 16px; color: blue; font-size: 14px; display: flex;`,
  `padding: 24px; color: blue; font-size: 16px; display: grid;`,
  `padding: 24px; color: blue; font-size: 16px; display: grid;`,
]

// ─── Correctness gate ────────────────────────────────────────────────────────

function assertCorrect(): void {
  // styles() flat
  const flat = String(styles({ theme: flatTheme(1), css, rootSize: 16 }))
  if (!flat.includes('display: flex;') || !flat.includes('color: rgb(1,0,0);'))
    throw new Error(`[unistyle-bench] styles() flat FAIL`)

  // array-gap forward-fill: color turns blue at @md, not @sm
  const arr = (resolve(arrayTheme(1)) as unknown[]).map(String).join(' ')
  if (!arr.includes('color: rgb(1,0,0);')) throw new Error(`[unistyle-bench] array base FAIL`)
  // md block carries the blue delta; NO sm block carries blue.
  if (/min-width: 36em[^}]*color: blue/.test(arr))
    throw new Error(`[unistyle-bench] array-gap regression: blue at @sm`)
  if (!/min-width: 48em[^}]*color: blue/.test(arr))
    throw new Error(`[unistyle-bench] array-gap FAIL: blue not at @md`)

  // cache hit returns the SAME array reference
  const first = resolve(pool[0]!)
  const second = resolve(pool[0]!)
  if (first !== second) throw new Error(`[unistyle-bench] render cache FAIL (not verbatim)`)

  // delta optimizer drops re-emitted unchanged declarations
  const d = optimizeBreakpointDeltas(deltaInput(1))
  if (d[1]!.includes('color: red') || !d[2]!.includes('color: blue'))
    throw new Error(`[unistyle-bench] optimizeBreakpointDeltas FAIL`)

  console.log(
    '  ✓ correctness gate passed (styles flat · array-gap @md placement · cache verbatim · delta pruning)',
  )
}

// ─── Run ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('Responsive-Resolution Throughput Benchmark (Bun / JSC)')
  console.log('@pyreon/unistyle — internal hot paths (NOT a cross-library race; see header)')
  console.log('='.repeat(74))
  assertCorrect()

  console.log('\n  styles() — flat theme → CSS (257-descriptor property map, key→index)')
  report([measure('styles() flat', (i) => void styles({ theme: flatTheme(i), css, rootSize: 16 }), 2000)])

  console.log('\n  makeItResponsive — cold resolve (fresh theme, full pipeline) by input shape')
  const cold = [
    measure('scalar', (i) => void resolve(scalarTheme(i)), 2000),
    measure('mobile-first array', (i) => void resolve(arrayTheme(i)), 2000),
    measure('breakpoint object', (i) => void resolve(objectTheme(i)), 2000),
  ]
  report(cold)

  console.log('\n  makeItResponsive — render-cache HIT (stable theme → verbatim return)')
  const hit = measure('cache hit', (i) => void resolve(pool[i % POOL_SIZE]!), 20000)
  report([hit])
  const coldObj = cold[2]!
  console.log(
    `    → cache hit is ${(hit.median / coldObj.median).toFixed(1)}× the cold breakpoint-object resolve`,
  )

  console.log('\n  optimizeBreakpointDeltas — mobile-first cascade diff (6 breakpoints)')
  report([measure('delta pass', (i) => void optimizeBreakpointDeltas(deltaInput(i)), 5000)])

  console.log('\n  Median of 30 windows · 95% bootstrap CI · varied inputs · NODE_ENV=production')
  console.log('  Internal throughput — see header for why this is NOT a styled-system/theme-ui race.')
  console.log()
}

main()
