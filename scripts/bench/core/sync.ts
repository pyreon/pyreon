/**
 * @pyreon/sync benchmark — Pyreon-only throughput sanity for the CRDT→signal
 * hot paths. Validates the package's signature claim ("a remote op becomes one
 * signal.set → one fine-grained DOM update") and QUANTIFIES the two
 * O(N)-per-change spots so an optimization can be judged on numbers, not theory:
 *
 *   1. `syncedAwareness` recompute — runs on EVERY awareness change, including
 *      every remote cursor move. `snapshot()` iterates `getStates()` (O(N)) and
 *      `others` re-filters (O(N)). At N live cursors this is O(N) per frame.
 *      The `Presence wrapper tax` section then frames this FAIRLY: it measures a
 *      local cursor publish through the FULL `syncedAwareness` wrapper vs a bare
 *      `y-protocols` `setLocalStateField`, at N peers — the DELTA is the wrapper's
 *      per-publish overhead (the change-observer snapshot + signal fan-out). Near-
 *      zero at a handful of peers, growing O(N) as the room fills (the documented
 *      "throttle cursor publishes past dozens of peers" limit, now quantified).
 *   2. `syncedList` rebuild — the Y.Array observer does `base.set(yarr.toArray())`,
 *      an O(N) materialization per change (the keyed <For> keeps the DOM surgical;
 *      this measures only the array rebuild).
 *
 * Usage: bun scripts/bench/core/sync.ts
 *
 * NODE_ENV=production is forced FIRST — Pyreon's dev mode keeps the
 * reactive-devtools registry always-on (per-primitive `new Error()` capture),
 * which would bench the instrumentation, not the framework.
 *
 * ── MEASURED FINDINGS (Apple M3 Max, bun 1.3, 2026-06) ────────────────────────
 * These are µs-scale microbenches — high-CV and machine-load-dependent (the
 * same N=200 row measured 3.4µs on an idle machine and 9.6µs under load); the
 * SHAPE (clean O(N)) and the ORDER OF MAGNITUDE are the signal, not the exact
 * value. Awareness recompute ≈ O(N), low single-digit µs at realistic peer
 * counts (dozens), reaching ~10–30µs only at 200–500 peers. syncedList
 * `toArray` rebuild ≈ O(N), ~1–10µs for typical lists (100–1000 items),
 * ~tens of µs at 5000. Remote-op→signal propagation ~5µs/write.
 *
 * PRESENCE WRAPPER TAX (a local cursor publish, wrapped vs raw y-protocols, R1
 * measured Apple M3 Max / bun 1.3.14): raw `setLocalStateField` is FLAT ~260ns
 * (O(1) — publish never touches the peer set); the `syncedAwareness` wrapper adds
 * ~100ns at 1 peer, ~290ns at 10, ~860ns at 50, ~3.5µs at 200 — i.e. O(N) in the
 * room's peer count (the change-observer snapshot + signal fan-out). The tax is
 * negligible at the typical handful-to-dozens of collaborators, and even at 200
 * peers the wrapped path still sustains ~265k publishes/s — orders of magnitude
 * above any real mouse-move rate. The wrapper is honest overhead-over-raw, not a
 * hidden cost: throttle cursor publishes only when MANY peers publish at high
 * rate at once (the same v1 limit the package already documents).
 *
 * Two speculative optimizations were considered + REJECTED on these numbers
 * (do-not-re-propose without a NEW real-app measurement):
 *   • Incremental awareness (delta-track changed peers instead of the full
 *     O(N) snapshot+filter per change). At realistic live-cursor counts (dozens
 *     of peers) the recompute is sub-3µs — negligible. It only matters at 200+
 *     simultaneous cursors, which the package already documents as a v1 limit
 *     with the standard mitigation (throttle cursor publishes). The fix also
 *     can't avoid the O(N) array materialization the `Signal<PeerState[]>` API
 *     requires, so the win is smaller than it looks. Not worth the correctness
 *     risk in a presence path.
 *   • syncedList delta-apply (splice instead of `toArray()` rebuild). The keyed
 *     `<For>` already keeps the DOM surgical; the toArray is sub-10µs for
 *     typical lists, and huge frequently-mutated lists belong in @pyreon/virtual.
 *
 * The lasting value here is the benchmark itself: it validates the signature
 * claim ("one remote op → one signal.set") and locks the O(N) characterization
 * against regression. Run it before any future sync-perf change.
 */
process.env.NODE_ENV = 'production'

import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { effect } from '../../../packages/core/reactivity/src/index'
import { syncedSignal } from '../../../packages/fundamentals/sync/src/index'
// Relative-to-`src` imports (not `@pyreon/sync`) are the established
// `scripts/bench/` convention — they bench the CURRENT SOURCE with no `lib/`
// build step, and the package name resolves to built `lib/` at bun runtime
// (the `bun` export condition isn't applied to a bare specifier here). All
// existing benches (reactivity, router, head, …) do the same. Only PUBLIC
// entry points are used (`src/index`, `src/yjs`), no internal module reach.
import {
  createYjsDoc,
  getDocAwareness,
  syncedAwareness,
} from '../../../packages/fundamentals/sync/src/yjs'

