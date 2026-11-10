/**
 * Differential fuzz — `@pyreon/reactivity` against a from-scratch reference.
 *
 * Grows the earlier fuzzes (`staleness-fuzz.test.ts`, #4231's
 * `check-state-fuzz.test.ts`, the design probe `fuzz.mjs`) with the
 * operations the redesign's stage (i) lists as missing (reactivity-core.md §5):
 * dispose (effects, computeds, mid-flush), observed ↔ unobserved transitions,
 * nested effects and their ownership, effects that write signals (re-entrancy
 * across passes), throwing computeds / effects / cleanups, `onCleanup` order,
 * `untrack`, direct updaters on signals and computeds, `subscribe`,
 * `createSelector`, and dependency lists that grow and shrink.
 *
 * The ORACLE is a reference model, not the implementation: node values are
 * recomputed from the signal values in index order (the graph is a DAG by
 * construction), and every expectation about runs is derived from what each
 * observer read in its previous run and the reference values before and after
 * the operation. Public API only.
 *
 * Determinism: each case is generated as DATA (graph + op list) from its seed,
 * then executed. A failing seed is shrunk by deleting ops while it still
 * fails, and the reduced case is printed.
 *
 * Knobs (env):
 *   REACTIVITY_FUZZ_CASES=<n>   cases to run (default 1500)
 *   REACTIVITY_FUZZ_STEPS=<n>   ops per case (default 30)
 *   REACTIVITY_FUZZ_SEED=<n>    run only this seed (replay a failure)
 *   REACTIVITY_FUZZ_ASSERT_WASTED=1  also assert zero wasted evaluations
 *   REACTIVITY_FUZZ_STRICT=0    count the B1–B3 metrics instead of asserting them
 *
 * WASTED EVALUATIONS are counted, not asserted (stage i): a computed evaluated
 * although it read exactly the same values as its previous evaluation. The
 * design (§2, §4.2) expects today's core to waste evaluations below an
 * unchanged node and the new core to waste none; stage (ii) turns the knob on
 * by default.
 *
 * BUGS this fuzz found on the core are tracked as metrics
 * (`staleAfterEffectWrite`, `extraEffectRuns`, `leakAfterExtraRun`; each is
 * fixed, with regressions in `bug-regressions.test.ts`) and are asserted zero
 * unless REACTIVITY_FUZZ_STRICT=0. Run `vitest --reporter=verbose` to see the metric line.
 */
import {
  batch,
  computed,
  createSelector,
  effect,
  effectScope,
  onCleanup,
  setErrorHandler,
  signal,
  untrack,
} from '../../index'

// ─── deterministic RNG ──────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── case data ──────────────────────────────────────────────────────────────

/** A formula over earlier nodes. Several kinds change their dep list with the values read. */
type Formula =
  | { k: 'sum'; a: number; b: number }
  | { k: 'collapse'; a: number } // frequent equal values
  | { k: 'gate'; a: number; t: number }
  | { k: 'branch'; c: number; a: number; b: number } // dep shape flips
  | { k: 'ignore'; a: number; b: number; t: number } // reads a, ignores its value
  | { k: 'hop'; a: number }
  | { k: 'grow'; a: number; list: number[] } // dep list grows and shrinks with a
  | { k: 'mod'; a: number; b: number }

function evalFormula(f: Formula, r: (j: number) => number): number {
  switch (f.k) {
    case 'sum':
      return r(f.a) + r(f.b)
    case 'collapse':
      return Math.floor(r(f.a) / 3)
    case 'gate':
      return r(f.a) > f.t ? 1 : 0
    case 'branch':
      return r(f.c) % 2 === 0 ? r(f.a) : r(f.b)
    case 'ignore':
      return Math.min(r(f.a), 0) + (r(f.b) > f.t ? 1 : 0)
    case 'hop':
      return r(f.a) + 1
    case 'grow': {
      const n = Math.abs(r(f.a)) % (f.list.length + 1)
      let s = 0
      for (let i = 0; i < n; i++) s += r(f.list[i]!)
      return s
    }
    case 'mod':
      return (((r(f.a) + 2 * r(f.b)) % 3) + 3) % 3
  }
}

function formulaRefs(f: Formula): number[] {
  switch (f.k) {
    case 'sum':
    case 'ignore':
    case 'mod':
      return [f.a, f.b]
    case 'collapse':
    case 'gate':
    case 'hop':
      return [f.a]
    case 'branch':
      return [f.c, f.a, f.b]
    case 'grow':
      return [f.a, ...f.list]
  }
}

/**
 * Graph nodes, in topological (index) order.
 *  - `signal`: a base signal, written by ops.
 *  - `computed`: optional `{ equals }`; a `thrower` throws when its value is
 *    `≡ throwOn (mod 7)` and is a SINK (nothing reads it but observers), so its
 *    kept value is fully determined by when the oracle reads it.
 *  - `out`: a signal written by an EFFECT — `writer` sets it to `f` in one run,
 *    `chaser` steps it by ±1 per run toward `f mod 6` (a self-refire across
 *    effect passes). Its reference value is `f` (chaser: `f mod 6`).
 */
type NodeSpec =
  | { t: 'signal'; init: number }
  | { t: 'computed'; f: Formula; equals: boolean; throwOn: number | null }
  | { t: 'out'; f: Formula; mode: 'writer' | 'chaser' }

/** Observers, created by `create` ops. */
type ObserverSpec =
  | {
      o: 'effect'
      f: Formula
      untracked: number | null
      throwOn: number | null
      cleanups: number
      ret: boolean
      cleanupThrows: boolean
    }
  | { o: 'directSignal'; sig: number }
  | { o: 'listener'; sig: number }
  | { o: 'directComputed'; node: number }
  | { o: 'selectorRow'; sel: number; key: number }
  | { o: 'selectorSub'; sel: number; key: number }
  | { o: 'outer'; a: number; b: number; untracked: boolean }
  | { o: 'killer'; a: number; target: { observer: number } | { computed: number } }

type Op =
  | {
      op: 'write'
      writes: Array<[number, number]>
      batched: boolean
      pulls: Array<[number, number]>
      check: boolean
    }
  | { op: 'create'; id: number; spec: ObserverSpec }
  | { op: 'dispose'; id: number }
  /** `pull: false` disposes without reading first, possibly while stale (C14). */
  | { op: 'disposeComputed'; node: number; pull: boolean }

interface Case {
  seed: number
  nodes: NodeSpec[]
  selectors: number[] // source node per selector
  ops: Op[]
}

// ─── generation ─────────────────────────────────────────────────────────────

function genFormula(rand: () => number, pool: number[]): Formula {
  const pick = () => pool[Math.floor(rand() * pool.length)]!
  const t = Math.floor(rand() * 5)
  switch (Math.floor(rand() * 8)) {
    case 0:
      return { k: 'sum', a: pick(), b: pick() }
    case 1:
      return { k: 'collapse', a: pick() }
    case 2:
      return { k: 'gate', a: pick(), t }
    case 3:
      return { k: 'branch', c: pick(), a: pick(), b: pick() }
    case 4:
      return { k: 'ignore', a: pick(), b: pick(), t }
    case 5:
      return { k: 'hop', a: pick() }
    case 6:
      return {
        k: 'grow',
        a: pick(),
        list: [pick(), pick(), pick()].slice(0, 1 + Math.floor(rand() * 3)),
      }
    default:
      return { k: 'mod', a: pick(), b: pick() }
  }
}

