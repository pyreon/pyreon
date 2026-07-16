#!/usr/bin/env bun
/**
 * Mounted-Toaster / commit benchmark — @pyreon/toast vs react-hot-toast vs sonner.
 *
 * The sibling `toast-bench.ts` measures the RAW store op (no Toaster). This file
 * measures the two paths a real app actually feels:
 *
 *  1. CREATE COLD-START INGEST (headless, all three) — how fast each library
 *     ingests a burst of toasts into its queue from a COLD process. This is the
 *     ONE op that is apples-to-apples across all three headless: sonner's
 *     `dismiss` and its update-by-id are Toaster-coupled (they only settle once
 *     a MOUNTED `<Toaster>` finishes its rAF/animation cycle — see sonner's
 *     `dismiss = (id)=> requestAnimationFrame(…)`), so a repeated dismiss /
 *     update loop accumulates sonner's store and degrades to O(N²) — NOT
 *     sonner's real per-op cost. Create is the fair common denominator,
 *     measured one burst per FRESH PROCESS so no library's module-level store
 *     carries across samples (sonner has no synchronous hard-reset).
 *     HONEST LABEL (2026-07): fresh-process + 10-call warmup means the timed
 *     burst runs JIT-UNTIRED code, so the row compares COLD-START cost (code
 *     size on the path), not steady-state throughput — measured Pyreon decay
 *     in this exact shape: ~3.5µs/create cold → ~0.62µs by call ~200 →
 *     ~0.22µs deep-warm. A warmed cross-lib burst is structurally impossible
 *     (sonner accumulation skew above), so Pyreon's steady-state number is
 *     printed as a DISCLOSURE line (`tp:pyreon-warm` worker), never a verdict.
 *
 *  2. COMMIT (mounted Toaster, @pyreon/toast vs react-hot-toast) — the
 *     create→DOM-commit, update-in-place→DOM-commit and dismiss→DOM-commit path
 *     with a REAL Toaster rendering. This is where the reactivity MODEL shows:
 *     Pyreon patches one toast's text node / className in place (fine-grained
 *     `<For by=id>` + `_toastMap`), react-hot-toast re-renders the toast list
 *     through React on every store change (React commit forced synchronous via
 *     `flushSync`, which is how a per-toast commit latency is measured — RHT
 *     commits per store change in a real app anyway). sonner is EXCLUDED from the
 *     commit rows: its layout-measurement Toaster (per-toast height probing,
 *     hover/swipe geometry) does not render under happy-dom (it emits an empty
 *     `<section>`), so a happy-dom commit number would be a harness artifact.
 *     A real-browser (Playwright) three-way commit bench is the honest follow-up.
 *
 * Each measurement runs in its OWN fresh `bun` subprocess (worker) — this is
 * load-bearing: the Pyreon Toaster promotes `entering→visible` on a
 * `requestAnimationFrame`, and running create+update+dismiss phases back-to-back
 * in one process accumulates happy-dom's rAF/queue state and inflates the later
 * phases 100× (a pure harness artifact). One scenario per process = clean.
 *
 * Methodology mirrors the repo bench standard:
 *  - NODE_ENV=production BEFORE any import.
 *  - happy-dom registered (react-hot-toast / sonner touch `document` at eval).
 *  - Warmup to steady state; per-op median ns over 9 runs; K fresh-process
 *    spawns per cell pooled by median; correctness-gated (the toast text/node
 *    MUST be verified in the DOM before a number is trusted).
 *  - duration 0 / Infinity so auto-dismiss never fires mid-measurement.
 *
 * Author-judge disclosed. The RATIO is the portable claim; absolute ns are
 * machine-dependent.
 *
 * Run: bun bench/toast-commit-bench.ts   (from packages/fundamentals/toast)
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

const now = () => Number(process.hrtime.bigint())
const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]!
}
const measure = (fn: () => void, { warmup = 200, iters = 500, runs = 9 } = {}): number => {
  for (let i = 0; i < warmup; i++) fn()
  const s: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    s.push((now() - t0) / iters)
  }
  return median(s)
}

const N_BURST = 50 // ≤ Pyreon's MAX_TOASTS=50 → no eviction skew

// ── Create-throughput worker (headless, all three) ──────────────────────────
// NOTE this row is a COLD-START comparison BY CONSTRUCTION: a fresh process +
// 10-call warmup means the timed 50-burst runs JIT-UNTIRED code (measured
// decay for Pyreon on an idle M3 Max: ~3.5µs/create in this exact shape →
// ~0.62µs by call ~200 → ~0.22µs deep-warm). It cannot be warmed cross-lib
// fairly — sonner has no synchronous hard-reset, so any longer warmup
// accumulates its store and skews its own per-create cost O(N). The
// 'pyreon-warm' variant below reports Pyreon's steady-state number as a
// DISCLOSURE line (hard-reset per burst makes it measurable) — it is NOT
// cross-lib comparable and is never used in a verdict.
async function createThroughput(lib: 'pyreon' | 'pyreon-warm' | 'rht' | 'sonner'): Promise<number> {
  if (lib === 'pyreon' || lib === 'pyreon-warm') {
    const { toast, _reset } = await import('../src/toast')
    const warmCalls = lib === 'pyreon-warm' ? 200 : 10
    for (let w = 0; w < warmCalls; w++) {
      toast('w' + w, { duration: 0 })
      if ((w + 1) % N_BURST === 0) _reset() // stay under MAX_TOASTS during long warmup
    }
    _reset()
    const t0 = now()
    for (let i = 0; i < N_BURST; i++) toast('m' + i, { duration: 0 })
    const t1 = now()
    _reset()
    return (t1 - t0) / N_BURST
  }
  if (lib === 'rht') {
    const rht = (await import('react-hot-toast')).default
    for (let w = 0; w < 10; w++) {
      const id = rht('w' + w, { duration: Infinity })
      rht.remove(id)
    }
    const t0 = now()
    for (let i = 0; i < N_BURST; i++) rht('m' + i, { duration: Infinity })
    const t1 = now()
    for (const t of rht.getToasts?.() ?? []) rht.remove(t.id)
    return (t1 - t0) / N_BURST
  }
  await import('react')
  await import('react-dom')
  const sonner = await import('sonner')
  for (let w = 0; w < 10; w++) sonner.toast('w' + w, { duration: Infinity })
  const t0 = now()
  for (let i = 0; i < N_BURST; i++) sonner.toast('m' + i, { duration: Infinity })
  const t1 = now()
  return (t1 - t0) / N_BURST
}

// ── Mounted-commit worker (pyreon vs react-hot-toast) ───────────────────────
async function commit(scenario: 'create' | 'update' | 'dismiss'): Promise<{
  pyreon: number
  rht: number
}> {
  const React = (await import('react')).default
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')

  const { toast, _reset } = await import('../src/toast')
  const { Toaster } = await import('../src/toaster')
  const { mount } = await import('@pyreon/runtime-dom')
  const { h } = await import('@pyreon/core')
  _reset()
  const pHost = document.createElement('div')
  document.body.appendChild(pHost)
  mount(h(Toaster, { max: 200 }), pHost)
  const pCount = () => document.querySelectorAll('.pyreon-toast').length

  const rht = (await import('react-hot-toast')).default
  const { Toaster: RhtToaster } = await import('react-hot-toast')
  const rHost = document.createElement('div')
  document.body.appendChild(rHost)
  const rRoot = createRoot(rHost)
  flushSync(() => rRoot.render(React.createElement(RhtToaster, { position: 'top-right' })))
  const rCount = () => rHost.querySelectorAll('[role="status"],[role="alert"]').length

  let n = 0
  if (scenario === 'create') {
    const p = () => {
      const id = toast('m' + (n++ & 1023), { duration: 0 })
      if (pCount() < 1) throw new Error('pyreon create not committed')
      toast.remove(id)
    }
    const r = () => {
      let id!: string
      flushSync(() => {
        id = rht('m' + (n++ & 1023), { duration: Infinity })
      })
      if (rCount() < 1) throw new Error('rht create not committed')
      flushSync(() => rht.remove(id))
    }
    return { pyreon: measure(p), rht: measure(r) }
  }
  if (scenario === 'update') {
    const pid = toast.loading('start')
    if (pCount() < 1) throw new Error('pyreon update setup not committed')
    let rid!: string
    flushSync(() => {
      rid = rht('start', { duration: Infinity })
    })
    const p = () => {
      const m = 'u' + (n++ & 1023)
      toast.update(pid, { message: m })
      if (!document.querySelector('.pyreon-toast__message')?.textContent?.includes(m))
        throw new Error('pyreon update not committed')
    }
    const r = () => {
      const m = 'u' + (n++ & 1023)
      flushSync(() => rht(m, { id: rid, duration: Infinity }))
      if (!rHost.textContent?.includes(m)) throw new Error('rht update not committed')
    }
    return { pyreon: measure(p), rht: measure(r) }
  }
  // dismiss — create then hard-remove; time the create+remove→commit round-trip
  const p = () => {
    const id = toast('d' + (n++ & 1023), { duration: 0 })
    toast.remove(id)
    if (pCount() !== 0) throw new Error('pyreon dismiss not committed')
  }
  const r = () => {
    let id!: string
    flushSync(() => {
      id = rht('d' + (n++ & 1023), { duration: Infinity })
    })
    flushSync(() => rht.remove(id))
    if (rCount() !== 0) throw new Error('rht dismiss not committed')
  }
  const res = { pyreon: measure(p), rht: measure(r) }
  _reset()
  rRoot.unmount()
  return res
}

// ── Worker dispatch ─────────────────────────────────────────────────────────
const WORKER = process.env.PYREON_BENCH_WORKER
if (WORKER) {
  if (WORKER.startsWith('tp:')) {
    const ns = await createThroughput(WORKER.slice(3) as 'pyreon' | 'pyreon-warm' | 'rht' | 'sonner')
    process.stdout.write(JSON.stringify({ ns }))
  } else {
    const res = await commit(WORKER as 'create' | 'update' | 'dismiss')
    process.stdout.write(JSON.stringify(res))
  }
  process.exit(0)
}

// ── Orchestrator ────────────────────────────────────────────────────────────
const K = 7
function spawnPool<T>(key: string): T[] {
  const out: T[] = []
  for (let k = 0; k < K; k++) {
    const proc = Bun.spawnSync(['bun', import.meta.path], {
      env: { ...process.env, PYREON_BENCH_WORKER: key },
      stdout: 'pipe',
    })
    const txt = proc.stdout.toString().trim()
    try {
      out.push(JSON.parse(txt) as T)
    } catch {
      // worker failed → skip sample
    }
  }
  return out
}

const tp = {
  pyreon: median(spawnPool<{ ns: number }>('tp:pyreon').map((r) => r.ns)),
  pyreonWarm: median(spawnPool<{ ns: number }>('tp:pyreon-warm').map((r) => r.ns)),
  rht: median(spawnPool<{ ns: number }>('tp:rht').map((r) => r.ns)),
  sonner: median(spawnPool<{ ns: number }>('tp:sonner').map((r) => r.ns)),
}

type Pair = { pyreon: number; rht: number }
const commitRows = {
  create: spawnPool<Pair>('create'),
  update: spawnPool<Pair>('update'),
  dismiss: spawnPool<Pair>('dismiss'),
}
const commitMed = (rows: Pair[]): Pair => ({
  pyreon: median(rows.map((r) => r.pyreon)),
  rht: median(rows.map((r) => r.rht)),
})

// ── output ──────────────────────────────────────────────────────────────
const fmt = (x: number) =>
  Number.isNaN(x) ? 'n/a' : x >= 1000 ? `${(x / 1000).toFixed(2)}µs` : `${x.toFixed(0)}ns`

console.log(`\nMounted/commit toast benchmark — @pyreon/toast vs react-hot-toast vs sonner`)
console.log(`Node ${process.version}, ${process.platform} ${process.arch}, NODE_ENV=production`)
console.log(`Median ns/op (lower = faster). Multiplier = vs fastest in row. K=${K} fresh spawns/cell.\n`)

console.log(
  `CREATE COLD-START INGEST — burst of ${N_BURST}, fresh process per sample (all three equally JIT-cold)`,
)
{
  const vals = [tp.pyreon, tp.rht, tp.sonner].filter((x) => !Number.isNaN(x))
  const min = Math.min(...vals)
  const cell = (x: number) => (Number.isNaN(x) ? 'n/a' : `${fmt(x)}(${(x / min).toFixed(1)}x)`)
  console.log(['op', 'pyreon', 'react-hot-toast', 'sonner'].map((h) => h.padEnd(18)).join(''))
  console.log('─'.repeat(72))
  console.log(
    'create(cold)'.padEnd(18) +
      cell(tp.pyreon).padEnd(18) +
      cell(tp.rht).padEnd(18) +
      cell(tp.sonner).padEnd(18),
  )
  console.log(
    `\n(This row is a COLD-START comparison by construction: the 50-burst runs JIT-untired code — it cannot`,
  )
  console.log(
    ` be warmed cross-lib fairly because sonner has no synchronous hard-reset (a longer warmup accumulates`,
  )
  console.log(
    ` its store → O(N) skew of its own cost). Pyreon steady-state create, disclosure only, NOT cross-lib`,
  )
  console.log(
    ` comparable: ${fmt(tp.pyreonWarm)}/create post-tier (200-call warmup, hard-reset per burst).)`,
  )
}

console.log(
  `\nMOUNTED COMMIT — real Toaster, DOM-verified (@pyreon/toast fine-grained vs react-hot-toast React re-render)`,
)
console.log(`(sonner omitted — its layout-measurement Toaster does not render under happy-dom)`)
{
  console.log(['op', 'pyreon', 'react-hot-toast', 'winner'].map((h) => h.padEnd(18)).join(''))
  console.log('─'.repeat(72))
  const row = (name: string, r: Pair) => {
    const min = Math.min(r.pyreon, r.rht)
    const winner = r.pyreon === min ? 'pyreon' : 'react-hot-toast'
    const cell = (x: number) => `${fmt(x)}(${(x / min).toFixed(1)}x)`
    console.log(name.padEnd(18) + cell(r.pyreon).padEnd(18) + cell(r.rht).padEnd(18) + winner)
  }
  row('create→commit', commitMed(commitRows.create))
  row('update→commit', commitMed(commitRows.update))
  row('dismiss→commit', commitMed(commitRows.dismiss))
}

console.log(
  '\n' +
    JSON.stringify(
      {
        meta: { node: process.version, platform: `${process.platform}/${process.arch}`, K },
        createThroughput: tp,
        commit: {
          create: commitMed(commitRows.create),
          update: commitMed(commitRows.update),
          dismiss: commitMed(commitRows.dismiss),
        },
      },
      null,
      0,
    ),
)