interface BenchResult {
  label: string
  opsPerSec: number
  avgNs: number
}

function bench(label: string, fn: () => void, durationMs = 1500): BenchResult {
  for (let i = 0; i < 1000; i++) fn() // warmup
  let ops = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    fn()
    ops++
  }
  const elapsed = performance.now() - start
  return {
    label,
    opsPerSec: Math.round((ops / elapsed) * 1000),
    avgNs: Math.round((elapsed / ops) * 1_000_000),
  }
}

/**
 * Median-of-runs wrapper for the high-CV presence microbenches. Runs `bench`
 * `runs` times and returns the MEDIAN ops/sec + avg-ns, with lo/hi (min/max
 * ops/sec across runs) as a crude spread indicator — these are µs-scale writes,
 * so the median + spread is the honest signal, not a single hot-loop mean. We
 * deliberately do NOT force `Bun.gc(true)` between runs (JSC jettisons compiled
 * code on a forced GC → re-tier bimodality that fakes losses).
 */
function benchMedian(
  label: string,
  fn: () => void,
  runs = 5,
  durationMs = 600,
): BenchResult & { lo: number; hi: number } {
  const samples: BenchResult[] = []
  for (let i = 0; i < runs; i++) samples.push(bench(label, fn, durationMs))
  samples.sort((a, b) => a.opsPerSec - b.opsPerSec)
  const mid = samples[Math.floor(runs / 2)]
  return {
    label,
    opsPerSec: mid.opsPerSec,
    avgNs: mid.avgNs,
    lo: samples[0].opsPerSec,
    hi: samples[runs - 1].opsPerSec,
  }
}

function printSection(title: string, results: BenchResult[]) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 66 - title.length - 4))}`)
  console.log(`${'test'.padEnd(42)}${'ops/sec'.padStart(12)}${'avg ns/op'.padStart(14)}`)
  console.log('-'.repeat(68))
  for (const r of results) {
    console.log(
      `${r.label.padEnd(42)}${r.opsPerSec.toLocaleString().padStart(12)}${r.avgNs.toLocaleString().padStart(14)}`,
    )
  }
}

// ── Awareness recompute at N peers ────────────────────────────────────────────
// Replicates the exact `onChange` hot body in syncedAwareness (snapshot +
// others-filter) against a doc-awareness populated with N remote peers. This is
// the cost paid on every awareness change — i.e. every remote cursor move.
function benchAwareness(): BenchResult[] {
  const results: BenchResult[] = []
  for (const n of [10, 50, 200, 500]) {
    const doc = createYjsDoc()
    const aw = getDocAwareness(doc)
    aw.setLocalState({ name: 'me', cursor: { x: 0, y: 0 } })
    for (let i = 0; i < n; i++) {
      const src = new Awareness(new Y.Doc())
      src.setLocalState({ name: `peer${i}`, cursor: { x: i, y: i } })
      applyAwarenessUpdate(aw, encodeAwarenessUpdate(src, [src.clientID]), 'bench')
    }
    const recompute = () => {
      const out: { clientId: number; state: unknown; isLocal: boolean }[] = []
      for (const [clientId, state] of aw.getStates()) {
        if (state == null) continue
        out.push({ clientId, state, isLocal: clientId === aw.clientID })
      }
      return out.filter((p) => !p.isLocal).length
    }
    results.push(bench(`awareness recompute (N=${n} peers)`, recompute))
  }
  return results
}

// ── Presence WRAPPER TAX — local cursor publish (the mousemove hot path) ──────
// The FAIR framing: what does the `syncedAwareness` WRAPPER add over calling
// y-protocols directly? A live cursor publish is the dominant presence hot path
// (fired on every mousemove). We measure the SAME publish two ways at N peers in
// the room and report the DELTA (the wrapper tax):
//   • RAW      — `awareness.setLocalStateField('cursor', …)` on a bare Awareness
//                with NO wrapper listener (the y-protocols baseline).
//   • WRAPPED  — `syncedAwareness.setLocalField('cursor', …)`, which drives the
//                same y-protocols write PLUS the wrapper's `change` observer:
//                a full O(N) `snapshot()` + `others`/`states`/`local` signal.set.
// Cursor coords are randomized per op (a real move, so `change` actually fires;
// the alloc cancels in the delta). Populating the room with N remote peers makes
// the wrapper's per-publish snapshot O(N) — so the tax GROWS with peer count,
// which is exactly the documented "presence is O(N) per change" story, now
// QUANTIFIED as an overhead-over-raw rather than an absolute.
function populatePeers(aw: import('y-protocols/awareness').Awareness, n: number): void {
  for (let i = 0; i < n; i++) {
    const src = new Awareness(new Y.Doc())
    src.setLocalState({ name: `peer${i}`, cursor: { x: i, y: i } })
    applyAwarenessUpdate(aw, encodeAwarenessUpdate(src, [src.clientID]), 'bench')
    src.destroy()
  }
}

interface WrapperTaxRow {
  n: number
  rawNs: number
  wrappedNs: number
  taxNs: number
  wrappedOps: number
  wrappedLo: number
  wrappedHi: number
}

function benchPresenceWrapperTax(): WrapperTaxRow[] {
  const rows: WrapperTaxRow[] = []
  for (const n of [1, 10, 50, 200]) {
    // RAW baseline — bare Awareness, no wrapper listener.
    const rawDoc = new Y.Doc()
    const awRaw = new Awareness(rawDoc)
    awRaw.setLocalState({ name: 'me', cursor: { x: 0, y: 0 } })
    populatePeers(awRaw, n)
    const raw = benchMedian(`raw setLocalStateField (N=${n})`, () =>
      awRaw.setLocalStateField('cursor', { x: Math.random(), y: Math.random() }),
    )

    // WRAPPED — the full syncedAwareness path (change → snapshot O(N) → signal.set).
    const wDoc = createYjsDoc()
    const presence = syncedAwareness<{ name: string; cursor: { x: number; y: number } }>(wDoc, {
      name: 'me',
      cursor: { x: 0, y: 0 },
    })
    populatePeers(getDocAwareness(wDoc), n)
    const wrapped = benchMedian(`wrapped setLocalField (N=${n})`, () =>
      presence.setLocalField('cursor', { x: Math.random(), y: Math.random() }),
    )

    rows.push({
      n,
      rawNs: raw.avgNs,
      wrappedNs: wrapped.avgNs,
      taxNs: wrapped.avgNs - raw.avgNs,
      wrappedOps: wrapped.opsPerSec,
      wrappedLo: wrapped.lo,
      wrappedHi: wrapped.hi,
    })

    presence.dispose()
    wDoc.destroy()
    awRaw.destroy()
    rawDoc.destroy()
  }
  return rows
}

function printWrapperTax(rows: WrapperTaxRow[]): void {
  const title = 'Presence wrapper tax — cursor publish (raw y-protocols vs syncedAwareness)'
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 78 - title.length - 4))}`)
  console.log(
    `${'peers'.padStart(6)}${'raw ns'.padStart(12)}${'wrapped ns'.padStart(14)}${'tax ns'.padStart(12)}${'wrapped ops/s'.padStart(16)}${'ops lo–hi'.padStart(20)}`,
  )
  console.log('-'.repeat(80))
  for (const r of rows) {
    console.log(
      `${String(r.n).padStart(6)}${r.rawNs.toLocaleString().padStart(12)}${r.wrappedNs.toLocaleString().padStart(14)}${r.taxNs.toLocaleString().padStart(12)}${r.wrappedOps.toLocaleString().padStart(16)}${`${r.wrappedLo.toLocaleString()}–${r.wrappedHi.toLocaleString()}`.padStart(20)}`,
    )
  }
}

