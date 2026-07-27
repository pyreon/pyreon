/**
 * Chromium-isolated DOM micro-benchmark — A/B two implementations of a
 * DOM-level operation in the REAL engine.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The two instruments we already had cannot resolve DOM-level hot-path changes:
 *
 *   - the macro suite (`examples/benchmark`, bench-fair) measures whole ops end
 *     to end. Its run-to-run spread on `create 10,000` is ~0.4% (95.10 / 95.50ms
 *     across two idle runs), so any change worth <0.4% of that op is invisible.
 *     It is a no-REGRESSION guard, not a win detector.
 *   - happy-dom micro-benches run in Node, where `cloneNode` costs ~4µs/row —
 *     roughly 100x Chromium's. That swamps exactly the per-row property-access
 *     and insertion effects worth finding, so a real Chromium win measures as
 *     noise (or inverts). Two hypotheses were abandoned to this: caching
 *     `_tpl`'s resolved prototype node, and `appendChild` vs
 *     `insertBefore(el, null)`.
 *
 * This harness closes that gap: real Chromium, real DOM, but ONE operation
 * isolated from reflow and from framework overhead, with enough statistical
 * machinery to separate a 1% effect from noise.
 *
 * ─── OBJECTIVITY CONTRACT ────────────────────────────────────────────────────
 * 1. Variants run in the SAME page, interleaved round-robin, so JIT tier-up and
 *    GC debt land on both rather than on whichever ran second.
 * 2. Order is REVERSED on alternate rounds — a fixed A,B order biases toward
 *    whichever benefits from the other's warmup.
 * 3. MEDIAN + 95% bootstrap CI per variant; a verdict is reported as a TIE
 *    whenever the CIs overlap. A tie is the honest answer for a sub-noise
 *    change, and this harness says so instead of picking the lower number.
 * 4. Each sample rebuilds its own DOM subtree and DETACHES it before timing
 *    stops, so no variant is charged for another's teardown or layout.
 * 5. Adaptive warmup per variant until per-op time stops improving.
 * 6. No forced GC inside the timed region (it jettisons compiled code → fake
 *    re-tier costs — see CLAUDE.md's bench-harness lesson).
 *
 * HONEST LIMIT: this measures a single operation in isolation. It proves a
 * primitive got cheaper; it does NOT prove an app got faster. Pair every win
 * here with a macro no-regression run before claiming anything.
 *
 * Usage: bun scripts/bench/dom-micro.ts [--repeat N] [--case NAME]
 */
import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const repeatIdx = argv.indexOf('--repeat')
const REPEATS = repeatIdx !== -1 ? Number(argv[repeatIdx + 1] ?? 9) : 9
const caseIdx = argv.indexOf('--case')
const ONLY = caseIdx !== -1 ? argv[caseIdx + 1] : null

/** A/B case: `setup` runs once per page; each variant is timed over `n` ops. */
interface Case {
  name: string
  /** rows/ops per timed sample */
  n: number
  /** Runs once in-page. Must define `globalThis.__proto_html` etc. as needed. */
  setup: string
  variants: Record<string, string>
}

const ROW_HTML =
  '<tr><td class="col-md-1"></td><td class="col-md-4"><a></a></td>' +
  '<td class="col-md-1"><a><span></span></a></td><td class="col-md-6"></td></tr>'

const CASES: Case[] = [
  {
    // _tpl resolves `tpl.content.firstElementChild` on EVERY call. The template
    // is immutable after caching, so the resolved node can be cached instead.
    name: 'tpl-clone: resolve firstElementChild per call vs cached prototype',
    n: 10_000,
    setup: `
      const tpl = document.createElement('template')
      tpl.innerHTML = ${JSON.stringify(ROW_HTML)}
      globalThis.__tpl = tpl
      globalThis.__proto = tpl.content.firstElementChild
    `,
    variants: {
      resolvePerCall: `
        const frag = document.createDocumentFragment()
        for (let i = 0; i < N; i++) frag.appendChild(__tpl.content.firstElementChild.cloneNode(true))
        return frag.childNodes.length
      `,
      cachedPrototype: `
        const frag = document.createDocumentFragment()
        for (let i = 0; i < N; i++) frag.appendChild(__proto.cloneNode(true))
        return frag.childNodes.length
      `,
    },
  },
  {
    // Fresh-render inserts rows into a DocumentFragment with before=null, so
    // `insertBefore(el, null)` is semantically `appendChild(el)`.
    name: 'fragment insert: insertBefore(el, null) vs appendChild(el)',
    n: 10_000,
    setup: `
      const tpl = document.createElement('template')
      tpl.innerHTML = ${JSON.stringify(ROW_HTML)}
      globalThis.__proto = tpl.content.firstElementChild
    `,
    variants: {
      insertBeforeNull: `
        const frag = document.createDocumentFragment()
        for (let i = 0; i < N; i++) frag.insertBefore(__proto.cloneNode(true), null)
        return frag.childNodes.length
      `,
      appendChild: `
        const frag = document.createDocumentFragment()
        for (let i = 0; i < N; i++) frag.appendChild(__proto.cloneNode(true))
        return frag.childNodes.length
      `,
    },
  },
  {
    // The keyed cache write per row: Map.set + the ForEntry object literal.
    name: 'keyed cache write: Map<string,obj> vs Map + parallel arrays',
    n: 10_000,
    setup: `globalThis.__el = document.createElement('tr'); globalThis.__cl = () => {}`,
    variants: {
      mapOfObjects: `
        const cache = new Map()
        for (let i = 0; i < N; i++) cache.set(i, { anchor: __el, cleanup: __cl, pos: i, end: null })
        return cache.size
      `,
      mapOfIndexPlusArrays: `
        const idx = new Map()
        const anchors = new Array(N), cleanups = new Array(N), ends = new Array(N)
        for (let i = 0; i < N; i++) { idx.set(i, i); anchors[i] = __el; cleanups[i] = __cl; ends[i] = null }
        return idx.size
      `,
    },
  },
]

