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
 * Plus two hot-path cells added with the 2026-08 perf pass (see their section
 * comments): `syncedText .set` per-keystroke cost (the prev-materialization
 * fast path) and WS inbound frame delivery (async `toBytes` vs the sync fast
 * path the arraybuffer binaryType permits).
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
// Force production before the framework dev gates are EVALUATED.
//
// CAVEAT: ESM HOISTS static imports above every top-level statement, so this
// assignment runs AFTER the imports below evaluate — it does NOT beat them.
// It works here only because every library benched in this file reads
// NODE_ENV at CALL time (Pyreon's `process.env.NODE_ENV !== 'production'`
// gates live inside functions), not at module-init. Verified empirically:
// numbers are identical with NODE_ENV pre-set in the environment.
//
// A library that selects its build at MODULE-INIT (react-dom is the known
// case) would silently load its DEV build here. If you add one, switch this
// file to the self-re-exec guard + dynamic imports used by
// `ssr-crossframework.ts` and `runtime-server.ts`.
process.env.NODE_ENV = 'production'
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { effect } from '../../../packages/core/reactivity/src/index'
import {
  REMOTE_ORIGIN,
  syncedSignal,
  syncedStore,
} from '../../../packages/fundamentals/sync/src/index'
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
  syncedText,
} from '../../../packages/fundamentals/sync/src/yjs'
// INTERNAL import (the one exception to the public-entry convention above): the
// inbound-frame cell measures the WS transport's normalization seam
// (`toBytes` vs `toBytesSync`) in isolation, and no public entry exposes it —
// the public path requires a live socket, which would bench the network stack.
import {
  MSG_UPDATE,
  decodeSyncMessage,
  encodeSyncMessage,
  toBytes,
  toBytesSync,
} from '../../../packages/fundamentals/sync/src/crdt/ws-protocol'

interface BenchResult {
  label: string
  opsPerSec: number
  avgNs: number
}

