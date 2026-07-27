/**
 * SSR throughput benchmark — renders/sec for `renderToString()` across app
 * complexities.
 *
 * Scenarios (mirror TanStack's methodology):
 *   - empty:              minimal component (framework overhead baseline)
 *   - simple:             5 routes, nav with 5 links, simple page
 *   - links-100:          100 RouterLinks to stress link rendering
 *   - layouts-26-params:  26 nested layouts with params
 *
 * ─── OBJECTIVITY CONTRACT (author-judge disclosed) ───────────────────────────
 * The framework author WROTE and JUDGES this bench. It reports Pyreon-only
 * throughput — it is NOT a competitive comparison. For cross-framework SSR
 * numbers use `bench:ssr-cross` (`ssr-crossframework.ts`), which renders the
 * SAME logical tree through React / Preact / Solid behind a byte-identical
 * correctness gate. Do NOT quote a number from THIS file against another
 * framework: there is no competitor here to be fair to.
 *
 * 1. NODE_ENV=production is enforced by a SELF-RE-EXEC GUARD, not a top-of-file
 *    assignment. ESM hoists static imports ABOVE top-level statements, so an
 *    assignment would run AFTER the framework's module-init dev gate. This is
 *    not cosmetic: measured on this very bench, the DEV build made `links-100`
 *    swing 108 / 10,578 / 195 renders/sec across three consecutive runs (98x),
 *    because dev's always-on reactive-devtools registry accumulates across the
 *    ~30k renders in a timed window until the run collapses into GC pressure.
 *    Under production the same cell reads 12,272 / 11,194 / 12,296 (1.1x).
 *    A single-window dev number is worthless in BOTH directions — it can
 *    understate Pyreon ~100x, or manufacture a later "improvement" from noise.
 *
 * 2. CORRECTNESS GATE before any timing: every scenario must render non-empty
 *    HTML containing its expected marker. A scenario that "wins" by rendering
 *    nothing is caught and aborts the run.
 *
 * 3. POOLED WINDOWS + MEDIAN + 95% bootstrap CI, not one long window. The CI is
 *    printed so a noisy cell is visibly noisy instead of being quoted as fact.
 *    A cell whose CI half-width exceeds 10% of its median is flagged `~noisy`.
 *
 * 4. ADAPTIVE WARMUP: each scenario is warmed until its per-render time stops
 *    improving (JIT tier-up), rather than a fixed 50 renders — 50 renders is
 *    ~0.3ms of warmup for `empty` but ~5ms for `links-100`, so a fixed count
 *    systematically under-warms the cheap scenarios.
 *
 * 5. RANDOMIZED scenario order per repeat, so JIT/GC debt from one scenario
 *    doesn't systematically land on whichever scenario follows it.
 *
 * 6. No forced GC inside the timed loop (`Bun.gc(true)` jettisons compiled code
 *    → fake re-tier costs; see CLAUDE.md's bench-harness lesson).
 *
 * FIDELITY CONTRACT: the ROUTES ARRAY is built ONCE per scenario (module-level
 * in real apps — zero's `virtual:zero/routes`), while the router + vnode tree
 * are created fresh PER RENDER (the real per-request SSR shape). Rebuilding the
 * routes array per iteration defeats the router's WeakMap-cached route index
 * and times a full route-table recompile (~0.5us/route) on every render.
 *
 * HONEST LIMITS: CPU-only string generation in Bun/JSC on one machine. Does NOT
 * measure streaming, Suspense/async promotion, or real-app async data. Numbers
 * are machine- and JSC-version-dependent.
 *
 * Usage: bun scripts/bench/core/runtime-server.ts [--repeat N]
 */

