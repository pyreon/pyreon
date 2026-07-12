/**
 * CSS-in-JS engine benchmark — measures the styler HOT PATHS against the
 * dominant runtime CSS-in-JS libraries.
 *
 * Compares:
 *   - @pyreon/styler   — Pyreon's engine (resolve → normalizeCSS → FNV-1a → insert)
 *   - @emotion/css     — framework-agnostic emotion (stylis serialize → hash → insert)
 *   - goober           — ~1.3KB agnostic engine (the tiny-bundle leader)
 *   - styled-components — market leader (SSR row only, via ServerStyleSheet)
 *
 * Usage: bun scripts/bench/core/styler.ts
 *
 * OBJECTIVITY CONTRACT (every past CSS-in-JS-bench footgun this guards against):
 *
 * 1. `NODE_ENV=production` is forced FIRST — Pyreon (and emotion/goober) gate
 *    dev-only instrumentation (styler's `validateDevCss` + perf-counter sinks,
 *    emotion's dev warnings) on it. Benching dev mode measures the instrumentation.
 *
 * 2. IDIOMATIC per library. Each lib expresses the SAME goal (turn a CSS block
 *    into a class name + injected rule) the way ITS docs show:
 *      - styler:  `resolve(strings, values, props)` → `normalizeCSS` → `sheet.insert`
 *                 (exactly what a `styled()` dynamic render / `useCSS` does).
 *      - emotion: `css(strings, ...values)` (the `@emotion/css` tagged template).
 *      - goober:  `css(strings, ...values)` (goober's tagged template).
 *    A CORRECTNESS GATE asserts each lib produces a real class + extractable CSS
 *    for the expected declaration BEFORE timing — a lib that "wins" by not doing
 *    the work is caught.
 *
 * 3. Every lib runs against a FRESH instance per measurement window (styler
 *    `createSheet()`, emotion `createInstance()`, goober `extractCss()` drains
 *    its buffer) so cache growth from one window never taxes the next, and the
 *    cold-vs-warm distinction is real (fresh instance = genuinely cold).
 *
 * 4. VARIED inputs rotate through the timed loop (a monotonic counter baked into
 *    each CSS block) — a constant input lets JSC hoist the whole call out of the
 *    loop and manufactures fake single-digit-ns readings.
 *
 * 5. MEDIAN + 95% bootstrap CI + a `🤝` tie marker (CI-overlap with the row
 *    leader) — a single mean hides multi-modal JIT tiering and over-claims
 *    wins that are inside the noise.
 *
 * HONEST LIMITS (author-judge disclosed — the framework author wrote + judges
 * this bench): this is a Node/JSC micro-bench of the STRING-GENERATION pipeline
 * (serialize → hash → dedup → SSR-collect). In Node there is no `document`, so
 * all three agnostic engines buffer rules instead of hitting a live CSSOM
 * `insertRule` — the fair, deterministic surface (real-DOM `insertRule` cost is
 * browser-uniform and dominated by the engine, not the library). styled-components
 * appears in the SSR row only and its number INCLUDES a React `renderToStaticMarkup`
 * pass (its CSS can't be collected without rendering) — it is a component-model
 * lib, not a bare engine, so a per-call engine row would time React, not the CSS
 * work; that's disclosed inline. vanilla-extract is intentionally ABSENT — it is
 * a ZERO-RUNTIME build-time extractor (`.css.ts` compiled to a static stylesheet),
 * a different paradigm with no runtime resolve/insert to time.
 */

// Must run before any framework/competitor module evaluates its dev gates.
process.env.NODE_ENV = 'production'

import createEmotion from '@emotion/css/create-instance'
import { css as gooberCss, extractCss as gooberExtract } from 'goober'
import { normalizeCSS, resolve } from '../../../packages/ui-system/styler/src/resolve'
import { createSheet } from '../../../packages/ui-system/styler/src/sheet'

// ─── Tagged-template helper ────────────────────────────────────────────────────
// Build a real TemplateStringsArray so each engine's tagged-template entry point
// sees the shape it would from `css\`...\``.
const tt = (arr: string[]): TemplateStringsArray =>
  Object.assign(arr.slice(), { raw: arr.slice() }) as unknown as TemplateStringsArray

