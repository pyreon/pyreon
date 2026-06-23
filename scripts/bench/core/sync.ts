/**
 * @pyreon/sync benchmark — Pyreon-only throughput sanity for the CRDT→signal
 * hot paths. Validates the package's signature claim ("a remote op becomes one
 * signal.set → one fine-grained DOM update") and QUANTIFIES the two
 * O(N)-per-change spots so an optimization can be judged on numbers, not theory:
 *
 *   1. `syncedAwareness` recompute — runs on EVERY awareness change, including
 *      every remote cursor move. `snapshot()` iterates `getStates()` (O(N)) and
 *      `others` re-filters (O(N)). At N live cursors this is O(N) per frame.
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
import { createYjsDoc, getDocAwareness } from '../../../packages/fundamentals/sync/src/yjs'

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
printSection('syncedList rebuild (per change)', benchSyncedList())
printSection('Remote op → signal (signature path, per-write ns)', benchRemoteOp())
console.log()