// ─── NODE_ENV self-re-exec guard (MUST precede every value import) ────────────
// Value imports below are DYNAMIC so they evaluate ONLY in the prod-env child.
if (process.env.NODE_ENV !== 'production') {
  const child = Bun.spawnSync(['bun', import.meta.path, ...process.argv.slice(2)], {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  process.exit(child.exitCode ?? 0)
}

import type { ComponentFn, VNode } from '../../../packages/core/core/src/index'
import type { RouteRecord } from '../../../packages/core/router/src/types'

const { h } = await import('../../../packages/core/core/src/index')
const { RouterLink, RouterProvider, RouterView } = await import(
  '../../../packages/core/router/src/components'
)
const { createRouter } = await import('../../../packages/core/router/src/router')
const { renderToString } = await import('../../../packages/core/runtime-server/src/index')

const repeatArg = process.argv.indexOf('--repeat')
const REPEATS = repeatArg !== -1 ? Number(process.argv[repeatArg + 1] ?? 5) : 5

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Text(text: string): ComponentFn {
  return () => h('div', null, text)
}

interface Scenario {
  makeApp: () => VNode
  label: string
  /** Substring the rendered HTML MUST contain — the correctness gate. */
  expect: string
}

// ─── Scenario 1: Empty ──────────────────────────────────────────────────────

const _emptyRoutes: RouteRecord[] = [
  { path: '/', component: () => h('div', null, 'hello') },
]
function buildEmpty(): Scenario {
  return {
    label: 'empty',
    expect: 'hello',
    makeApp: () => {
      const router = createRouter({ routes: _emptyRoutes, mode: 'history', url: '/' })
      return h(RouterProvider, { router }, h(RouterView, null))
    },
  }
}

// ─── Scenario 2: Simple (5 routes, 5 links) ─────────────────────────────────

const _simpleRoutes: RouteRecord[] = [
  { path: '/', component: Text('Home') },
  { path: '/about', component: Text('About') },
  { path: '/pricing', component: Text('Pricing') },
  { path: '/blog', component: Text('Blog') },
  { path: '/contact', component: Text('Contact') },
]
function buildSimple(): Scenario {
  const paths = _simpleRoutes.map((r) => r.path)
  const Nav: ComponentFn = () => h('nav', null, ...paths.map((p) => h(RouterLink, { to: p }, p)))
  const Layout: ComponentFn = (props) => h('div', null, h(Nav, null), props.children as VNode)
  return {
    label: 'simple (5 routes)',
    expect: '/pricing',
    makeApp: () => {
      const router = createRouter({ routes: _simpleRoutes, mode: 'history', url: '/' })
      return h(RouterProvider, { router }, h(Layout, null, h(RouterView, null)))
    },
  }
}

// ─── Scenario 3: Links-100 ──────────────────────────────────────────────────

const _links100Routes: RouteRecord[] = (() => {
  const routes: RouteRecord[] = []
  for (let i = 0; i < 100; i++) {
    routes.push({ path: `/page/${i}`, component: Text(`Page ${i}`) })
  }
  routes.push({ path: '(.*)', component: Text('404') }) // Catch-all
  return routes
})()
function buildLinks100(): Scenario {
  return {
    label: 'links-100',
    expect: '/page/99',
    makeApp: () => {
      // Vnodes (incl. the 100 RouterLinks) are created fresh per render —
      // JSX runs per request in real apps. Only the routes table is shared.
      const links: VNode[] = []
      for (let i = 0; i < 100; i++) {
        links.push(h(RouterLink, { to: `/page/${i}` }, `Page ${i}`))
      }
      const Nav: ComponentFn = () => h('nav', null, ...links)
      const Layout: ComponentFn = (props) => h('div', null, h(Nav, null), props.children as VNode)
      const router = createRouter({ routes: _links100Routes, mode: 'history', url: '/page/0' })
      return h(RouterProvider, { router }, h(Layout, null, h(RouterView, null)))
    },
  }
}

// ─── Scenario 4: Layouts-26 with params ─────────────────────────────────────

function buildLayouts26(): Scenario {
  const Leaf: ComponentFn = () => h('div', { className: 'leaf' }, 'Leaf content')

  function makeLayout(depth: number): ComponentFn {
    return () =>
      h(
        'div',
        { className: `layout-${depth}` },
        h('h2', null, `Level ${depth}`),
        h('div', { className: 'content' }, h(RouterView, null)),
      )
  }

  function buildNested(depth: number): RouteRecord[] {
    if (depth >= 26) {
      return [{ path: 'leaf', component: Leaf }]
    }
    return [
      {
        path: `l${depth}/:p${depth}`,
        component: makeLayout(depth),
        children: buildNested(depth + 1),
      },
    ]
  }

  const routes: RouteRecord[] = buildNested(0)

  const segments: string[] = []
  for (let i = 0; i < 26; i++) {
    segments.push(`l${i}`, `v${i}`)
  }
  segments.push('leaf')
  const url = `/${segments.join('/')}`

  return {
    label: 'layouts-26-params',
    expect: 'Leaf content',
    makeApp: () => {
      const router = createRouter({ routes, mode: 'history', url })
      return h(RouterProvider, { router }, h(RouterView, null))
    },
  }
}

// ─── Statistics ──────────────────────────────────────────────────────────────

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
    resample.sort((x, y) => x - y)
    medians[b] = pct(resample, 0.5)
  }
  medians.sort((a, b) => a - b)
  return { median, lo: pct(medians, 0.025), hi: pct(medians, 0.975) }
}

