#!/usr/bin/env bun
/**
 * Cross-framework SSR renderer benchmark — @pyreon/runtime-server vs
 * react-dom/server vs @vue/server-renderer vs svelte/server.
 *
 * WHAT IT MEASURES: steady-state server-side render throughput of the SAME
 * page (nav + heading + N-row keyed list + footer) at each framework's
 * COMPILED, idiomatic best — the per-request work of a warm SSR server:
 * create the app/element for the request's data → render to an HTML string.
 *
 * Fairness protocol (repo bench standard):
 *  - NODE_ENV=production set before any framework import.
 *  - Each framework's page is authored idiomatically and compiled through its
 *    REAL compiler: Pyreon JSX via `transformJSX({ ssr: true })` (what
 *    vite-plugin ships for SSR builds), React JSX via the automatic runtime,
 *    Vue via `vue/compiler-sfc` `compileTemplate({ ssr: true })` (the
 *    `ssrRender` string-concat path Nuxt apps run — NOT the slower
 *    runtime-vdom fallback), Svelte via `svelte/compiler`
 *    `generate: 'server'`. No hand-h() handicaps on any side.
 *  - Per-(framework × size) process isolation: one fresh `bun` child per
 *    cell, ×PROCS pooled; median + bootstrap CI95 + 🤝 CI-overlap ties.
 *  - ROTATED inputs: 8 pre-built datasets cycled per render, so no
 *    loop-invariant result can be cached; the app/element is created PER
 *    RENDER (the real per-request shape — mirrors the runtime-server bench's
 *    fidelity contract: routes/component definitions are module-level, the
 *    request work is per-render).
 *  - Correctness gate (framework-independent): every framework's output must
 *    normalize (strip comments/tags, collapse whitespace) to the SAME text
 *    signature computed from the dataset itself, AND contain exactly N
 *    `class="row"` occurrences. A framework that renders wrong/empty output
 *    throws instead of posting a fast number.
 *  - Sync-vs-async honesty: react/svelte/pyreon complete synchronously and
 *    are timed in a sync loop; Vue's `renderToString` returns a Promise BY
 *    DESIGN (its own per-request completion path) and is awaited — that is
 *    Vue's real cost, not a harness penalty.
 *  - STEADY-STATE label: cells warm up until JIT-tiered (an SSR server is a
 *    warm long-lived process). This is NOT a cold-start bench — see the
 *    toast bench (PR #2349) for why the two must not be conflated.
 *
 * AUTHOR-JUDGE CAVEAT: written + judged by the Pyreon authors. Ratios are
 * the portable signal; absolute µs are machine-dependent.
 *
 * Run: bun bench-ssr.ts            (orchestrator — full table)
 *      bun bench-ssr.ts <fw> <n>   (single cell, prints JSON samples)
 */
process.env.NODE_ENV = 'production'

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const now = () => Number(process.hrtime.bigint())
const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]!
}
function bootstrapCI(samples: number[], resamples = 1000): [number, number] {
  // Seeded LCG so the CI is reproducible run-to-run.
  let seed = 0x9e3779b9
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const meds: number[] = []
  const n = samples.length
  for (let r = 0; r < resamples; r++) {
    const re: number[] = []
    for (let i = 0; i < n; i++) re.push(samples[(rnd() * n) | 0]!)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[Math.floor(resamples * 0.025)]!, meds[Math.floor(resamples * 0.975)]!]
}
const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && a[1] >= b[0]

// ─── Shared fixture data ─────────────────────────────────────────────────────

interface RowData {
  id: number
  label: string
  price: string
}
const ADJ = ['pretty', 'large', 'big', 'small', 'tall', 'cheap', 'round', 'fancy']
const NOUN = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'keyboard']

/** 8 rotated datasets per size — deterministic (seeded), distinct per set. */
function buildDatasets(n: number): RowData[][] {
  const sets: RowData[][] = []
  for (let s = 0; s < 8; s++) {
    const rows: RowData[] = []
    for (let i = 0; i < n; i++) {
      rows.push({
        id: s * 100_000 + i + 1,
        label: `${ADJ[(i + s) % 8]} ${NOUN[(i * 7 + s) % 8]} ${i}`,
        price: (((i * 37 + s * 11) % 900) + 0.5).toFixed(2),
      })
    }
    sets.push(rows)
  }
  return sets
}

const NAV = ['Home', 'About', 'Pricing', 'Blog', 'Contact']

/** Framework-independent expected text signature for the correctness gate. */
function expectedSignature(rows: RowData[]): string {
  const parts: string[] = [...NAV, `Bench App (${rows.length})`]
  for (const r of rows) parts.push(String(r.id), r.label, `$${r.price}`)
  parts.push(`${rows.length} items rendered`)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}
function normalizeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ') // hydration markers/comments differ per framework
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Framework page sources (identical semantics, idiomatic authoring) ──────

const PYREON_SRC = `
const App = (props) => {
  const rows = props.rows
  return (
    <div class="app">
      <nav>
        {NAV.map((l) => (
          <a class="nav-link" href={'/' + l.toLowerCase()}>{l}</a>
        ))}
      </nav>
      <main>
        <h1>{\`Bench App (\${rows.length})\`}</h1>
        <ul class="list">
          <For each={rows} by={(r) => r.id}>
            {(r) => (
              <li class="row" data-id={r.id}>
                <span class="id">{r.id}</span>
                <span class="label">{r.label}</span>
                <span class={r.id % 2 === 0 ? 'price even' : 'price odd'}>{'$' + r.price}</span>
              </li>
            )}
          </For>
        </ul>
      </main>
      <footer>{\`\${rows.length} items rendered\`}</footer>
    </div>
  )
}
`

const REACT_SRC = `
const App = ({ rows }) => (
  <div className="app">
    <nav>
      {NAV.map((l) => (
        <a key={l} className="nav-link" href={'/' + l.toLowerCase()}>{l}</a>
      ))}
    </nav>
    <main>
      <h1>{\`Bench App (\${rows.length})\`}</h1>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id} className="row" data-id={r.id}>
            <span className="id">{r.id}</span>
            <span className="label">{r.label}</span>
            <span className={r.id % 2 === 0 ? 'price even' : 'price odd'}>{'$' + r.price}</span>
          </li>
        ))}
      </ul>
    </main>
    <footer>{\`\${rows.length} items rendered\`}</footer>
  </div>
)
`

const VUE_TEMPLATE = `
<div class="app">
  <nav>
    <a v-for="l in nav" :key="l" class="nav-link" :href="'/' + l.toLowerCase()">{{ l }}</a>
  </nav>
  <main>
    <h1>Bench App ({{ rows.length }})</h1>
    <ul class="list">
      <li v-for="r in rows" :key="r.id" class="row" :data-id="r.id">
        <span class="id">{{ r.id }}</span>
        <span class="label">{{ r.label }}</span>
        <span :class="r.id % 2 === 0 ? 'price even' : 'price odd'">{{ '$' + r.price }}</span>
      </li>
    </ul>
  </main>
  <footer>{{ rows.length }} items rendered</footer>
</div>
`

const SVELTE_SRC = `
<script>
  let { rows, nav } = $props()
</script>
<div class="app">
  <nav>
    {#each nav as l (l)}
      <a class="nav-link" href={'/' + l.toLowerCase()}>{l}</a>
    {/each}
  </nav>
  <main>
    <h1>Bench App ({rows.length})</h1>
    <ul class="list">
      {#each rows as r (r.id)}
        <li class="row" data-id={r.id}>
          <span class="id">{r.id}</span>
          <span class="label">{r.label}</span>
          <span class={r.id % 2 === 0 ? 'price even' : 'price odd'}>{'$' + r.price}</span>
        </li>
      {/each}
    </ul>
  </main>
  <footer>{rows.length} items rendered</footer>
</div>
`

// ─── Per-framework setup (untimed) → returns a per-render function ──────────

type RenderFn = (rows: RowData[]) => string | Promise<string>

const TMP = join(import.meta.dir, '.ssr-bench-tmp')

async function setupPyreon(ssrTemplate = false): Promise<RenderFn> {
  const { transformJSX } = await import('@pyreon/compiler')
  const esbuild = await import('esbuild')
  const core = await import('@pyreon/core')
  const { renderToString } = await import('@pyreon/runtime-server')
  const stage1 = transformJSX(PYREON_SRC, 'ssr-app.tsx', { ssr: true, ssrTemplate }).code
  const stage2 = esbuild.transformSync(stage1, {
    loader: 'tsx',
    jsx: 'automatic',
    jsxImportSource: '@pyreon/core',
  }).code
  const body = stage2.replace(/^import\s+.*$/gm, '').trim()
  const jsxRuntime = await import('@pyreon/core/jsx-runtime')
  const coreAny = core as unknown as Record<string, unknown>
  const rts = (await import('@pyreon/runtime-server')) as unknown as Record<string, unknown>
  const deps: Record<string, unknown> = {
    h: core.h,
    Fragment: core.Fragment,
    For: core.For,
    _rp: coreAny._rp,
    _wrapSpread: coreAny._wrapSpread,
    _cx: coreAny.cx,
    jsx: (jsxRuntime as Record<string, unknown>).jsx,
    jsxs: (jsxRuntime as Record<string, unknown>).jsxs,
    _ssr: rts._ssr,
    _ssrItem: rts._ssrItem,
    _ssrChildren: rts._ssrChildren,
    _ssrAttr: rts._ssrAttr,
    _ssrAttrGen: rts._ssrAttrGen,
    _ssrAttrUrl: rts._ssrAttrUrl,
    _esc: rts._esc,
    NAV,
  }
  const fn = new Function(...Object.keys(deps), `${body}\nreturn App`)
  const App = fn(...Object.values(deps)) as (p: { rows: RowData[] }) => unknown
  return (rows) => renderToString(core.h(App as never, { rows })) as string | Promise<string>
}