function generateCase(seed: number, steps: number): Case {
  const rand = rng(seed)
  const S = 2 + Math.floor(rand() * 4)
  const C = 4 + Math.floor(rand() * 11)
  const nodes: NodeSpec[] = []
  const tainted: boolean[] = []
  const readable: number[] = [] // nodes later nodes may read (not throwers)
  const clean: number[] = [] // readable and untainted
  for (let i = 0; i < S; i++) {
    nodes.push({ t: 'signal', init: Math.floor(rand() * 6) })
    tainted.push(false)
    readable.push(i)
    clean.push(i)
  }
  for (let i = S; i < S + C; i++) {
    const roll = rand()
    if (roll < 0.12 && clean.length > 0) {
      nodes.push({ t: 'out', f: genFormula(rand, clean), mode: rand() < 0.4 ? 'chaser' : 'writer' })
      tainted.push(true)
      readable.push(i)
      continue
    }
    const thrower = roll < 0.22 && clean.length > 0
    const f = genFormula(rand, thrower ? clean : readable)
    nodes.push({
      t: 'computed',
      f,
      equals: !thrower && rand() < 0.25,
      throwOn: thrower ? Math.floor(rand() * 7) : null,
    })
    const isTainted = formulaRefs(f).some((j) => tainted[j])
    tainted.push(isTainted)
    if (!thrower) {
      readable.push(i)
      if (!isTainted) clean.push(i)
    }
  }
  const all = nodes.map((_, i) => i)
  const computeds = all.filter((i) => nodes[i]!.t === 'computed')
  const selectors: number[] = []
  const nSel = Math.floor(rand() * 3)
  for (let i = 0; i < nSel; i++) selectors.push(clean[Math.floor(rand() * clean.length)]!)

  const ops: Op[] = []
  let nextId = 0
  const live: number[] = []
  const pickFrom = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!
  const genObserver = (): ObserverSpec => {
    const r = rand()
    if (r < 0.4)
      return {
        o: 'effect',
        f: genFormula(rand, all),
        untracked: rand() < 0.3 ? pickFrom(all) : null,
        throwOn: rand() < 0.15 ? Math.floor(rand() * 5) : null,
        cleanups: Math.floor(rand() * 3),
        ret: rand() < 0.5,
        cleanupThrows: rand() < 0.15,
      }
    if (r < 0.5) return { o: 'directSignal', sig: Math.floor(rand() * S) }
    if (r < 0.58) return { o: 'listener', sig: Math.floor(rand() * S) }
    if (r < 0.68 && computeds.length > 0) return { o: 'directComputed', node: pickFrom(computeds) }
    if (r < 0.8 && selectors.length > 0)
      return {
        o: rand() < 0.6 ? 'selectorRow' : 'selectorSub',
        sel: Math.floor(rand() * selectors.length),
        key: Math.floor(rand() * 5),
      }
    if (r < 0.9)
      return { o: 'outer', a: pickFrom(clean), b: pickFrom(clean), untracked: rand() < 0.25 }
    if (live.length > 0 && rand() < 0.6)
      return { o: 'killer', a: pickFrom(clean), target: { observer: pickFrom(live) } }
    const cleanComputeds = computeds.filter((i) => clean.includes(i))
    if (cleanComputeds.length > 0)
      return { o: 'killer', a: pickFrom(clean), target: { computed: pickFrom(cleanComputeds) } }
    return { o: 'directSignal', sig: 0 }
  }
  const create = () => {
    const id = nextId++
    ops.push({ op: 'create', id, spec: genObserver() })
    live.push(id)
  }
  const initial = 2 + Math.floor(rand() * 4)
  for (let i = 0; i < initial; i++) create()
  for (let step = 0; step < steps; step++) {
    const r = rand()
    if (r < 0.62) {
      const batched = rand() < 0.5
      const count = batched ? 1 + Math.floor(rand() * Math.min(3, S)) : 1
      const sigs = Array.from({ length: S }, (_, i) => i)
        .sort(() => rand() - 0.5)
        .slice(0, count)
      // Batched steps may write the same signal twice (and back); 10% same-value writes.
      if (batched && rand() < 0.25) sigs.push(sigs[0]!)
      const writes = sigs.map(
        (j) => [j, rand() < 0.1 ? -1 : Math.floor(rand() * 6)] as [number, number],
      )
      const pulls: Array<[number, number]> = []
      if (batched)
        for (let w = 0; w < writes.length; w++) if (rand() < 0.35) pulls.push([w, pickFrom(all)])
      ops.push({ op: 'write', writes, batched, pulls, check: rand() < 0.5 })
    } else if (r < 0.77) create()
    else if (r < 0.9 && live.length > 0) {
      const id = live.splice(Math.floor(rand() * live.length), 1)[0]!
      ops.push({ op: 'dispose', id })
    } else if (computeds.length > 0)
      ops.push({ op: 'disposeComputed', node: pickFrom(computeds), pull: rand() < 0.5 })
  }
  return { seed, nodes, selectors, ops }
}

// ─── execution + oracle ─────────────────────────────────────────────────────

class FuzzError extends Error {}

interface Stats {
  evaluations: number
  wasted: number
  checks: number
  /**
   * Effects left on a stale value after an effect wrote a signal in the same
   * flush (B1, `bug-regressions.test.ts`). Counted, and
   * asserted zero unless REACTIVITY_FUZZ_STRICT=0.
   */
  staleAfterEffectWrite: number
  /**
   * Effect runs beyond the one a change calls for (the "first read of a stale
   * computed re-queues the reader" bug, B2).
   * Asserted zero unless REACTIVITY_FUZZ_STRICT=0.
   */
  extraEffectRuns: number
  /**
   * Subscriptions left after `scope.stop()` in a case that had an extra run:
   * a nested duplicate first run of an effect overwrites its inner-effect list
   * and the first inner effect is never disposed (B3).
   */
  leakAfterExtraRun: number
}

interface EffectRec {
  id: number
  kind: string
  alive: boolean
  tainted: boolean
  runs: number
  /** Tracked reads of the last run: [node, value]. */
  reads: Array<[number, number]>
  untrackedSeen: [number, number] | null
  /** Cleanup log as it actually ran / as the oracle expects it. */
  log: string[]
  expectLog: string[]
  /** Labels the last completed (non-throwing) run registered, in order. */
  pending: string[]
  /** Set when a killer or an outer re-run disposed it inside a flush. */
  disposedInFlush: boolean
  dispose: () => void
  // kind-specific
  fires?: number
  seen?: number | boolean
  inner?: EffectRec | null
  innerDisposed?: number
  orphanInners?: number
}

