/**
 * Head package benchmark — SSR head serialization throughput.
 *
 * Compares:
 *   - @pyreon/head  — Pyreon's head manager (cached resolve, single-pass esc)
 *   - unhead        — Vue/Nuxt head manager (used by Nuxt, Analog, Inertia)
 *
 * ── Objectivity controls (added 2026-08; this bench previously had NONE) ─────
 *
 * The `~1.3-2.1x faster than unhead` figure quoted in the benchmarks skill came
 * from a harness with no production gate, no correctness gate and no statistics
 * — a single 2s window per cell. Every one of those has bitten this repo before
 * (a competitor's DEV build timed as if it were production; a "loss" that was a
 * wiring bug; a ratio quoted from one noisy sample), so:
 *
 * 1. NODE_ENV=production via a SELF-RE-EXEC GUARD, not a top-of-file
 *    assignment. ESM hoists static imports ABOVE any such assignment, so
 *    `unhead` would already have evaluated in dev mode. Value imports below are
 *    DYNAMIC so they only ever evaluate in the prod-env child.
 * 2. A CORRECTNESS GATE that runs before any timing and asserts both libraries
 *    actually produced the head they were asked for. Without it, a cell that
 *    silently no-ops reads as "infinitely fast".
 * 3. POOLED WINDOWS + MEDIAN + 95% bootstrap CI, with randomized per-repeat
 *    ordering. A cell whose CI half-width exceeds 10% of its median is flagged
 *    `~noisy` and must not be quoted.
 *
 * ── Input symmetry (what was NOT equal before) ───────────────────────────────
 *
 * Pyreon was given a `titleTemplate` plus `htmlAttrs`/`bodyAttrs` and unhead was
 * not, so Pyreon was doing strictly MORE work per op. That biased the published
 * ratio CONSERVATIVELY (against us), but an unequal comparison is not defensible
 * in either direction. unhead's push input supports all three, so both sides now
 * receive the same title template and the same html/body attributes.
 *
 * One asymmetry CANNOT be removed and is disclosed rather than hidden: Pyreon
 * escapes `<`, `>` and `&` inside attribute content (`a &lt;b&gt; &amp;`) while
 * unhead emits them raw (`a <b> &`). That is a library behaviour difference, not
 * a harness choice — Pyreon does more escaping work per tag, so the remaining
 * bias still runs against Pyreon.
 *
 * Usage: bun scripts/bench/core/head.ts [--repeat N]
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

import type { VNode } from '../../../packages/core/core/src/index'
import type { HeadEntry, HeadTag } from '../../../packages/core/head/src/context'

const { createHead } = await import('unhead/server')
const { h } = await import('../../../packages/core/core/src/index')
const { createHeadContext } = await import('../../../packages/core/head/src/context')
const { renderWithHead, serializeHead } = await import('../../../packages/core/head/src/ssr')

const repeatArg = process.argv.indexOf('--repeat')
const REPEATS = repeatArg !== -1 ? Number(process.argv[repeatArg + 1] ?? 7) : 7

// ─── Shared fixture (identical inputs for both libraries) ────────────────────

const TITLE = 'Benchmark Page'
const TITLE_TEMPLATE = '%s | Pyreon App'
const TITLED = `${TITLE} | Pyreon App`
const HTML_ATTRS = { lang: 'en', dir: 'ltr' }
const BODY_ATTRS = { class: 'dark' }
const contentFor = (i: number) => `Content for meta tag ${i} with <special> & "chars"`

function makeApp(): VNode {
  return h('div', null, h('h1', null, 'Benchmark'), h('p', null, 'Hello world'))
}

function makePyreonEntry(tagCount: number): HeadEntry {
  const tags: HeadTag[] = [{ tag: 'title', key: 'title', children: TITLE }]
  for (let i = 0; i < tagCount; i++) {
    tags.push({
      tag: 'meta',
      key: `meta-${i}`,
      props: { name: `description-${i}`, content: contentFor(i) },
    })
  }
  return { tags, titleTemplate: TITLE_TEMPLATE, htmlAttrs: HTML_ATTRS, bodyAttrs: BODY_ATTRS }
}

/** The SAME title template + html/body attrs Pyreon receives — see header. */
function makeUnheadInput(count: number) {
  const meta: Record<string, string>[] = []
  for (let i = 0; i < count; i++) {
    meta.push({ name: `description-${i}`, content: contentFor(i) })
  }
  return {
    title: TITLE,
    titleTemplate: TITLE_TEMPLATE,
    htmlAttrs: HTML_ATTRS,
    bodyAttrs: BODY_ATTRS,
    meta,
  }
}

// ─── The measured operations ─────────────────────────────────────────────────

function pyreonHeadOnly(tagCount: number): string {
  const ctx = createHeadContext()
  ctx.add(Symbol(), makePyreonEntry(tagCount))
  // Produce the final <head> HTML STRING — apples-to-apples with unhead's
  // head.render() (which returns headTags as a string). Resolve-only would
  // under-count Pyreon's work (it skips the per-tag serialization + escaping
  // unhead performs), so the comparison would not be defensible.
  return serializeHead(ctx.resolve(), ctx.resolveTitleTemplate())
}

async function unheadHeadOnly(input: ReturnType<typeof makeUnheadInput>): Promise<string> {
  const head = createHead({ disableDefaults: true })
  head.push(input)
  const out = (await head.render()) as { headTags: string }
  return out.headTags
}

// ─── Correctness gate ────────────────────────────────────────────────────────

function countMeta(html: string): number {
  return (html.match(/<meta\b/g) ?? []).length
}