async function setupReact(): Promise<RenderFn> {
  const esbuild = await import('esbuild')
  const React = (await import('react')).default
  const { renderToString } = await import('react-dom/server')
  const compiled = esbuild.transformSync(REACT_SRC, {
    loader: 'jsx',
    jsx: 'automatic',
    jsxImportSource: 'react',
  }).code
  const body = compiled.replace(/^import\s+.*$/gm, '').trim()
  const jsxRuntime = await import('react/jsx-runtime')
  const deps: Record<string, unknown> = {
    React,
    jsx: (jsxRuntime as Record<string, unknown>).jsx,
    jsxs: (jsxRuntime as Record<string, unknown>).jsxs,
    NAV,
  }
  const fn = new Function(...Object.keys(deps), `${body}\nreturn App`)
  const App = fn(...Object.values(deps)) as (p: { rows: RowData[] }) => never
  return (rows) => renderToString(React.createElement(App, { rows }))
}

async function setupVue(): Promise<RenderFn> {
  const { compileTemplate } = await import('vue/compiler-sfc')
  const { createSSRApp } = await import('vue')
  const { renderToString } = await import('vue/server-renderer')
  const { code } = compileTemplate({
    source: VUE_TEMPLATE,
    id: 'bench-app',
    filename: 'bench-app.vue',
    ssr: true,
    compilerOptions: { bindingMetadata: { rows: 'props' as never, nav: 'props' as never } },
  })
  mkdirSync(TMP, { recursive: true })
  const file = join(TMP, 'vue-ssr-render.mjs')
  writeFileSync(file, code)
  const mod = (await import(file)) as { ssrRender: unknown }
  const component = { props: ['rows', 'nav'], ssrRender: mod.ssrRender }
  return async (rows) => {
    const app = createSSRApp(component as never, { rows, nav: NAV })
    return renderToString(app)
  }
}

async function setupSvelte(): Promise<RenderFn> {
  const { compile } = await import('svelte/compiler')
  const { js } = compile(SVELTE_SRC, {
    generate: 'server',
    filename: 'BenchApp.svelte',
    runes: true,
  })
  mkdirSync(TMP, { recursive: true })
  const file = join(TMP, 'svelte-ssr-app.mjs')
  writeFileSync(file, js.code)
  const App = ((await import(file)) as { default: unknown }).default
  const { render } = await import('svelte/server')
  return (rows) => render(App as never, { props: { rows, nav: NAV } }).body
}

const FRAMEWORKS = {
  pyreon: () => setupPyreon(false),
  'pyreon-ssrtpl': () => setupPyreon(true),
  react: setupReact,
  vue: setupVue,
  svelte: setupSvelte,
} as const
type Framework = keyof typeof FRAMEWORKS

// ─── Timing child ────────────────────────────────────────────────────────────

const SIZES = [10, 100, 1000] as const
const ITERS: Record<number, number> = { 10: 2000, 100: 400, 1000: 50 }
const WARMUP: Record<number, number> = { 10: 6000, 100: 1200, 1000: 150 }
const RUNS = 15