/** Execute one case. Returns the violations (empty = pass). */
function runCase(c: Case, stats: Stats, stopAtFirst = false): string[] {
  const violations: string[] = []
  const fail = (msg: string) => {
    violations.push(msg)
  }
  const thrown: unknown[] = []
  const reported: unknown[] = []
  setErrorHandler((err) => {
    reported.push(err)
  })

  const N = c.nodes.length
  const getters: Array<() => number> = []
  const setters: Array<((v: number) => void) | null> = []
  const disposers: Array<(() => void) | null> = []
  const frozen = new Map<number, number>()
  const lastReads: Array<Array<[number, number]> | null> = Array.from({ length: N }, () => null)
  const evals: number[] = Array.from({ length: N }, () => 0)
  /** The value of each computed's last SUCCESSFUL evaluation (what it keeps). */
  const lastEval: Array<number | undefined> = Array.from({ length: N }, () => undefined)
  /** Every node each computed read during the current op (incl. mid-batch states). */
  const opDeps: Array<Set<number>> = Array.from({ length: N }, () => new Set<number>())
  const lastGood: Array<number | undefined> = Array.from({ length: N }, () => undefined)
  const scope = effectScope()
  const recs = new Map<number, EffectRec>()
  const writerRecs: Array<{ node: number; runs: number; reads: Array<[number, number]> }> = []
  const sigVals: number[] = []
  const selectorFns: Array<ReturnType<typeof createSelector<number>>> = []
  const tainted: boolean[] = []
  let stepNo = -1
  let orphanCreated = false
  const killedComputeds = new Map<number, number>()
  let extraInCase = false

  const get = (j: number): number => getters[j]!()

  // Reference: values of every node given base-signal values and, for `out`
  // nodes, either their formula (settled) or a fixed value (mid-batch).
  const reference = (sv: number[], outs: Map<number, number> | null): number[] => {
    const v: number[] = []
    for (let i = 0; i < N; i++) {
      const n = c.nodes[i]!
      if (n.t === 'signal') v.push(sv[i]!)
      else if (frozen.has(i)) v.push(frozen.get(i)!)
      else if (n.t === 'out') {
        if (outs) v.push(outs.get(i)!)
        else {
          const raw = evalFormula(n.f, (j) => v[j]!)
          v.push(n.mode === 'chaser' ? ((raw % 6) + 6) % 6 : raw)
        }
      } else {
        const raw = evalFormula(n.f, (j) => v[j]!)
        v.push(
          n.throwOn !== null && ((raw % 7) + 7) % 7 === n.throwOn ? (lastGood[i] as number) : raw,
        )
      }
    }
    return v
  }
  const throws = (i: number, v: number[]): boolean => {
    const n = c.nodes[i]!
    if (n.t !== 'computed' || n.throwOn === null || frozen.has(i)) return false
    const raw = evalFormula(n.f, (j) => v[j]!)
    return ((raw % 7) + 7) % 7 === n.throwOn
  }
  /** Record that throwers were evaluated at state `sv` (the oracle reads them). */
  const commitThrowers = (v: number[], only?: number) => {
    for (let i = 0; i < N; i++) {
      const n = c.nodes[i]!
      if (only !== undefined && i !== only) continue
      if (n.t !== 'computed' || n.throwOn === null || frozen.has(i)) continue
      if (!throws(i, v)) lastGood[i] = v[i]
    }
  }

  // ─── build the graph (inside the case scope) ───
  scope.runInScope(() => {
    for (let i = 0; i < N; i++) {
      const n = c.nodes[i]!
      tainted.push(
        n.t === 'out' || (n.t === 'computed' && formulaRefs(n.f).some((j) => tainted[j])),
      )
      if (n.t === 'signal') {
        const s = signal(n.init)
        sigVals.push(n.init)
        getters.push(s)
        setters.push((v) => s.set(v))
        disposers.push(null)
        continue
      }
      if (n.t === 'out') {
        const s = signal(0)
        getters.push(s)
        setters.push(null)
        disposers.push(null)
        const rec = { node: i, runs: 0, reads: [] as Array<[number, number]> }
        writerRecs.push(rec)
        const f = n.f
        if (n.mode === 'writer') {
          effect(() => {
            rec.runs++
            const reads: Array<[number, number]> = []
            const v = evalFormula(f, (j) => {
              const x = get(j)
              reads.push([j, x])
              return x
            })
            rec.reads = reads
            s.set(v)
          })
        } else {
          effect(() => {
            rec.runs++
            const reads: Array<[number, number]> = []
            const raw = evalFormula(f, (j) => {
              const x = get(j)
              reads.push([j, x])
              return x
            })
            rec.reads = reads
            const target = ((raw % 6) + 6) % 6
            const y = s()
            if (y < target) s.set(y + 1)
            else if (y > target) s.set(y - 1)
          })
        }
        continue
      }
      const f = n.f
      const throwOn = n.throwOn
      const fn = () => {
        evals[i]!++
        stats.evaluations++
        const reads: Array<[number, number]> = []
        const raw = evalFormula(f, (j) => {
          const x = get(j)
          reads.push([j, x])
          return x
        })
        const prev = lastReads[i]
        if (
          prev &&
          prev.length === reads.length &&
          prev.every(([j, x], k) => reads[k]![0] === j && reads[k]![1] === x)
        )
          stats.wasted++
        lastReads[i] = reads
        for (const [j] of reads) opDeps[i]!.add(j)
        if (throwOn !== null && ((raw % 7) + 7) % 7 === throwOn) {
          // A throwing evaluation keeps the unconfirmed tail of its previous
          // deps (as effects do), so it may still pull them on a later check.
          if (prev && prev.length > reads.length && reads.every(([j], k) => prev[k]![0] === j))
            lastReads[i] = [...reads, ...prev.slice(reads.length)]
          const e = new FuzzError(`computed ${i}`)
          thrown.push(e)
          throw e
        }
        lastEval[i] = raw
        return raw
      }
      const comp = n.equals ? computed(fn, { equals: (a, b) => a === b }) : computed(fn)
      getters.push(comp)
      setters.push(null)
      disposers.push(() => comp.dispose())
    }
    for (const src of c.selectors) selectorFns.push(createSelector(() => get(src)))
  })

  // Settled reference for the current signal values.
  let ref = reference(sigVals, null)
  // Throwers are evaluated by the oracle after every op (see `check`), which
  // makes their kept value deterministic; do it once for the initial state.
  for (let i = 0; i < N; i++)
    if (c.nodes[i]!.t === 'computed' && (c.nodes[i] as { throwOn: number | null }).throwOn !== null)
      untrack(() => get(i))
  commitThrowers(ref)
  ref = reference(sigVals, null)

  const isTaintedReads = (reads: Array<[number, number]>) => reads.some(([j]) => tainted[j])

  // ─── observers ───
  const disposeRec = (rec: EffectRec, inFlush: boolean) => {
    if (!rec.alive) return
    rec.alive = false
    if (inFlush) rec.disposedInFlush = true
    rec.expectLog.push(...rec.pending)
    rec.pending = []
    if (rec.inner && rec.inner.kind === 'inner') disposeRec(rec.inner, inFlush)
    else rec.inner = null // an untracked inner is not owned by its outer (C12)
    rec.dispose()
  }

  const makeEffectRec = (id: number, kind: string, isTainted: boolean): EffectRec => ({
    id,
    kind,
    alive: true,
    tainted: isTainted,
    runs: 0,
    reads: [],
    untrackedSeen: null,
    log: [],
    expectLog: [],
    pending: [],
    disposedInFlush: false,
    dispose: () => {},
  })

  /** The body shared by plain effects and inner effects. */
  const effectBody = (rec: EffectRec, spec: Extract<ObserverSpec, { o: 'effect' }>) => () => {
    // A re-run first runs the previous run's cleanups (C11), which the oracle
    // queued in `pending`.
    rec.expectLog.push(...rec.pending)
    rec.pending = []
    rec.runs++
    const run = rec.runs
    const prevReads = rec.reads
    const reads: Array<[number, number]> = []
    const v = evalFormula(spec.f, (j) => {
      const x = get(j)
      reads.push([j, x])
      return x
    })
    rec.reads = reads
    rec.untrackedSeen =
      spec.untracked === null ? null : [spec.untracked, untrack(() => get(spec.untracked!))]
    if (spec.throwOn !== null && ((v % 5) + 5) % 5 === spec.throwOn) {
      // A run that throws keeps the unconfirmed tail of its previous deps when
      // it read a positional prefix of them (design §1.5: "a throwing run
      // keeps its tail"); a run that diverged has already dropped it.
      const prev = prevReads
      if (prev.length > reads.length && reads.every(([j], k) => prev[k]![0] === j))
        // Tail values are filled in from the reference once the op settles
        // (NaN = "subscribed, baseline unknown yet").
        rec.reads = [
          ...reads,
          ...prev.slice(reads.length).map(([j]) => [j, Number.NaN] as [number, number]),
        ]
      // Thrown BEFORE any onCleanup: cleanups registered earlier in a throwing
      // run are dropped today (reported in the PR), so the fuzz does not rely
      // on either behaviour.
      const e = new FuzzError(`effect ${rec.id} run ${run}`)
      thrown.push(e)
      throw e
    }
    const labels: string[] = []
    for (let k = 0; k < spec.cleanups; k++) {
      const label = `${run}:c${k}`
      labels.push(label)
      onCleanup(() => {
        rec.log.push(label)
        if (spec.cleanupThrows && k === 0 && run % 2 === 0) {
          const e = new FuzzError(`cleanup ${rec.id} ${label}`)
          thrown.push(e)
          throw e
        }
      })
    }
    if (spec.ret) labels.push(`${run}:ret`)
    rec.pending = labels
    if (spec.ret) return () => void rec.log.push(`${run}:ret`)
    return undefined
  }

  const createObserver = (id: number, spec: ObserverSpec) => {
    switch (spec.o) {
      case 'effect': {
        const refs = [...formulaRefs(spec.f), ...(spec.untracked === null ? [] : [spec.untracked])]
        const rec = makeEffectRec(
          id,
          'effect',
          refs.some((j) => tainted[j]),
        )
        recs.set(id, rec)
        const e = effect(effectBody(rec, spec))
        rec.dispose = () => e.dispose()
        return
      }
      case 'directSignal':
      case 'listener': {
        const rec = makeEffectRec(id, spec.o, false)
        rec.fires = 0
        recs.set(id, rec)
        const s = getters[spec.sig] as ReturnType<typeof signal<number>>
        const fn = () => {
          rec.fires!++
          rec.seen = s.peek()
        }
        rec.dispose = spec.o === 'directSignal' ? s.direct(fn) : s.subscribe(fn)
        return
      }
      case 'directComputed': {
        const rec = makeEffectRec(id, 'directComputed', tainted[spec.node]!)
        rec.fires = 0
        recs.set(id, rec)
        const comp = getters[spec.node] as ReturnType<typeof computed<number>>
        rec.dispose = comp.direct(() => {
          rec.fires!++
          rec.seen = comp._v
        })
        // establish the edge (a direct updater alone does not evaluate)
        rec.seen = comp._v
        return
      }
      case 'selectorRow': {
        const rec = makeEffectRec(id, 'selectorRow', false)
        recs.set(id, rec)
        const sel = selectorFns[spec.sel]!
        const e = effect(() => {
          rec.runs++
          rec.seen = sel(spec.key)
        })
        rec.dispose = () => e.dispose()
        return
      }
      case 'selectorSub': {
        const rec = makeEffectRec(id, 'selectorSub', false)
        rec.fires = 0
        recs.set(id, rec)
        rec.dispose = selectorFns[spec.sel]!.subscribe(spec.key, (m) => {
          rec.fires!++
          rec.seen = m
        })
        return
      }
      case 'outer': {
        const rec = makeEffectRec(id, 'outer', false)
        rec.inner = null
        rec.innerDisposed = 0
        rec.orphanInners = 0
        recs.set(id, rec)
        let first = true
        const e = effect(() => {
          rec.runs++
          rec.reads = [[spec.a, get(spec.a)]]
          // The previous tracked inner was disposed by this re-run (C12).
          if (rec.inner && !spec.untracked) {
            const old = rec.inner
            if (old.alive) {
              old.alive = false
              old.disposedInFlush = true
              old.expectLog.push(...old.pending)
              old.pending = []
            }
          }
          const inner = makeEffectRec(-1, spec.untracked ? 'untrackedInner' : 'inner', false)
          const innerSpec: Extract<ObserverSpec, { o: 'effect' }> = {
            o: 'effect',
            f: { k: 'hop', a: spec.b },
            untracked: null,
            throwOn: null,
            cleanups: 1,
            ret: false,
            cleanupThrows: false,
          }
          const body = effectBody(inner, innerSpec)
          const make = () => effect(body)
          const handle = spec.untracked ? untrack(make) : make()
          inner.dispose = () => handle.dispose()
          if (spec.untracked && !first) {
            // Created during a re-run under untrack(): today it is registered
            // with whatever scope is current at re-run time (none) — see the
            // PR. The fuzz tracks it but does not expect the case scope to
            // dispose it.
            rec.orphanInners!++
            orphanCreated = true
          }
          rec.inner = inner
          first = false
        })
        rec.dispose = () => e.dispose()
        return
      }
      case 'killer': {
        const rec = makeEffectRec(id, 'killer', false)
        recs.set(id, rec)
        let first = true
        const target = spec.target
        const e = effect(() => {
          rec.runs++
          rec.reads = [[spec.a, get(spec.a)]]
          if (first) {
            first = false
            return
          }
          if ('observer' in target) {
            const t = recs.get(target.observer)
            if (t) disposeRec(t, true)
          } else if (!frozen.has(target.computed) && !killedComputeds.has(target.computed)) {
            // Pull, then dispose: the computed keeps the pulled value (C14).
            // Verified against the post-op reference once the op settles.
            killedComputeds.set(
              target.computed,
              untrack(() => get(target.computed)),
            )
            disposers[target.computed]!()
          }
        })
        rec.dispose = () => e.dispose()
        return
      }
    }
  }

  // ─── checks ───
  const where = () => `seed ${c.seed} op ${stepNo}`

  /** Freeze computeds a killer pulled-then-disposed during the op (C14). */
  const settleKills = () => {
    if (killedComputeds.size === 0) return
    for (const [node, v] of killedComputeds) {
      if (v !== ref[node])
        fail(`${where()}: killer pulled computed ${node} = ${v}, want ${ref[node]}`)
      frozen.set(node, v)
    }
    killedComputeds.clear()
    ref = reference(sigVals, null)
  }

  /** Settled-state checks after any op. */
  const checkSettled = (fullCheck: boolean, writeOp = false) => {
    stats.checks++
    const fill = (r: EffectRec) => {
      if (r.reads.some(([, v]) => Number.isNaN(v)))
        r.reads = r.reads.map(([j, v]) => [j, Number.isNaN(v) ? ref[j]! : v])
    }
    for (const r of recs.values()) {
      fill(r)
      if (r.inner) fill(r.inner)
    }
    // Throwers: the oracle reads them every op (deterministic kept value).
    for (let i = 0; i < N; i++) {
      const n = c.nodes[i]!
      if (n.t === 'computed' && n.throwOn !== null && !frozen.has(i)) {
        const got = untrack(() => get(i))
        if (got !== ref[i]) fail(`${where()}: thrower ${i} = ${got}, want ${ref[i]}`)
      }
    }
    commitThrowers(ref)
    if (fullCheck)
      for (let i = 0; i < N; i++) {
        if (c.nodes[i]!.t === 'signal') continue
        const got = untrack(() => get(i))
        if (got !== ref[i]) fail(`${where()}: node ${i} = ${got}, want ${ref[i]}`)
      }
    for (const w of writerRecs)
      for (const [j, v] of w.reads)
        if (v !== ref[j])
          fail(`${where()}: writer for ${w.node} saw node ${j} = ${v}, want ${ref[j]}`)
    const checkEffect = (rec: EffectRec, label: string) => {
      if (!rec.alive) return
      const stale = rec.reads.filter(([j, v]) => v !== ref[j])
      if (stale.length === 0) return
      if (!STRICT && (rec.tainted || isTaintedReads(rec.reads))) {
        // Count each stale episode once (it persists until the next change).
        if (writeOp) stats.staleAfterEffectWrite++
        return
      }
      const [j, v] = stale[0]!
      fail(`${where()}: ${label} saw node ${j} = ${v}, want ${ref[j]} (not settled)`)
    }
    for (const rec of recs.values()) {
      if (!rec.alive) continue
      if (rec.kind === 'effect' || rec.kind === 'killer') checkEffect(rec, `${rec.kind} ${rec.id}`)
      if (rec.kind === 'outer') {
        checkEffect(rec, `outer ${rec.id}`)
        if (rec.inner) checkEffect(rec.inner, `inner of ${rec.id}`)
      }
    }
    // Cleanup logs: what ran equals what the oracle expected, in order (C11).
    const checkLog = (rec: EffectRec, label: string) => {
      if (rec.log.length !== rec.expectLog.length || rec.log.some((x, k) => x !== rec.expectLog[k]))
        fail(
          `${where()}: ${label} cleanups ran ${JSON.stringify(rec.log)}, want ${JSON.stringify(rec.expectLog)}`,
        )
    }
    for (const rec of recs.values()) {
      checkLog(rec, `${rec.kind} ${rec.id}`)
      if (rec.inner) checkLog(rec.inner, `inner of ${rec.id}`)
    }
    // Errors: every throw reported exactly once, nothing else reported (C10).
    if (reported.length !== thrown.length || reported.some((e) => !thrown.includes(e)))
      fail(
        `${where()}: reported ${reported.length} errors (${reported.map((e) => (e instanceof Error ? e.message : String(e))).join('; ')}), thrown ${thrown.length}`,
      )
    reported.length = 0
    thrown.length = 0
  }

  /**
   * `ran` must lie in [min, max]. A run count ABOVE max that still includes the
   * required run is the known extra-run bug: counted unless STRICT.
   */
  const expectRuns = (ran: number, min: number, max: number, label: string) => {
    if (ran < min) fail(`${where()}: ${label} ran ${ran}×, want ${min}`)
    else if (ran > max) {
      if (!STRICT && ran >= 2 && ran > min) {
        stats.extraEffectRuns += ran - max
        extraInCase = true
      } else fail(`${where()}: ${label} ran ${ran}×, want ${min === max ? min : `${min}..${max}`}`)
    }
  }

  const selectorKey = (rec: EffectRec): { sel: number; key: number } | null => {
    for (const op of c.ops)
      if (
        op.op === 'create' &&
        op.id === rec.id &&
        (op.spec.o === 'selectorRow' || op.spec.o === 'selectorSub')
      )
        return { sel: op.spec.sel, key: op.spec.key }
    return null
  }

  // ─── run ops ───
  for (stepNo = 0; stepNo < c.ops.length; stepNo++) {
    if (stopAtFirst && violations.length > 0) break
    const op = c.ops[stepNo]!
    const pre = ref
    try {
      if (op.op === 'create') {
        scope.runInScope(() => createObserver(op.id, op.spec))
        // A killer can run twice at creation (the extra-run bug) and act then.
        settleKills()
        const rec = recs.get(op.id)!
        if (
          op.spec.o === 'effect' ||
          op.spec.o === 'outer' ||
          op.spec.o === 'killer' ||
          op.spec.o === 'selectorRow'
        )
          expectRuns(rec.runs, 1, 1, `new ${op.spec.o} ${op.id} at creation (C1)`)
        if (op.spec.o === 'selectorSub' && rec.fires !== 1)
          fail(`${where()}: selector.subscribe updater called ${rec.fires}× inline, want 1`)
        if (op.spec.o === 'selectorRow' || op.spec.o === 'selectorSub') {
          const want = ref[c.selectors[op.spec.sel]!] === op.spec.key
          if (rec.seen !== want)
            fail(`${where()}: selector ${op.spec.o} ${op.id} saw ${rec.seen}, want ${want}`)
        }
        if (op.spec.o === 'directComputed' && rec.seen !== ref[op.spec.node])
          fail(`${where()}: directComputed ${op.id} _v = ${rec.seen}, want ${ref[op.spec.node]}`)
        checkSettled(false)
        continue
      }
      if (op.op === 'dispose') {
        const rec = recs.get(op.id)
        if (rec) disposeRec(rec, false)
        checkSettled(false)
        continue
      }
      if (op.op === 'disposeComputed') {
        if (!frozen.has(op.node) && !op.pull && lastEval[op.node] !== undefined) {
          // Disposed without a read, maybe while stale: it keeps the value of
          // its last evaluation and never re-links (C14); everything below it
          // now reads that value.
          frozen.set(op.node, lastEval[op.node]!)
          disposers[op.node]!()
          ref = reference(sigVals, null)
        } else if (!frozen.has(op.node)) {
          const v = untrack(() => get(op.node))
          if (v !== ref[op.node])
            fail(`${where()}: computed ${op.node} before dispose = ${v}, want ${ref[op.node]}`)
          frozen.set(op.node, v)
          disposers[op.node]!()
          ref = reference(sigVals, null)
          if (ref.some((x, i) => x !== pre[i]))
            fail(`${where()}: disposing a fresh computed changed the reference (oracle bug)`)
        }
        // After dispose: reads return the frozen value, writes never re-run it.
        checkSettled(true)
        continue
      }

      // ─── write op ───
      for (const d of opDeps) d.clear()
      const evalsBefore = evals.slice()
      const frozenBefore = new Set(frozen.keys())
      const readsBefore = lastReads.map((r) => (r ? r.slice() : null))
      const before = new Map<
        number,
        {
          runs: number
          fires: number
          reads: Array<[number, number]>
          seen: unknown
          alive: boolean
          inner: EffectRec | null
        }
      >()
      for (const rec of recs.values())
        before.set(rec.id, {
          runs: rec.runs,
          fires: rec.fires ?? 0,
          reads: rec.reads.slice(),
          seen: rec.seen,
          alive: rec.alive,
          inner: rec.inner ?? null,
        })
      const innerBefore = new Map<EffectRec, { runs: number; reads: Array<[number, number]> }>()
      for (const rec of recs.values())
        if (rec.inner)
          innerBefore.set(rec.inner, { runs: rec.inner.runs, reads: rec.inner.reads.slice() })
      const writerBefore = writerRecs.map((w) => ({ runs: w.runs, reads: w.reads.slice() }))
      for (const rec of recs.values()) {
        rec.disposedInFlush = false
        if (rec.inner) rec.inner.disposedInFlush = false
      }

      // Which base signals are written with a CHANGE at some point (a direct
      // subscriber of such a signal may run although it ends unchanged).
      const touched = new Set<number>()
      const sv = sigVals.slice()
      const outsNow = new Map<number, number>()
      for (let i = 0; i < N; i++) if (c.nodes[i]!.t === 'out') outsNow.set(i, pre[i]!)
      const writes = op.writes.map(([j, v]) => [j, v === -1 ? sv[j]! : v] as [number, number])
      const pulled = op.pulls.length > 0

      const doWrite = (w: number) => {
        const [j, v] = writes[w]!
        if (v !== sv[j]) touched.add(j)
        sv[j] = v
        setters[j]!(v)
      }
      if (!op.batched) doWrite(0)
      else
        batch(() => {
          for (let w = 0; w < writes.length; w++) {
            doWrite(w)
            for (const [after, node] of op.pulls) {
              if (after !== w) continue
              // Mid-batch pull: effects have not run, so `out` nodes still
              // hold their pre-op values.
              const mid = reference(sv, outsNow)
              const got = untrack(() => get(node))
              if (got !== mid[node])
                fail(
                  `${where()}: mid-batch pull of node ${node} after write ${w} = ${got}, want ${mid[node]} (stale)`,
                )
              commitThrowers(mid, node)
            }
          }
        })
      for (let j = 0; j < sv.length; j++) sigVals[j] = sv[j]!
      ref = reference(sigVals, null)
      settleKills()
      const post = ref
      const changed = (reads: Array<[number, number]>) => reads.some(([j, v]) => post[j] !== v)
      const viaTouched = (reads: Array<[number, number]>) => reads.some(([j]) => touched.has(j))

      // C5 laziness: a computed with no observer below it, no `{ equals }`
      // node below it (C6: eager today) and no pull, evaluates zero times.
      {
        const may = new Set<number>()
        const addUp = (j: number) => {
          if (may.has(j)) return
          may.add(j)
          for (const r of [readsBefore[j], lastReads[j]]) if (r) for (const [k] of r) addUp(k)
          for (const k of opDeps[j]!) addUp(k)
          const n = c.nodes[j]!
          // An `out` node, or a computed downstream of one, passes through
          // intermediate values across effect passes, so any branch of it may
          // be read on the way: take its static refs.
          if (n.t !== 'signal' && tainted[j]) for (const k of formulaRefs(n.f)) addUp(k)
        }
        for (const rec of recs.values()) {
          const b = before.get(rec.id)
          if (b) for (const [j] of b.reads) addUp(j)
          for (const [j] of rec.reads) addUp(j)
          if (rec.untrackedSeen) addUp(rec.untrackedSeen[0])
          if (rec.inner) for (const [j] of rec.inner.reads) addUp(j)
        }
        for (const [, ib] of innerBefore) for (const [j] of ib.reads) addUp(j)
        for (const op2 of c.ops.slice(0, stepNo + 1))
          if (op2.op === 'create') {
            const s = op2.spec
            if (s.o === 'directComputed') addUp(s.node)
            // An effect reading an `out` node sees intermediate values across
            // passes, so any of its branches may be read: take static refs.
            if (s.o === 'effect' && formulaRefs(s.f).some((j) => tainted[j]))
              for (const k of formulaRefs(s.f)) addUp(k)
            if (s.o === 'killer' && 'computed' in s.target) addUp(s.target.computed)
          }
        for (const op2 of c.ops.slice(0, stepNo + 1))
          if (op2.op === 'create' && (op2.spec.o === 'outer' || op2.spec.o === 'killer')) {
            addUp(op2.spec.a)
            if (op2.spec.o === 'outer') addUp(op2.spec.b)
          }
        for (const src of c.selectors) addUp(src)
        for (let i = 0; i < N; i++) {
          const n = c.nodes[i]!
          if (n.t === 'out') addUp(i)
          if (n.t === 'computed' && (n.equals || n.throwOn !== null)) addUp(i)
        }
        for (const [, node] of op.pulls) addUp(node)
        for (let i = 0; i < N; i++)
          if (c.nodes[i]!.t === 'computed' && !may.has(i) && evals[i] !== evalsBefore[i])
            fail(
              `${where()}: unobserved computed ${i} evaluated ${evals[i]! - evalsBefore[i]!}× (C5 laziness)`,
            )
      }

      // Writers: exactly once iff a value they read changed. Chasers step to
      // their target one pass at a time (C9: re-runs in later passes).
      writerRecs.forEach((w, k) => {
        const b = writerBefore[k]!
        const ran = w.runs - b.runs
        const n = c.nodes[w.node] as Extract<NodeSpec, { t: 'out' }>
        const ch = changed(b.reads.filter(([j]) => j !== w.node))
        if (n.mode === 'writer') {
          expectRuns(
            ran,
            ch ? 1 : 0,
            ch ? 1 : viaTouched(b.reads) || pulled ? 1 : 0,
            `writer for ${w.node}`,
          )
        } else {
          const want = ch ? 1 + Math.abs(post[w.node]! - pre[w.node]!) : 0
          expectRuns(
            ran,
            want,
            ch ? want : viaTouched(b.reads) || pulled ? 1 : 0,
            `chaser for ${w.node} (1 + one pass per step)`,
          )
        }
      })

      for (const rec of recs.values()) {
        const b = before.get(rec.id)
        if (!b || !b.alive) {
          const ran = rec.runs - (b?.runs ?? 0)
          if (b && ran > 0) fail(`${where()}: disposed ${rec.kind} ${rec.id} ran ${ran}× (C15)`)
          if (b && (rec.fires ?? 0) !== b.fires)
            fail(`${where()}: disposed ${rec.kind} ${rec.id} fired (C15)`)
          continue
        }
        const ran = rec.runs - b.runs
        const fired = (rec.fires ?? 0) - b.fires
        const relaxed = rec.disposedInFlush || rec.tainted
        switch (rec.kind) {
          case 'effect':
          case 'killer':
          case 'outer': {
            const ch = changed(b.reads)
            const optional = viaTouched(b.reads) || pulled || isTaintedReads(b.reads)
            if (rec.disposedInFlush) {
              expectRuns(ran, 0, 1, `${rec.kind} ${rec.id} disposed mid-flush`)
            } else if (rec.tainted || isTaintedReads(b.reads)) {
              if (ch && ran < 1) {
                if (STRICT)
                  fail(
                    `${where()}: ${rec.kind} ${rec.id} (downstream of an effect write) did not re-run`,
                  )
                else stats.staleAfterEffectWrite++
              }
            } else
              expectRuns(
                ran,
                ch ? 1 : 0,
                ch ? 1 : optional ? 1 : 0,
                `${rec.kind} ${rec.id} (reads ${JSON.stringify(b.reads)})`,
              )
            if (ran > 0 && !rec.disposedInFlush && rec.untrackedSeen && !rec.tainted) {
              const [j, v] = rec.untrackedSeen
              if (v !== post[j] && !tainted[j])
                fail(
                  `${where()}: ${rec.kind} ${rec.id} untracked read of ${j} = ${v}, want ${post[j]}`,
                )
            }
            if (rec.kind === 'outer') {
              const oldInner = b.inner
              const ib = oldInner ? innerBefore.get(oldInner) : undefined
              if (ran > 0) {
                const cur = rec.inner
                if (cur && cur !== oldInner && cur.alive)
                  expectRuns(cur.runs, 1, 1, `inner effect created during the flush (C16)`)
              }
              if (oldInner && ib && oldInner === rec.inner && oldInner.alive) {
                const iran = oldInner.runs - ib.runs
                const ich = changed(ib.reads)
                expectRuns(
                  iran,
                  ich ? 1 : 0,
                  ich ? 1 : viaTouched(ib.reads) || pulled ? 1 : 0,
                  `inner of ${rec.id}`,
                )
              }
              if (oldInner && ib && oldInner !== rec.inner && oldInner.kind === 'inner') {
                // A tracked inner replaced by this re-run: disposed, ran at most
                // once before its owner re-ran (C12).
                if (oldInner.runs - ib.runs > 1)
                  fail(`${where()}: replaced inner of ${rec.id} ran ${oldInner.runs - ib.runs}×`)
              }
            }
            break
          }
          case 'directSignal':
          case 'listener': {
            const spec = c.ops.find((o) => o.op === 'create' && o.id === rec.id) as Extract<
              Op,
              { op: 'create' }
            >
            const sig = (spec.spec as { sig: number }).sig
            const want = touched.has(sig) ? 1 : 0
            if (rec.disposedInFlush ? fired > want : fired !== want)
              fail(
                `${where()}: ${rec.kind} ${rec.id} on signal ${sig} fired ${fired}×, want ${want} (C8)`,
              )
            if (fired > 0 && rec.seen !== post[sig])
              fail(`${where()}: ${rec.kind} ${rec.id} saw ${rec.seen}, want ${post[sig]}`)
            break
          }
          case 'directComputed': {
            const spec = c.ops.find((o) => o.op === 'create' && o.id === rec.id) as Extract<
              Op,
              { op: 'create' }
            >
            const node = (spec.spec as { node: number }).node
            const ch = pre[node] !== post[node] && !frozenBefore.has(node)
            const killedNow = !frozenBefore.has(node) && frozen.has(node)
            if (rec.tainted) {
              // Downstream of an effect write: the value can change once per
              // effect pass, so one fire per writer run is legitimate.
              const writerRuns = writerRecs.reduce(
                (n, w, k) => n + w.runs - writerBefore[k]!.runs,
                0,
              )
              if (fired > 1 + writerRuns)
                fail(
                  `${where()}: directComputed ${rec.id} fired ${fired}× (${writerRuns} writer runs)`,
                )
              if (
                !rec.disposedInFlush &&
                ((ch && fired === 0) || (fired > 0 && rec.seen !== post[node]))
              ) {
                if (STRICT)
                  fail(
                    `${where()}: directComputed ${rec.id} left on ${rec.seen}, want ${post[node]}`,
                  )
                else stats.staleAfterEffectWrite++
              }
              break
            }
            if (relaxed || pulled || killedNow) {
              if (fired > 1) fail(`${where()}: directComputed ${rec.id} fired ${fired}×`)
            } else if (fired !== (ch ? 1 : 0))
              fail(
                `${where()}: directComputed ${rec.id} on ${node} fired ${fired}×, want ${ch ? 1 : 0} (C8)`,
              )
            if (fired > 0 && rec.seen !== post[node])
              fail(
                `${where()}: directComputed ${rec.id} _v = ${rec.seen}, want ${post[node]} (C8 settled)`,
              )
            break
          }
          case 'selectorRow':
          case 'selectorSub': {
            if (rec.disposedInFlush) break
            const sk = selectorKey(rec)!
            const src = c.selectors[sk.sel]!
            const was = pre[src] === sk.key
            const is = post[src] === sk.key
            const n = rec.kind === 'selectorRow' ? ran : fired
            if (n !== (was !== is ? 1 : 0))
              fail(
                `${where()}: ${rec.kind} ${rec.id} (key ${sk.key}) ran ${n}×, want ${was !== is ? 1 : 0} (C25)`,
              )
            if (rec.seen !== is)
              fail(`${where()}: ${rec.kind} ${rec.id} saw ${rec.seen}, want ${is}`)
            break
          }
        }
      }
      checkSettled(op.check, true)
    } catch (err) {
      fail(`${where()}: threw out of the op: ${err instanceof Error ? err.stack : String(err)}`)
      break
    }
  }

  // ─── teardown: scope.stop() disposes everything it owns (C12) ───
  try {
    for (const rec of recs.values()) {
      if (!rec.alive) continue
      if (rec.kind === 'directSignal' || rec.kind === 'listener' || rec.kind === 'selectorSub') {
        disposeRec(rec, false) // not scope-owned: disposed by hand
        continue
      }
      // The scope will dispose it: its last run's cleanups must run.
      rec.alive = false
      rec.expectLog.push(...rec.pending)
      rec.pending = []
      if (rec.inner && rec.inner.alive && rec.inner.kind === 'inner') {
        rec.inner.alive = false
        rec.inner.expectLog.push(...rec.inner.pending)
        rec.inner.pending = []
      }
    }
    scope.stop()
    for (const rec of recs.values()) {
      if (rec.log.join() !== rec.expectLog.join())
        fail(
          `seed ${c.seed} teardown: ${rec.kind} ${rec.id} cleanups ${JSON.stringify(rec.log)}, want ${JSON.stringify(rec.expectLog)}`,
        )
      if (
        rec.inner &&
        rec.inner.kind === 'inner' &&
        rec.inner.log.join() !== rec.inner.expectLog.join()
      )
        fail(
          `seed ${c.seed} teardown: inner of ${rec.id} cleanups ${JSON.stringify(rec.inner.log)}, want ${JSON.stringify(rec.inner.expectLog)}`,
        )
    }
    // Nothing the scope owned keeps a subscription (no leak), unless an
    // untracked inner effect was created during a re-run (owned by nothing).
    if (!orphanCreated)
      for (let i = 0; i < N; i++) {
        const n = c.nodes[i]!
        if (n.t === 'signal' || n.t === 'out') {
          const count = (getters[i] as ReturnType<typeof signal<number>>).debug().subscriberCount
          if (count === 0) continue
          if (!STRICT && extraInCase) stats.leakAfterExtraRun++
          else
            fail(
              `seed ${c.seed} teardown: signal ${i} keeps ${count} subscriber(s) after scope.stop()`,
            )
        }
      }
  } catch (err) {
    fail(`seed ${c.seed} teardown threw: ${err instanceof Error ? err.message : String(err)}`)
  }
  setErrorHandler(() => {})
  return violations
}