function bench(
  label: string,
  fn: () => void,
  durationMs = 1500,
  // Warmup is ITERATION-counted, so a cell whose unit is a millisecond-scale
  // composite (fresh doc + K keystrokes) must pass a smaller count — 1000 such
  // units is tens of seconds of pure warmup (worse under machine load), for a
  // JIT that the unit's own inner loop already warms.
  warmupIters = 1000,
): BenchResult {
  for (let i = 0; i < warmupIters; i++) fn() // warmup
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
  warmupIters = 1000,
): BenchResult & { lo: number; hi: number } {
  const samples: BenchResult[] = []
  for (let i = 0; i < runs; i++) samples.push(bench(label, fn, durationMs, warmupIters))
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

/**
 * Async sibling of `bench` for paths whose REAL shape awaits a promise per op
 * (the historical WS inbound handler). The await machinery is deliberately
 * INSIDE the timed region — the per-op microtask hop is exactly the cost the
 * sync fast path removes, so excluding it would bench away the finding.
 */
async function benchAsync(
  label: string,
  fn: () => Promise<void>,
  durationMs = 1500,
): Promise<BenchResult> {
  for (let i = 0; i < 1000; i++) await fn() // warmup
  let ops = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    await fn()
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

// ── syncedText per-keystroke .set (controlled-input hot path) ─────────────────
// The dominant collaborative-text write shape: a controlled <textarea> hands the
// FULL next string to `.set` on every keystroke and `.set` diffs it against the
// previous text. Historically `prev` was materialized with `ytext.toString()`
// even though the observer had ALREADY materialized the identical string into
// the base signal at the last transaction end — two full materializations per
// keystroke. The fast path reads `base.peek()` instead (guarded: falls back to
// toString() mid-transaction / mid-observer-phase / post-dispose).
//
// MEASURED SHAPE FINDING (2026-08, decided the fix's fate — keep it honest):
// `ytext.toString()` cost is dominated by the Y.Text's ITEM COUNT, not its
// character length. A CONTIGUOUS doc (one insert + tail appends — what a naive
// bench builds) is ~1 merged item and toString is memcpy-cheap (~106ns at 10k
// chars), so removing one of them is INVISIBLE (<±3%, inside noise) — the
// contiguous rows below exist to lock that honest null result. A FRAGMENTED doc
// (2000 interleaved 5-char inserts — what real collaborative editing produces)
// pays ~50µs PER toString at the same 10k chars, so the removed prev
// materialization is roughly HALF the keystroke cost — the fragmented row is
// the representative workload and the fix's justification.
//
// Fresh doc per timed unit (the benchRemoteOp convention) so Yjs history can't
// grow unboundedly and skew steady-state cost; the fragmented initial state is
// cloned per unit via a prebuilt binary update (preserves fragmentation, far
// cheaper than replaying 2000 inserts). Setup is amortized over K keystrokes
// and identical across arms — the A/B DELTA between arms is the clean signal.
// The observer's own toString + the prefix/suffix diff scan + the app-side
// string build are inherent to `.set(fullText)` and identical in both arms.

/** A 10k-char Y.Text built from 2000 random-position inserts, as a binary update. */
function makeFragmentedTemplate(chars: number): Uint8Array {
  const d = new Y.Doc()
  const t = d.getText('body')
  let len = 0
  // Deterministic LCG so the fragmentation shape is identical across runs/arms.
  let seed = 42
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  while (len < chars) {
    t.insert(Math.floor(rnd() * len), 'abcde')
    len += 5
  }
  const update = Y.encodeStateAsUpdate(d)
  d.destroy()
  return update
}

function benchSyncedTextKeystroke(): BenchResult[] {
  const results: BenchResult[] = []

  const run = (label: string, K: number, setup: (doc: ReturnType<typeof createYjsDoc>) => void) => {
    const r = benchMedian(
      label,
      () => {
        const doc = createYjsDoc()
        setup(doc)
        const t = syncedText(doc, 'body')
        let s = t.peek()
        for (let i = 0; i < K; i++) {
          s += 'y'
          t.set(s)
        }
        t.dispose()
        doc.destroy()
      },
      5,
      600,
      // Composite ms-scale units: 30 warmup units suffice (the K-keystroke
      // inner loop warms the JIT within a single unit).
      30,
    )
    // Normalize the per-UNIT numbers to per-KEYSTROKE. NOTE the printed
    // figure still includes the unit's amortized setup (doc create + template
    // clone) / K — measured ~10% at the fragmented row — so ABSOLUTES read
    // slightly HIGH and an A/B ratio reads slightly LOW (conservative); the
    // arm-to-arm DELTA is the clean signal.
    results.push({
      label: r.label,
      avgNs: Math.round(r.avgNs / K),
      opsPerSec: r.opsPerSec * K,
    })
  }

  for (const n of [1000, 10_000]) {
    const initial = 'x'.repeat(n)
    run(`syncedText .set keystroke (contiguous ${n})`, 100, (doc) =>
      doc.yDoc.getText('body').insert(0, initial),
    )
  }
  const template = makeFragmentedTemplate(10_000)
  // K=200 keeps the per-unit clone (applyUpdate of the template) under ~10%
  // of the unit, so the per-keystroke number is dominated by keystrokes.
  run('syncedText .set keystroke (FRAGMENTED 10k)', 200, (doc) =>
    Y.applyUpdate(doc.yDoc, template),
  )
  return results
}

// ── WS inbound frame delivery — async toBytes vs sync fast path ───────────────
// The transport sets `binaryType = 'arraybuffer'`, yet the inbound handler
// historically routed EVERY frame through `toBytes(...).then(...)` — a promise
// allocation + a microtask hop per remote op, and the update landed a tick
// AFTER `onmessage` returned. `toBytesSync` handles the already-binary shapes
// (ArrayBuffer / Uint8Array, i.e. every frame in practice) inline. Both arms
// run normalize+decode on the same realistic single-keystroke update frame;
// the async arm's await machinery is inside the timed region on purpose — the
// microtask hop IS the cost the fast path removes.
async function benchInboundFrame(): Promise<BenchResult[]> {
  const src = new Y.Doc()
  src.getText('body').insert(0, 'x')
  const frame = encodeSyncMessage(MSG_UPDATE, Y.encodeStateAsUpdate(src))
  const ab = frame.buffer // ArrayBuffer-shaped, as a browser WS delivers it
  src.destroy()

  let sink = 0
  const asyncArm = await benchAsync('inbound frame normalize+decode (async, old)', async () => {
    const bytes = await toBytes(ab)
    sink += decodeSyncMessage(bytes).type
  })
  const syncArm = bench('inbound frame normalize+decode (SYNC fast path)', () => {
    const bytes = toBytesSync(ab)
    /* the gate proved this path is taken for ArrayBuffer — non-null by construction */
    sink += decodeSyncMessage(bytes as Uint8Array).type
  })
  void sink
  return [asyncArm, syncArm]
}

// ── Remote op → signal propagation (signature path, BOUNDED) ──────────────────
// ── syncedStore dispatcher (2026-08 pass) ───────────────────────────────────
// A syncedStore of N fields used to install 2N engine observers (one raw
// `map.observe` + one `defaults.observe` PER FIELD), each invoked at every
// committed transaction just to `changedKeys.has(key)`-filter. The per-(doc,
// map) dispatcher (`crdt/map-dispatch.ts`) makes that 1 observer per map with
// O(changed keys) routing. COUNTS are the structural claim (asserted here and
// in `synced-store-dispatcher.test.ts`); the wall rows quantify the per-write
// dispatch cost at N=20 — local set and remote-origin apply take the SAME
// observer path (the update-loop invariant), measured separately anyway so an
// origin-sensitive regression would show as a split.
function benchStoreDispatch(): { results: BenchResult[]; countsLine: string } {
  const N = 20
  const doc = createYjsDoc()
  const initial: Record<string, number> = {}
  for (let i = 0; i < N; i++) initial[`f${i}`] = i
  const store = syncedStore(initial, { doc })

  // Correctness gate for THIS cell: the write must be observable through the
  // signal AND land in the backing map (bench the path, not error-swallowing).
  store.f10!.set(-1)
  const map = doc.getMap('pyreon')
  if (store.f10!() !== -1 || map.get('f10') !== -1) {
    throw new Error('store-dispatch gate: write did not round-trip (signal/map)')
  }

  // Engine-side observer count on the REAL Yjs handler list — the N→1 fact.
  const yObs = (name: string): number =>
    (doc.yDoc.getMap(name) as unknown as { _eH: { l: unknown[] } })._eH.l.length
  const countsLine =
    `  observers @ ${N} fields: data map ${yObs('pyreon')}, defaults map ` +
    `${yObs('pyreon:defaults')} (raw per-field wiring installs ${N} each = ${2 * N} total)`

  let i = 0
  const results: BenchResult[] = []
  results.push(
    bench(`local set→dispatch→signal (${N}-field store)`, () => {
      store.f10!.set(i++)
    }),
  )
  results.push(
    bench(`remote-origin apply→dispatch→signal (${N}-field)`, () => {
      doc.transact(() => map.set('f10', i++), REMOTE_ORIGIN)
    }),
  )
  store.dispose()
  doc.destroy()
  return { results, countsLine }
}

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

// ── Correctness gate (runs BEFORE any timing) ─────────────────────────────────
//
// This bench publishes a "wrapper tax" — raw y-protocols vs `syncedAwareness` —
// and a wrapper that silently does nothing is INDISTINGUISHABLE from a wrapper
// that is free: the tax reads ~0 (or negative) and the row looks like a win.
// That is not hypothetical; `@pyreon/storage`'s bench shipped exactly that
// shape, where every Pyreon write threw into a swallowed catch and the
// documented "loss" turned out to be a wiring bug. So assert each measured path
// actually mutates observable state before trusting a single number from it.
function correctnessGate(): void {
  const fail = (what: string, got: unknown, want: unknown): never => {
    console.error(
      `x correctness gate: ${what}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}\n` +
        '  A path that silently no-ops would report as FASTER — refusing to print numbers.',
    )
    process.exit(1)
  }

  // 1. RAW baseline actually writes (it is the denominator of the tax).
  const rawDoc = new Y.Doc()
  const awRaw = new Awareness(rawDoc)
  awRaw.setLocalState({ name: 'me', cursor: { x: 0, y: 0 } })
  awRaw.setLocalStateField('cursor', { x: 11, y: 22 })
  const rawCursor = (awRaw.getLocalState() as { cursor?: unknown } | null)?.cursor
  if (JSON.stringify(rawCursor) !== JSON.stringify({ x: 11, y: 22 })) {
    fail('raw Awareness.setLocalStateField did not update local state', rawCursor, { x: 11, y: 22 })
  }

  // 2. WRAPPED path writes THROUGH to the same underlying awareness AND
  //    surfaces on the presence signal (the two halves the wrapper exists for).
  const wDoc = createYjsDoc()
  const presence = syncedAwareness<{ name: string; cursor: { x: number; y: number } }>(wDoc, {
    name: 'me',
    cursor: { x: 0, y: 0 },
  })
  presence.setLocalField('cursor', { x: 33, y: 44 })
  const underlying = (
    getDocAwareness(wDoc).getLocalState() as { cursor?: unknown } | null
  )?.cursor
  if (JSON.stringify(underlying) !== JSON.stringify({ x: 33, y: 44 })) {
    fail('syncedAwareness.setLocalField did not reach the underlying Awareness', underlying, {
      x: 33,
      y: 44,
    })
  }
  const localCursor = presence.local()?.cursor
  if (JSON.stringify(localCursor) !== JSON.stringify({ x: 33, y: 44 })) {
    fail('syncedAwareness `local` signal did not reflect the write', localCursor, { x: 33, y: 44 })
  }

  // 3. syncedList rebuild reads the real array (the row claims a per-change cost).
  const listDoc = createYjsDoc()
  const yarr = listDoc.yDoc.getArray<number>('items')
  yarr.push([1, 2, 3])
  if (yarr.toArray().length !== 3) {
    fail('Y.Array rebuild did not observe pushed items', yarr.toArray().length, 3)
  }

  // 4. Remote-op path: a syncedSignal write must reach the signal AND re-run
  //    its effect — the propagation being measured.
  const sDoc = createYjsDoc()
  const sig = syncedSignal<number>({ doc: sDoc, key: 'v', initial: 0 })
  let runs = 0
  const stop = effect(() => {
    sig()
    runs++
  })
  const before = runs
  sig.set(7)
  if (sig() !== 7) fail('syncedSignal.set did not update the signal', sig(), 7)
  if (runs <= before) fail('syncedSignal write did not re-run its effect', runs, `> ${before}`)
  stop.dispose?.()

  // 5. syncedText keystroke path: the .set diff must actually land in the
  //    Y.Text AND the signal must mirror it — the two halves the keystroke cell
  //    times. A .set that silently corrupted the diff would read as FASTER.
  const tDoc = createYjsDoc()
  const text = syncedText(tDoc, 'body')
  text.set('hello world')
  text.set('hello brave world')
  const ytextNow = tDoc.yDoc.getText('body').toString()
  if (ytextNow !== 'hello brave world') {
    fail('syncedText.set diff did not land in the Y.Text', ytextNow, 'hello brave world')
  }
  if (text() !== 'hello brave world') {
    fail('syncedText signal did not mirror the .set', text(), 'hello brave world')
  }

  // 6. Inbound-frame cell: BOTH normalize paths must produce identical bytes
  //    from the same ArrayBuffer frame, and the payload must be a REAL update
  //    (applies to a fresh doc). A normalize path returning wrong/empty bytes
  //    would decode garbage and bench a no-op.
  const fSrc = new Y.Doc()
  fSrc.getText('body').insert(0, 'x')
  const fFrame = encodeSyncMessage(MSG_UPDATE, Y.encodeStateAsUpdate(fSrc))
  const fromSync = toBytesSync(fFrame.buffer)
  if (fromSync === null) {
    fail('toBytesSync missed the ArrayBuffer shape (fast path never taken)', null, 'Uint8Array')
  }
  const fromAsyncP = toBytes(fFrame.buffer)
  // (async check completes before timing starts — see the await below)
  const fDst = new Y.Doc()
  const decoded = decodeSyncMessage(fromSync as Uint8Array)
  if (decoded.type !== MSG_UPDATE) {
    fail('inbound frame decoded to the wrong type', decoded.type, MSG_UPDATE)
  }
  Y.applyUpdate(fDst, decoded.payload)
  if (fDst.getText('body').toString() !== 'x') {
    fail('inbound frame payload did not apply', fDst.getText('body').toString(), 'x')
  }
  void fromAsyncP.then((fromAsync) => {
    if (JSON.stringify([...fromAsync]) !== JSON.stringify([...(fromSync as Uint8Array)])) {
      fail('toBytes and toBytesSync disagree on the same frame', [...fromAsync], [
        ...(fromSync as Uint8Array),
      ])
    }
  })
  fSrc.destroy()
  fDst.destroy()

  // 7. The TIMED fragmented workload itself must produce the right text — a
  //    .set that corrupted the diff on the FRAGMENTED shape specifically would
  //    bench FASTER under a gate that only checked a contiguous doc (the
  //    @pyreon/storage lesson: assert the effect the op claims to measure, on
  //    the same shape the timing runs). Same template + append loop as the
  //    timed unit, asserted here outside any timed region.
  const fragTemplate = makeFragmentedTemplate(10_000)
  const fragDoc = createYjsDoc()
  Y.applyUpdate(fragDoc.yDoc, fragTemplate)
  const fragBase = fragDoc.yDoc.getText('body').toString()
  const fragText = syncedText(fragDoc, 'body')
  let fragS = fragText.peek()
  for (let i = 0; i < 5; i++) {
    fragS += 'y'
    fragText.set(fragS)
  }
  const fragFinal = fragDoc.yDoc.getText('body').toString()
  if (fragFinal !== `${fragBase}yyyyy`) {
    fail(
      'fragmented-template keystroke workload corrupted the text',
      { length: fragFinal.length, tail: fragFinal.slice(-10) },
      { length: fragBase.length + 5, tail: `${fragBase.slice(-5)}yyyyy` },
    )
  }
  if (fragText.peek() !== fragFinal) {
    fail(
      'fragmented-template signal did not mirror the final text',
      fragText.peek().length,
      fragFinal.length,
    )
  }
  fragText.dispose()
  fragDoc.destroy()

  text.dispose()
  tDoc.destroy()
  presence.dispose()
  wDoc.destroy()
  listDoc.destroy()
  sDoc.destroy()
  awRaw.destroy()
  rawDoc.destroy()
  console.log(
    '  correctness gate passed (raw + wrapped writes observable; list + signal + text + frames propagate)',
  )
}

// Optional section filter for A/B iteration on ONE cell without paying the
// whole suite: `bun scripts/bench/core/sync.ts --only=text,frame`. Sections:
// awareness | presence | list | text | frame | store | remote. Default: all.
// Unknown tokens are REFUSED loudly — a typo (`--only=frames`) would otherwise
// silently select NOTHING and exit green, the documented empty-input-set class
// ("a gate must fail loudly when its input set is EMPTY").
const SECTIONS: readonly string[] = ['awareness', 'presence', 'list', 'text', 'frame', 'store', 'remote']
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null
if (only !== null) {
  const unknown = [...only].filter((s) => !SECTIONS.includes(s))
  if (unknown.length > 0 || only.size === 0) {
    console.error(
      `x unknown --only section(s): ${unknown.join(', ') || '(none given)'} — valid: ${SECTIONS.join(', ')}\n` +
        '  An unknown token would silently select NOTHING and exit green — refusing.',
    )
    process.exit(1)
  }
}
const wants = (name: string) => only === null || only.has(name)

console.log('\n@pyreon/sync — CRDT→signal hot-path benchmark (NODE_ENV=production)')
correctnessGate()
// Let the gate's async toBytes-parity check settle before any timing starts —
// a macrotask hop drains ALL pending microtasks (one bare Promise.resolve()
// would not guarantee the `.then` chain inside the gate has run).
await new Promise((resolve) => setTimeout(resolve, 0))
if (wants('awareness')) printSection('Awareness recompute (per cursor move)', benchAwareness())
if (wants('presence')) printWrapperTax(benchPresenceWrapperTax())
if (wants('list')) printSection('syncedList rebuild (per change)', benchSyncedList())
if (wants('text')) printSection('syncedText .set (per-keystroke ns)', benchSyncedTextKeystroke())
if (wants('frame')) printSection('WS inbound frame (per-frame ns)', await benchInboundFrame())
if (wants('store')) {
  const { results, countsLine } = benchStoreDispatch()
  printSection('syncedStore dispatcher (per-write ns)', results)
  console.log(countsLine)
}
if (wants('remote')) {
  printSection('Remote op → signal (signature path, per-write ns)', benchRemoteOp())
}
console.log()
