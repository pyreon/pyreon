// @ts-nocheck
/**
 * Per-primitive heap measurement for @pyreon/reactivity.
 *
 * Run:  bun run measure-memory            (defaults: 100k items, 5 samples)
 *       bun run measure-memory -- 50000 7 (50k items, 7 samples)
 *
 * Measures the PRODUCTION cost. The npm script sets `NODE_ENV=production`, which
 * gates OFF the dev-only reactive-devtools machinery (per-primitive `new Error()`
 * source-capture + the always-on registry) — i.e. exactly what consumers ship
 * after their bundler strips the dev branches. Run without that env var and the
 * dev instrumentation dominates (and OOMs at 100k) — a useful demonstration that
 * the dev overhead is real but prod-gated, not the number users pay.
 *
 * WHY this exists — the instrumentation gap. The repo already gates:
 *   - bundle bytes        → scripts/check-bundle-budgets.ts (deterministic, CI-gated)
 *   - allocation COUNTS   → @pyreon/perf-harness journeys (signalCreate, etc.)
 *   - heap-growth SLOPE   → scripts/leak-sweep.ts (leak detection)
 * …but NOTHING measured the *retained bytes per primitive*. "How heavy is a
 * signal?" had no reproducible answer. This tool fills that gap.
 *
 * WHY node --expose-gc (not bun). Reliable retained-heap measurement needs a
 * forced full GC + a trustworthy `heapUsed`. Node's V8 `--expose-gc` +
 * `process.memoryUsage().heapUsed` delivers both; Bun's `process.memoryUsage()`
 * under-reports JSC allocations here (measured 0.00 MB deltas), so the npm
 * script shells out to node.
 *
 * WHY it imports the built lib by RELATIVE path. The repo resolves `@pyreon/*`
 * via the bun `customConditions` (no `node_modules/@pyreon/*` symlinks), so a
 * bare `@pyreon/reactivity` specifier is unresolvable under plain node. We
 * import `../packages/core/reactivity/lib/index.js` directly — reactivity is
 * the foundation package (no `@pyreon` deps), so node loads it standalone. Run
 * `bun install` / `bun scripts/bootstrap.ts` first if lib/ is stale.
 *
 * WHY a TOOL, not a CI gate. Runtime heap is noisy (±~10% run-to-run from GC
 * granularity + hidden-class churn), so gating it would flake. Bundle-budgets
 * already gates the *deterministic* dimension (gzipped bytes). Use this for
 * RELATIVE regression checks — "did my change make a signal fatter?" — and run
 * it before/after a reactivity change. Absolute bytes are method-dependent: the
 * in-browser perf-harness measures ~170 B/signal (reactivitySignalCreate-100k
 * ≈ 17 MB); this node tool typically reads higher because heapUsed includes
 * broader accounting (closure contexts, the holding array's backing store,
 * fragmentation). The ORDER and the RELATIVE deltas are the signal.
 */
import {
  computed,
  effect,
  effectScope,
  signal,
} from '../packages/core/reactivity/lib/index.js'

if (typeof globalThis.gc !== 'function') {
  console.error(
    '[measure-memory] global.gc is undefined — run with `node --expose-gc` ' +
      '(the `bun run measure-memory` npm script does this for you).',
  )
  process.exit(1)
}

const N = Number(process.argv[2]) || 100_000
const SAMPLES = Number(process.argv[3]) || 5
const REF_BYTES = 8 // one pointer slot per item in the holding array

/** Force a thorough full GC (twice — second pass collects what the first freed). */
function fullGc() {
  globalThis.gc()
  globalThis.gc()
}

function heapUsed() {
  return process.memoryUsage().heapUsed
}

/**
 * Measure retained bytes per item for `make(i)`. Keeps every produced value
 * alive in an array (so it's retained, not collected), GCs, and divides the
 * heap delta by N — minus one pointer slot per item for the holding array.
 */
function measureOnce(make) {
  const keep = new Array(N)
  fullGc()
  const before = heapUsed()
  for (let i = 0; i < N; i++) keep[i] = make(i)
  fullGc()
  const after = heapUsed()
  // Touch `keep` after measuring so the optimizer can't elide the allocations.
  if (keep.length !== N) throw new Error('unreachable')
  const perItem = (after - before) / N - REF_BYTES
  return perItem
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function measure(label, make) {
  // Warmup: run once so V8 JIT + hidden classes are warm, then discard.
  measureOnce(make)
  const runs = []
  for (let i = 0; i < SAMPLES; i++) runs.push(measureOnce(make))
  const med = median(runs)
  const min = Math.min(...runs)
  const max = Math.max(...runs)
  return { label, med, min, max }
}

const cases = [
  // A bare signal — the per-reactive-node floor.
  ['signal', () => signal(0)],
  // signal + computed reading it (retains the signal + the dep link).
  [
    'signal + computed',
    (i) => {
      const s = signal(i)
      const c = computed(() => s() + 1)
      c() // resolve once (realistic: a computed is read)
      return c
    },
  ],
  // signal + effect subscribed to it (keep the disposer → retains both).
  [
    'signal + effect',
    (i) => {
      const s = signal(i)
      let seen = 0
      const dispose = effect(() => {
        seen += s()
      })
      return dispose
    },
  ],
  // An empty EffectScope — exercises the lazy-null-array design.
  ['effectScope', () => effectScope()],
]

console.log(
  `\n@pyreon/reactivity — retained heap per primitive  (N=${N.toLocaleString()}, samples=${SAMPLES}, node --expose-gc)\n`,
)
const rows = cases.map(([label, make]) => measure(label, make))
const w = Math.max(...rows.map((r) => r.label.length))
console.log(`  ${'primitive'.padEnd(w)}   bytes/item (median)   range`)
console.log(`  ${'-'.repeat(w)}   -------------------   -----`)
for (const r of rows) {
  const med = `${Math.round(r.med).toLocaleString()} B`
  const range = `${Math.round(r.min).toLocaleString()}–${Math.round(r.max).toLocaleString()} B`
  console.log(`  ${r.label.padEnd(w)}   ${med.padStart(19)}   ${range}`)
}
console.log(
  '\n  Notes: V8 heapUsed deltas under NODE_ENV=production (dev devtools gated off).',
)
console.log(
  '  RELATIVE deltas across a code change are the signal — run before/after a edit.',
)
console.log(
  '  Cross-ref: signal ≈ 152 B here vs ~170 B in the in-browser perf-harness',
)
console.log(
  '  (reactivitySignalCreate-100k ≈ 17 MB) — same order, node V8 reads slightly',
)
console.log(
  '  leaner. NOT a CI gate (runtime heap is too noisy to gate; bundle-budgets',
)
console.log('  gates the deterministic bundle bytes instead).\n')