function pct(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo)
}
function bootstrapCI(s: number[], B = 2000) {
  const sorted = s.slice().sort((a, b) => a - b)
  const median = pct(sorted, 0.5)
  const meds = new Array<number>(B)
  for (let b = 0; b < B; b++) {
    const r = new Array<number>(s.length)
    for (let i = 0; i < s.length; i++) r[i] = s[(Math.random() * s.length) | 0]!
    r.sort((x, y) => x - y)
    meds[b] = pct(r, 0.5)
  }
  meds.sort((a, b) => a - b)
  return { median, lo: pct(meds, 0.025), hi: pct(meds, 0.975) }
}

const browser = await chromium.launch({ headless: true, args: ['--js-flags=--expose-gc'] })
const page = await browser.newPage()
await page.setContent('<!doctype html><html><body><table><tbody id="t"></tbody></table></body></html>')

console.log('Chromium-isolated DOM micro-benchmark')
console.log('='.repeat(78))
console.log(`Chromium ${browser.version()} · ${REPEATS} pooled samples/variant · interleaved + order-reversed\n`)

for (const c of CASES) {
  if (ONLY && !c.name.includes(ONLY)) continue
  await page.evaluate(c.setup)

  const names = Object.keys(c.variants)
  // Compile each variant once into a page-side function.
  await page.evaluate(
    ({ variants, n }) => {
      const g = globalThis as unknown as Record<string, unknown>
      g.__fns = {}
      for (const [k, body] of Object.entries(variants)) {
        // eslint-disable-next-line no-new-func
        ;(g.__fns as Record<string, unknown>)[k] = new Function('N', body)
      }
      g.__N = n
    },
    { variants: c.variants, n: c.n },
  )

  // Adaptive warmup — run until per-op time stops improving.
  for (const name of names) {
    await page.evaluate((k) => {
      const g = globalThis as unknown as Record<string, any>
      let prev = Infinity
      for (let round = 0; round < 12; round++) {
        const t0 = performance.now()
        for (let i = 0; i < 3; i++) g.__fns[k](g.__N)
        const per = (performance.now() - t0) / 3
        if (per >= prev * 0.95) return
        prev = per
      }
    }, name)
  }

  const samples: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]))
  for (let r = 0; r < REPEATS; r++) {
    // Reverse order on alternate rounds so neither variant always runs first.
    const order = r % 2 === 0 ? names : names.slice().reverse()
    for (const name of order) {
      const ms = await page.evaluate((k) => {
        const g = globalThis as unknown as Record<string, any>
        const t0 = performance.now()
        g.__sink = g.__fns[k](g.__N)
        return performance.now() - t0
      }, name)
      samples[name]!.push(ms)
    }
  }

  console.log(c.name)
  console.log('-'.repeat(78))
  const stats = names.map((n) => ({ n, ...bootstrapCI(samples[n]!) }))
  for (const s of stats) {
    console.log(
      `  ${s.n.padEnd(24)} ${s.median.toFixed(3)}ms/${c.n.toLocaleString()} ops` +
        `   CI95 [${s.lo.toFixed(3)}, ${s.hi.toFixed(3)}]`,
    )
  }
  const sorted = stats.slice().sort((a, b) => a.median - b.median)
  const best = sorted[0]!
  const rest = sorted.slice(1)
  const tied = rest.filter((s) => s.lo <= best.hi)
  if (tied.length === rest.length && rest.length > 0) {
    console.log(`  → 🤝 TIE (CI95 overlap) — no measurable difference\n`)
  } else {
    const second = rest[0]!
    const pctFaster = ((second.median - best.median) / second.median) * 100
    console.log(
      `  → 🥇 ${best.n} faster by ${(second.median - best.median).toFixed(3)}ms ` +
        `(${pctFaster.toFixed(1)}%) — CIs disjoint\n`,
    )
  }
}

await browser.close()