// ─── shrinking + reporting ──────────────────────────────────────────────────

function quietRun(c: Case): string[] {
  const s: Stats = {
    evaluations: 0,
    wasted: 0,
    checks: 0,
    staleAfterEffectWrite: 0,
    extraEffectRuns: 0,
    leakAfterExtraRun: 0,
  }
  return runCase(c, s, true)
}

/** Greedy op deletion while the case still fails. */
function shrink(c: Case): Case {
  let cur = c
  let progress = true
  let budget = 400
  while (progress && budget > 0) {
    progress = false
    for (let i = cur.ops.length - 1; i >= 0 && budget > 0; i--) {
      budget--
      const cand: Case = { ...cur, ops: cur.ops.filter((_, k) => k !== i) }
      if (quietRun(cand).length > 0) {
        cur = cand
        progress = true
      }
    }
  }
  return cur
}

function describeCase(c: Case): string {
  const lines = [`seed ${c.seed}`, 'nodes:']
  c.nodes.forEach((n, i) => {
    if (n.t === 'signal') lines.push(`  ${i}: signal(${n.init})`)
    else if (n.t === 'out') lines.push(`  ${i}: ${n.mode} effect writes ${JSON.stringify(n.f)}`)
    else
      lines.push(
        `  ${i}: computed ${JSON.stringify(n.f)}${n.equals ? ' { equals }' : ''}${n.throwOn !== null ? ` throws when ≡${n.throwOn} (mod 7)` : ''}`,
      )
  })
  if (c.selectors.length) lines.push(`selectors over nodes: ${JSON.stringify(c.selectors)}`)
  lines.push('ops:')
  c.ops.forEach((op, i) => lines.push(`  ${i}: ${JSON.stringify(op)}`))
  return lines.join('\n')
}