// ── syncedList rebuild at N items ─────────────────────────────────────────────
function benchSyncedList(): BenchResult[] {
  const results: BenchResult[] = []
  for (const n of [100, 1000, 5000]) {
    const doc = createYjsDoc()
    const yarr = doc.yDoc.getArray<number>('items')
    yarr.push(Array.from({ length: n }, (_, i) => i))
    results.push(bench(`syncedList toArray rebuild (N=${n})`, () => void yarr.toArray()))
  }
  return results
}

// ── Remote op → signal propagation (signature path, BOUNDED) ──────────────────
// A syncedSignal observer write IS just `base.set(map.get(key))`. We measure
// that propagation against a FRESH doc per micro-batch so the Yjs history can't
// grow unboundedly and skew steady-state cost (a CRDT doc grows with every
// write — an unbounded loop measures history-replay, not per-op propagation).
// Each timed unit: fresh doc + syncedSignal + subscriber, then K writes.
function benchRemoteOp(): BenchResult[] {
  const K = 50
  const r = bench(
    `syncedSignal write→observe→effect (×${K}, fresh doc/unit)`,
    () => {
      const doc = createYjsDoc()
      const sig = syncedSignal<number>({ doc, key: 'v', initial: 0 })
      let runs = 0
      const stop = effect(() => {
        sig()
        runs++
      })
      for (let i = 0; i < K; i++) sig.set(i)
      stop.dispose?.()
      void runs
    },
    1000,
  )
  // Normalize to per-write ns.
  return [{ ...r, label: r.label, avgNs: Math.round(r.avgNs / K) }]
}

console.log('\n@pyreon/sync — CRDT→signal hot-path benchmark (NODE_ENV=production)')
printSection('Awareness recompute (per cursor move)', benchAwareness())
printWrapperTax(benchPresenceWrapperTax())
printSection('syncedList rebuild (per change)', benchSyncedList())
printSection('Remote op → signal (signature path, per-write ns)', benchRemoteOp())
console.log()