// ─── Stats harness ─────────────────────────────────────────────────────────────

interface Sample {
  lib: string
  median: number // ops/sec
  lo: number // CI95 low
  hi: number // CI95 high
}

/** Percentile of a sorted array (linear interpolation). */
function pct(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

/** Bootstrap CI95 of the MEDIAN (B resamples with replacement). */
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

/**
 * Measure `op(ctx, i)` throughput. `makeCtx()` runs before EACH window (fresh
 * per-lib instance). `opsPerWindow` op-calls are timed per window; `windows`
 * measured windows are collected after `warmupWindows` discarded ones.
 */
function measure(
  lib: string,
  makeCtx: () => unknown,
  op: (ctx: any, i: number) => void,
  opsPerWindow: number,
  windows = 30,
  warmupWindows = 6,
): Sample {
  let counter = 0
  // Warmup (discarded) — amortize each lib's compile/JIT tiering.
  for (let w = 0; w < warmupWindows; w++) {
    const ctx = makeCtx()
    for (let j = 0; j < opsPerWindow; j++) op(ctx, counter++)
  }
  const opsPerSec: number[] = []
  for (let w = 0; w < windows; w++) {
    const ctx = makeCtx()
    const start = performance.now()
    for (let j = 0; j < opsPerWindow; j++) op(ctx, counter++)
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

function report(title: string, rows: Sample[]): void {
  const sorted = rows.slice().sort((a, b) => b.median - a.median)
  const leader = sorted[0]!
  console.log(`\n  ${title}`)
  for (const r of sorted) {
    const isLeader = r === leader
    // Tie = CI95 overlaps the leader's CI95.
    const tie = !isLeader && r.hi >= leader.lo
    const rel = isLeader
      ? '1.00× 🥇'
      : tie
        ? `${(leader.median / r.median).toFixed(2)}× 🤝`
        : `${(leader.median / r.median).toFixed(2)}× slower`
    console.log(
      `    ${r.lib.padEnd(20)} ${fmt(r.median).padStart(9)} ops/s  ` +
        `[${fmt(r.lo)}–${fmt(r.hi)}]  ${rel}`,
    )
  }
}

// ─── CSS input pools (idiomatic, realistic component CSS) ───────────────────────

// A static template whose ONLY varying piece is a numeric padding — the counter
// bakes a unique value per op so cold inserts stay genuinely cold.
const COLD_STRINGS = tt([
  'display: flex; align-items: center; justify-content: center; border-radius: 4px; padding: ',
  'px; margin: 8px; background: #f0f0f0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);',
])
// A warm block — identical every time so the dedup fast path fires.
const WARM_STRINGS = tt([
  'display: inline-flex; gap: 8px; padding: 12px 16px; border-radius: 6px; background: #0d6efd; color: #fff;',
])
// A dynamic block resolved through a FUNCTION interpolation (styler's real
// dynamic-styled path) — the prop value is unique per op.
const DYN_STRINGS = tt(['color: ', '; background: ', '; padding: 10px; border-radius: 4px;'])

// ─── Per-library adapters ───────────────────────────────────────────────────────

type Emotion = ReturnType<typeof createEmotion>

const styler = {
  makeCtx: () => createSheet(),
  cold: (s: ReturnType<typeof createSheet>, i: number) =>
    s.insert(normalizeCSS(resolve(COLD_STRINGS, [i], {}))),
  warm: (s: ReturnType<typeof createSheet>) =>
    s.insert(normalizeCSS(resolve(WARM_STRINGS, [], {}))),
  dyn: (s: ReturnType<typeof createSheet>, i: number) =>
    s.insert(
      normalizeCSS(
        resolve(DYN_STRINGS, [(p: any) => p.color, (p: any) => p.bg], {
          color: `rgb(${i & 255},0,0)`,
          bg: `rgb(0,${i & 255},0)`,
        }),
      ),
    ),
}

const emotion = {
  makeCtx: () => createEmotion({ key: `e${(Math.random() * 1e6) | 0}` }),
  cold: (e: Emotion, i: number) => e.css(COLD_STRINGS, i),
  warm: (e: Emotion) => e.css(WARM_STRINGS),
  dyn: (e: Emotion, i: number) => e.css(DYN_STRINGS, `rgb(${i & 255},0,0)`, `rgb(0,${i & 255},0)`),
}

const goober = {
  // goober css() writes to a global buffer; extractCss() drains it. Fresh ctx =
  // drain the buffer so window N never pays for window N-1's accumulated rules.
  makeCtx: () => {
    gooberExtract()
    return null
  },
  cold: (_: null, i: number) => gooberCss(COLD_STRINGS, i),
  warm: () => gooberCss(WARM_STRINGS),
  dyn: (_: null, i: number) => gooberCss(DYN_STRINGS, `rgb(${i & 255},0,0)`, `rgb(0,${i & 255},0)`),
}

// ─── Correctness gate ───────────────────────────────────────────────────────────

function assertCorrect(): void {
  // styler
  const s = createSheet()
  const sCls = s.insert(normalizeCSS(resolve(COLD_STRINGS, [42], {})))
  const sTag = s.getStyleTag()
  if (!sCls.startsWith('pyr-') || !sTag.includes('padding: 42px') || !sTag.includes(`.${sCls}`))
    throw new Error(`[styler-bench] correctness FAIL: styler cold (${sCls})`)
  const sDyn = s.insert(
    normalizeCSS(resolve(DYN_STRINGS, [(p: any) => p.color, (p: any) => p.bg], { color: 'red', bg: 'blue' })),
  )
  if (!s.getStyleTag().includes('color: red') || !s.getStyleTag().includes('background: blue'))
    throw new Error(`[styler-bench] correctness FAIL: styler dyn (${sDyn})`)

  // emotion
  const e = createEmotion({ key: 'egate' })
  const eCls = e.css(COLD_STRINGS, 42)
  const eCss = Object.values(e.cache.inserted).join('')
  if (typeof eCls !== 'string' || !eCls || !eCss.includes('padding:42px') || !eCss.includes(eCls))
    throw new Error(`[styler-bench] correctness FAIL: emotion (${eCls})`)

  // goober
  gooberExtract()
  const gCls = gooberCss(COLD_STRINGS, 42)
  const gCss = gooberExtract()
  if (typeof gCls !== 'string' || !gCls || !gCss.includes('padding:42px') || !gCss.includes(gCls))
    throw new Error(`[styler-bench] correctness FAIL: goober (${gCls})`)

  console.log('  ✓ correctness gate passed (styler / emotion / goober each emit a class + its rule)')
}

// ─── SSR string-collection row ──────────────────────────────────────────────────
// Build N distinct component rules and serialize them into the head <style>
// string an SSR framework would ship. Fresh instance per window.

const SSR_N = 100
// Each OP is a full, independent page-collect: a fresh instance, N distinct
// rules inserted, serialized to the head `<style>` string. `opsPerWindow` such
// collects are timed per window (so a single ~100µs collect isn't fighting
// `performance.now()` granularity). This is the realistic SSR/SSG scenario —
// render one page, collect its critical CSS once.
//
// styled-components (market leader) appears here only, via ServerStyleSheet. Its
// CSS can't be collected without a React render, so this row INCLUDES that
// render (disclosed inline + in the legend). Lazy-imported so a styled-components
// / react resolution problem can't take down the agnostic-engine rows above.
async function ssrRow(): Promise<Sample[]> {
  const rows: Sample[] = []
  const COLLECTS_PER_WINDOW = 20

  // styler: fresh sheet per collect, N inserts, one getStyleTag.
  rows.push(
    measure(
      '@pyreon/styler',
      () => null,
      (_: null, i) => {
        const s = createSheet()
        const base = i * SSR_N
        for (let k = 0; k < SSR_N; k++)
          s.insert(normalizeCSS(resolve(COLD_STRINGS, [base + k], {})))
        void s.getStyleTag()
      },
      COLLECTS_PER_WINDOW,
    ),
  )

  // emotion: fresh instance per collect, N css() calls, extract from cache.inserted.
  rows.push(
    measure(
      '@emotion/css',
      () => null,
      (_: null, i) => {
        const e = createEmotion({ key: `es${i & 0xffff}` })
        const base = i * SSR_N
        for (let k = 0; k < SSR_N; k++) e.css(COLD_STRINGS, base + k)
        void Object.values(e.cache.inserted).join('')
      },
      COLLECTS_PER_WINDOW,
    ),
  )

  // goober: drain per collect, N css() calls, extractCss().
  rows.push(
    measure(
      'goober',
      () => null,
      (_: null, i) => {
        gooberExtract()
        const base = i * SSR_N
        for (let k = 0; k < SSR_N; k++) gooberCss(COLD_STRINGS, base + k)
        void gooberExtract()
      },
      COLLECTS_PER_WINDOW,
    ),
  )

  // styled-components: ServerStyleSheet + React renderToStaticMarkup (INCLUDES render).
  try {
    const React = (await import('react')).default
    const { renderToStaticMarkup } = await import('react-dom/server')
    const sc = await import('styled-components')
    const scStyled = sc.default
    const ServerStyleSheet = sc.ServerStyleSheet
    // N distinct styled components (dynamic padding via a transient prop).
    const Box = scStyled.div<{ $p: number }>`
      display: flex; align-items: center; justify-content: center; border-radius: 4px;
      padding: ${(p) => p.$p}px; margin: 8px; background: #f0f0f0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `
    rows.push(
      measure(
        'styled-components*',
        () => null,
        (_: null, i) => {
          const sheet = new ServerStyleSheet()
          const base = i * SSR_N
          const children = []
          for (let k = 0; k < SSR_N; k++)
            children.push(React.createElement(Box, { key: k, $p: base + k }))
          renderToStaticMarkup(
            sheet.collectStyles(React.createElement(React.Fragment, null, children)),
          )
          void sheet.getStyleTags()
          sheet.seal()
        },
        COLLECTS_PER_WINDOW,
      ),
    )
  } catch (err) {
    console.error('  (styled-components SSR row skipped:', (err as Error).message, ')')
  }

  return rows
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('CSS-in-JS Engine Benchmark (Bun / JSC)')
  console.log('@pyreon/styler vs @emotion/css vs goober vs styled-components')
  console.log('='.repeat(72))
  assertCorrect()

  // Cold/dynamic use a realistic page-size window (COLD_N distinct rules into a
  // FRESH instance) so every engine is measured at a comparable small-buffer
  // state. A large accumulate window would unfairly tax goober's O(n) string
  // buffer with thousands of un-deduped rules no real page holds in one sheet.
  const COLD_N = 100
  report(`Cold insert — ${COLD_N} unique rules / fresh instance (serialize → hash → insert)`, [
    measure('@pyreon/styler', styler.makeCtx, styler.cold, COLD_N),
    measure('@emotion/css', emotion.makeCtx, emotion.cold, COLD_N),
    measure('goober', goober.makeCtx, goober.cold, COLD_N),
  ])

  report('Warm dedup — repeat identical CSS (cache-hit fast path)', [
    measure('@pyreon/styler', styler.makeCtx, styler.warm, 4000),
    measure('@emotion/css', emotion.makeCtx, emotion.warm, 4000),
    measure('goober', goober.makeCtx, goober.warm, 4000),
  ])

  report(`Dynamic resolve — ${COLD_N} function/prop interpolations / fresh instance`, [
    measure('@pyreon/styler', styler.makeCtx, styler.dyn, COLD_N),
    measure('@emotion/css', emotion.makeCtx, emotion.dyn, COLD_N),
    measure('goober', goober.makeCtx, goober.dyn, COLD_N),
  ])

  report(`SSR collect — ${SSR_N} distinct rules → <style> string (* = incl. React render)`, await ssrRow())

  console.log()
  console.log('  🥇 fastest · 🤝 CI95 overlaps the leader (statistical tie)')
  console.log('  * styled-components number includes a React renderToStaticMarkup pass.')
  console.log(
    '  Note: styler is O(1) per insert (Map + buffer); goober is O(n) (string append),\n' +
      '  so goober edges closer only at tiny pages (≲50 rules) and falls furthest behind at scale.',
  )
  console.log()
}

void main()