// ─── the test ───────────────────────────────────────────────────────────────

const env = (k: string): string | undefined =>
  (process.env as Record<string, string | undefined>)[k]
const CASES = Number(env('REACTIVITY_FUZZ_CASES') ?? 1500)
const STEPS = Number(env('REACTIVITY_FUZZ_STEPS') ?? 30)
const ONLY = env('REACTIVITY_FUZZ_SEED')
const ASSERT_WASTED = env('REACTIVITY_FUZZ_ASSERT_WASTED') === '1'
const STRICT = env('REACTIVITY_FUZZ_STRICT') !== '0'

describe('differential fuzz against a from-scratch reference', () => {
  const stats: Stats = {
    evaluations: 0,
    wasted: 0,
    checks: 0,
    staleAfterEffectWrite: 0,
    extraEffectRuns: 0,
    leakAfterExtraRun: 0,
  }

  test(
    `${ONLY ? `seed ${ONLY}` : `${CASES} cases`} × ${STEPS} ops: values, runs, cleanups, errors, laziness, ownership`,
    async () => {
      const seeds = ONLY ? [Number(ONLY)] : Array.from({ length: CASES }, (_, i) => i + 1)
      for (const seed of seeds) {
        // Yield now and then: dev-mode devtools records are pruned by a
        // FinalizationRegistry, whose callbacks never run inside one long
        // synchronous loop (a 100k-case run otherwise exhausts the heap).
        if (seed % 1000 === 0) await new Promise((r) => setTimeout(r, 0))
        const c = generateCase(seed, STEPS)
        const v = runCase(c, stats)
        if (v.length > 0) {
          const small = shrink(c)
          const smallV = quietRun(small)
          throw new Error(
            `${v.length} violation(s) for seed ${seed}; first: ${v[0]}\n` +
              `Replay: REACTIVITY_FUZZ_SEED=${seed} bun run --filter='@pyreon/reactivity' test -- differential-fuzz\n` +
              `Shrunk reproduction (${small.ops.length}/${c.ops.length} ops) fails with: ${smallV[0]}\n${describeCase(small)}`,
          )
        }
      }
      expect(stats.checks).toBeGreaterThan(0)
    },
    Math.max(20_000, CASES * STEPS * 0.5),
  ) // long local runs scale the timeout

  // Seeds that expose B1 (53) and B2 (46: an extra run at creation) under the
  // current generator; B3 needs a first-run self-write the generator does not
  // make, so `bug-regressions.test.ts` covers it. Always strict.
  test('regression seeds for B1 and B2 run clean', () => {
    for (const seed of [46, 53]) {
      const s: Stats = {
        evaluations: 0,
        wasted: 0,
        checks: 0,
        staleAfterEffectWrite: 0,
        extraEffectRuns: 0,
        leakAfterExtraRun: 0,
      }
      expect(runCase(generateCase(seed, 30), s), `seed ${seed}`).toEqual([])
      expect(
        [s.staleAfterEffectWrite, s.extraEffectRuns, s.leakAfterExtraRun],
        `seed ${seed}`,
      ).toEqual([0, 0, 0])
    }
  })

  // Stage (i): reported, not asserted. Stage (ii) asserts zero (design §2:
  // "wasted evaluations below an unchanged node" close by construction).
  test('metric: wasted evaluations (asserted from stage ii, REACTIVITY_FUZZ_ASSERT_WASTED=1)', () => {
    const line = `[reactivity fuzz] evaluations=${stats.evaluations} wasted=${stats.wasted} (${((100 * stats.wasted) / Math.max(1, stats.evaluations)).toFixed(1)}%) staleAfterEffectWrite=${stats.staleAfterEffectWrite} extraEffectRuns=${stats.extraEffectRuns} leakAfterExtraRun=${stats.leakAfterExtraRun} checks=${stats.checks}`
    // Printed so a local run shows the number the next stage must drive to 0.
    // oxlint-disable-next-line no-console
    console.info(line)
    expect(stats.evaluations).toBeGreaterThan(0)
    if (ASSERT_WASTED) expect(stats.wasted, line).toBe(0)
    if (STRICT) {
      expect(stats.staleAfterEffectWrite, line).toBe(0)
      expect(stats.extraEffectRuns, line).toBe(0)
      expect(stats.leakAfterExtraRun, line).toBe(0)
    }
  })
})