// ─── Harness ─────────────────────────────────────────────────────────────────

/** Warm until per-render time stops improving (JIT tier-up), capped. */
async function warmup(makeApp: () => VNode): Promise<void> {
  let prev = Number.POSITIVE_INFINITY
  for (let round = 0; round < 12; round++) {
    const t0 = performance.now()
    for (let i = 0; i < 40; i++) await renderToString(makeApp())
    const per = (performance.now() - t0) / 40
    if (per >= prev * 0.95) return // within 5% of the previous round — settled
    prev = per
  }
}

/** One timed window; returns renders/sec + average bytes. */
async function runWindow(
  makeApp: () => VNode,
  windowMs: number,
): Promise<{ rps: number; bytes: number }> {
  let ops = 0
  let totalBytes = 0
  const start = performance.now()
  const end = start + windowMs
  while (performance.now() < end) {
    const html = await renderToString(makeApp())
    totalBytes += html.length
    ops++
  }
  const elapsed = performance.now() - start
  return { rps: (ops / elapsed) * 1000, bytes: totalBytes / ops }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const scenarios: Scenario[] = [buildEmpty(), buildSimple(), buildLinks100(), buildLayouts26()]

// Correctness gate — before any timing.
for (const s of scenarios) {
  const html = await renderToString(s.makeApp())
  if (!html || !html.includes(s.expect)) {
    console.error(
      `[bench:ssr] CORRECTNESS GATE FAILED for "${s.label}" — rendered ${html?.length ?? 0} bytes, ` +
        `expected to contain ${JSON.stringify(s.expect)}.`,
    )
    process.exit(1)
  }
}

console.log('SSR Throughput Benchmark (Bun, NODE_ENV=production)')
console.log(`${'='.repeat(78)}\n`)
console.log('Pyreon-only throughput — NOT a cross-framework comparison.')
console.log('For competitive SSR numbers use `bun run bench:ssr-cross`.\n')

const samples = new Map<string, number[]>()
const bytesOf = new Map<string, number>()
for (const s of scenarios) {
  samples.set(s.label, [])
  await warmup(s.makeApp)
}

for (let r = 0; r < REPEATS; r++) {
  // Randomize order each repeat so JIT/GC debt doesn't always land on the same
  // scenario.
  const order = scenarios.slice().sort(() => Math.random() - 0.5)
  for (const s of order) {
    const { rps, bytes } = await runWindow(s.makeApp, 400)
    samples.get(s.label)!.push(rps)
    bytesOf.set(s.label, bytes)
  }
}

console.log(
  `${'scenario'.padEnd(22)}${'renders/sec'.padStart(13)}${'avg ms'.padStart(10)}${'CI95'.padStart(24)}${'bytes'.padStart(9)}`,
)
console.log('-'.repeat(78))

for (const s of scenarios) {
  const { median, lo, hi } = bootstrapCI(samples.get(s.label)!)
  const halfWidth = (hi - lo) / 2 / median
  const noisy = halfWidth > 0.1 ? '  ~noisy' : ''
  const ci = `[${Math.round(lo).toLocaleString()}, ${Math.round(hi).toLocaleString()}]`
  console.log(
    `${s.label.padEnd(22)}${Math.round(median).toLocaleString().padStart(13)}` +
      `${(1000 / median).toFixed(3).padStart(10)}${ci.padStart(24)}` +
      `${Math.round(bytesOf.get(s.label)!).toLocaleString().padStart(9)}${noisy}`,
  )
}

console.log(`\n${REPEATS} pooled windows/scenario, randomized order, adaptive warmup.`)
console.log('~noisy = CI95 half-width > 10% of median; treat that cell as unusable.')