async function correctnessGate(counts: number[]): Promise<void> {
  for (const n of counts) {
    const py = pyreonHeadOnly(n)
    const un = await unheadHeadOnly(makeUnheadInput(n))

    for (const [lib, html] of [
      ['@pyreon/head', py],
      ['unhead', un],
    ] as const) {
      if (countMeta(html) !== n) {
        console.error(
          `x correctness gate: ${lib} emitted ${countMeta(html)} <meta> tags, expected ${n}.\n` +
            `  A cell that silently drops work would read as "faster".\n  got: ${html.slice(0, 200)}`,
        )
        process.exit(1)
      }
      if (!html.includes(TITLED)) {
        console.error(
          `x correctness gate: ${lib} did not apply the title template.\n` +
            `  expected the head to contain ${JSON.stringify(TITLED)}.\n  got: ${html.slice(0, 200)}`,
        )
        process.exit(1)
      }
    }
  }
  console.log('  correctness gate passed (both emit every meta tag + the templated title)')
}

// ─── Statistics ──────────────────────────────────────────────────────────────

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
  return sorted[idx]!
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

/** One timed window -> ops/sec. */
async function runWindow(fn: () => unknown, durationMs: number): Promise<number> {
  let ops = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    await fn()
    ops++
  }
  return (ops / (performance.now() - start)) * 1000
}

/** Warm until per-op time stops improving (JIT tier-up), capped. */
async function warmup(fn: () => unknown): Promise<void> {
  let prev = Number.POSITIVE_INFINITY
  for (let round = 0; round < 12; round++) {
    const t0 = performance.now()
    for (let i = 0; i < 200; i++) await fn()
    const per = (performance.now() - t0) / 200
    if (per >= prev * 0.95) return
    prev = per
  }
}

interface Cell {
  label: string
  fn: () => unknown
}

/**
 * Print one row per cell.
 *
 * ROW FORMAT IS LOAD-BEARING: `scripts/bench/run-all.ts:parseOpsLine` matches
 * label, then ops/sec, then avg ns/op, with the line ENDING on digits.
 * Appending a CI column here would silently stop run-all from recording head
 * metrics at all, so the interval goes on a continuation line that ends in a
 * non-digit and therefore cannot match that pattern.
 */
async function runSection(title: string, cells: Cell[]): Promise<void> {
  console.log(`\n-- ${title} ${'-'.repeat(Math.max(0, 62 - title.length))}`)
  console.log(`${'test'.padEnd(36)}${'ops/sec'.padStart(14)}${'avg ns/op'.padStart(14)}`)
  console.log('-'.repeat(64))

  const samples = new Map<string, number[]>()
  for (const c of cells) {
    samples.set(c.label, [])
    await warmup(c.fn)
  }
  for (let r = 0; r < REPEATS; r++) {
    // Randomize per repeat so JIT/GC debt never lands on the same cell.
    for (const c of cells.slice().sort(() => Math.random() - 0.5)) {
      samples.get(c.label)!.push(await runWindow(c.fn, 250))
    }
  }

  for (const c of cells) {
    const { median, lo, hi } = bootstrapCI(samples.get(c.label)!)
    const avgNs = Math.round(1_000_000_000 / median)
    console.log(
      `${c.label.padEnd(36)}${Math.round(median).toLocaleString().padStart(14)}${avgNs.toLocaleString().padStart(14)}`,
    )
    const noisy = (hi - lo) / 2 / median > 0.1 ? '  ~noisy' : ''
    console.log(
      `    ci95 [${Math.round(lo).toLocaleString()} - ${Math.round(hi).toLocaleString()}] ops/sec (n=${REPEATS})${noisy}`,
    )
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const tagCounts = [5, 20, 50]

console.log('Head Package Benchmark (Bun, NODE_ENV=production)')
console.log('Pyreon vs Unhead (Vue/Nuxt) - identical title template + html/body attrs')
console.log(`${'='.repeat(70)}\n`)
await correctnessGate(tagCounts)

await runSection(
  'Pyreon Context Resolve',
  tagCounts.flatMap((count) => {
    const cached = createHeadContext()
    cached.add(Symbol(), makePyreonEntry(count))
    cached.resolve()
    return [
      {
        label: `Pyreon resolve cached (${count})`,
        fn: () => {
          cached.resolve()
          cached.resolveTitleTemplate()
          cached.resolveHtmlAttrs()
          cached.resolveBodyAttrs()
        },
      },
      {
        label: `Pyreon resolve dirty (${count})`,
        fn: () => {
          const ctx = createHeadContext()
          const id = Symbol()
          ctx.add(id, makePyreonEntry(count))
          ctx.resolve()
          ctx.resolveTitleTemplate()
          ctx.resolveHtmlAttrs()
          ctx.resolveBodyAttrs()
          ctx.remove(id)
        },
      },
    ]
  }),
)

await runSection(
  'Head SSR Serialization (head-only, no app render)',
  tagCounts.flatMap((count) => {
    const unheadInput = makeUnheadInput(count)
    return [
      { label: `Pyreon head serialize (${count})`, fn: () => pyreonHeadOnly(count) },
      { label: `Unhead head.render() (${count})`, fn: () => unheadHeadOnly(unheadInput) },
    ]
  }),
)

await runSection('Full SSR (renderToString + head)', [
  { label: 'Pyreon renderWithHead (5)', fn: () => renderWithHead(makeApp()) },
])

console.log('\n~noisy = CI95 half-width > 10% of median; treat that cell as unusable.')
console.log()