async function runChild(fw: Framework, n: number): Promise<void> {
  const render = await FRAMEWORKS[fw]()
  const datasets = buildDatasets(n)

  // Correctness gate — framework-independent signature + exact row count.
  for (const ds of [datasets[0]!, datasets[7]!]) {
    const html = await render(ds)
    const rowCount = (html.match(/class="row"/g) ?? []).length
    if (rowCount !== n)
      throw new Error(`[correctness] ${fw} n=${n}: ${rowCount} rows rendered, expected ${n}`)
    const got = normalizeHtml(html)
    const want = expectedSignature(ds)
    if (got !== want) {
      const at = [...got].findIndex((c, i) => c !== want[i])
      throw new Error(
        `[correctness] ${fw} n=${n}: text signature mismatch at char ${at}:\n  got  …${got.slice(Math.max(0, at - 40), at + 40)}…\n  want …${want.slice(Math.max(0, at - 40), at + 40)}…`,
      )
    }
  }

  // Detect native completion mode ONCE (see header — vue is async by design;
  // sync frameworks are timed without per-render await hops).
  const probe = render(datasets[0]!)
  const isAsync = typeof (probe as Promise<string>)?.then === 'function'
  if (isAsync) await probe

  const iters = ITERS[n]!
  let sink = 0 // consume output length so no engine can dead-code the render
  const samples: number[] = []
  if (isAsync) {
    for (let w = 0; w < WARMUP[n]!; w++) sink += ((await render(datasets[w & 7]!)) as string).length
    for (let r = 0; r < RUNS; r++) {
      const t0 = now()
      for (let i = 0; i < iters; i++) sink += ((await render(datasets[i & 7]!)) as string).length
      samples.push((now() - t0) / iters)
    }
  } else {
    for (let w = 0; w < WARMUP[n]!; w++) sink += (render(datasets[w & 7]!) as string).length
    for (let r = 0; r < RUNS; r++) {
      const t0 = now()
      for (let i = 0; i < iters; i++) sink += (render(datasets[i & 7]!) as string).length
      samples.push((now() - t0) / iters)
    }
  }
  if (sink === 0) throw new Error('sink empty — renders produced no output')
  process.stdout.write(JSON.stringify({ samples }))
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

const argFw = process.argv[2] as Framework | undefined
const argN = Number(process.argv[3])
if (argFw) {
  if (!(argFw in FRAMEWORKS)) throw new Error(`unknown framework: ${argFw}`)
  if (!SIZES.includes(argN as never)) throw new Error(`unknown size: ${argN}`)
  await runChild(argFw, argN)
  process.exit(0)
}

const PROCS = Number(process.env.BENCH_REPEATS ?? 3)
interface Cell {
  med: number
  ci: [number, number]
}
function runCell(fw: Framework, n: number): Cell {
  const pooled: number[] = []
  for (let p = 0; p < PROCS; p++) {
    const proc = Bun.spawnSync(['bun', import.meta.path, fw, String(n)], {
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (proc.exitCode !== 0)
      throw new Error(`cell failed: ${fw} n=${n}\n${new TextDecoder().decode(proc.stderr)}`)
    const { samples } = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
    pooled.push(...samples)
  }
  return { med: median(pooled), ci: bootstrapCI(pooled) }
}

const versions = {
  react: (await import('react')).version,
  vue: (await import('vue')).version,
  svelte: ((await import('svelte/package.json', { with: { type: 'json' } })) as { default: { version: string } }).default.version,
}
console.log(
  `=== Cross-framework SSR renderer bench — @pyreon/runtime-server vs react-dom/server ${versions.react} · vue/server-renderer ${versions.vue} · svelte/server ${versions.svelte} ===`,
)
console.log(
  `${process.platform}/${process.arch} · Bun ${Bun.version} · NODE_ENV=production · ${PROCS} procs pooled/cell · median µs/render [CI95] · 🤝 = CI overlaps fastest`,
)
console.log(
  '(steady-state warm-process throughput; each framework COMPILED idiomatic — see header. app/element created PER RENDER; 8 rotated datasets; correctness-gated.)\n',
)

const FWS: Framework[] = ['pyreon', 'react', 'vue', 'svelte']
const jsonOut: Record<string, unknown>[] = []
for (const n of SIZES) {
  const cells = new Map<Framework, Cell>()
  // Randomized execution order per size (position-bias guard).
  const order = [...FWS]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  console.error(`  measuring rows=${n} (order: ${order.join(' → ')})`)
  for (const fw of order) cells.set(fw, runCell(fw, n))

  const meds = FWS.map((f) => cells.get(f)!.med)
  const fastest = FWS[meds.indexOf(Math.min(...meds))]!
  const fc = cells.get(fastest)!
  console.log(`rows=${n}  (µs/render — lower is faster)`)
  for (const fw of FWS) {
    const c = cells.get(fw)!
    const us = (v: number) => (v / 1000).toFixed(n >= 1000 ? 1 : 2)
    const mark = fw === fastest ? '★' : overlaps(c.ci, fc.ci) ? '🤝' : ' '
    const ratio = c.med / fc.med
    console.log(
      `  ${mark} ${fw.padEnd(8)} ${us(c.med).padStart(9)}µs  [${us(c.ci[0])}, ${us(c.ci[1])}]  ${
        fw === fastest ? 'fastest' : `${ratio.toFixed(2)}× vs ${fastest}`
      }`,
    )
    jsonOut.push({ size: n, fw, medianNs: c.med, ci: c.ci })
  }
  console.log('')
}
console.log(
  'NOTE: react/svelte/pyreon render synchronously (sync-timed); vue renderToString is async by design (awaited — its real per-request completion). AUTHOR-JUDGE disclosed.',
)
console.log(JSON.stringify({ meta: { versions, procs: PROCS }, rows: jsonOut }))
rmSync(TMP, { recursive: true, force: true })
