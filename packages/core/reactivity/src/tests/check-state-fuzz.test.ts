/**
 * CHECK / DIRTY staleness — differential fuzz against a from-scratch reference.
 *
 * A computed reached by the write walk only THROUGH another computed is marked
 * CHECK (maybe stale); one fed by a changed source is DIRTY. A CHECK read
 * refreshes its computed deps in order and re-evaluates only when one of them
 * changed. Random graphs of signals, lazy and `{ equals }` computeds (with
 * branching reads and value-collapsing formulas that make equality cutoffs
 * frequent), effects, single and batched writes, and pulls in the middle of a
 * batch. After every step:
 *
 *  1. every computed reads the reference value (no staleness);
 *  2. every effect has seen the reference value of what it reads, and ran
 *     exactly once if that value changed, else not at all;
 *  3. CUTOFF: an evaluation is WASTED when every input (as read by the
 *     previous evaluation) still has the same value. A CHECK read may evaluate
 *     directly when its predictor expects a change (cheaper on all-change
 *     chains), so one wasted evaluation can happen — but never two in a row on
 *     the same node: a waste moves the predictor to refresh-deps-first. Before
 *     CHECK state existed every node below an unchanged one wasted an
 *     evaluation on every write.
 */
import { batch, computed, effect, signal } from '../index'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Formula = (r: (j: number) => number) => number

interface Node {
  get: () => number
  formula: Formula | null // null = signal
  set?: (v: number) => void
  evals: number
  lastReads: Array<[number, number]> | null
  wastedLast: boolean
}

function makeFormula(rand: () => number, i: number): Formula {
  const pick = () => Math.floor(rand() * i)
  const a = pick()
  const b = pick()
  const c = pick()
  const k = Math.floor(rand() * 5)
  switch (Math.floor(rand() * 6)) {
    case 0:
      return (r) => r(a) + r(b)
    case 1:
      return (r) => Math.floor(r(a) / 3) // collapses: frequent equal values
    case 2:
      return (r) => (r(a) > k ? 1 : 0) // gate
    case 3:
      return (r) => (r(c) % 2 === 0 ? r(a) : r(b)) // branch: deps change shape
    case 4:
      return (r) => Math.min(r(a), 0) + (r(b) > k ? 1 : 0) // reads a, ignores it
    default:
      return (r) => r(a) + 1 // chain hop
  }
}

function runSeed(seed: number): void {
  const rand = rng(seed)
  const SIGNALS = 4
  const TOTAL = SIGNALS + 14
  const nodes: Node[] = []
  const violations: string[] = []
  // Reference values for the CURRENT step (set before the step's writes run).
  let ref: number[] = []

  for (let i = 0; i < TOTAL; i++) {
    if (i < SIGNALS) {
      const s = signal(Math.floor(rand() * 6))
      nodes.push({
        get: s,
        formula: null,
        set: (v) => s.set(v),
        evals: 0,
        lastReads: null,
        wastedLast: false,
      })
      continue
    }
    const formula = makeFormula(rand, i)
    const node: Node = { get: () => 0, formula, evals: 0, lastReads: null, wastedLast: false }
    const fn = () => {
      node.evals++
      const reads: Array<[number, number]> = []
      const prev = node.lastReads
      const v = formula((j) => {
        const x = nodes[j]!.get()
        reads.push([j, x])
        return x
      })
      const wasted = prev !== null && ref.length > 0 && prev.every(([j, x]) => ref[j] === x)
      if (wasted && node.wastedLast)
        violations.push(`seed ${seed}: node ${i} wasted two evaluations in a row`)
      node.wastedLast = wasted
      node.lastReads = reads
      return v
    }
    node.get = rand() < 0.25 ? computed(fn, { equals: (x, y) => x === y }) : computed(fn)
    nodes.push(node)
  }

  const reference = (): number[] => {
    const out: number[] = []
    for (let i = 0; i < TOTAL; i++) {
      const n = nodes[i]!
      out.push(n.formula === null ? (n.get as () => number)() : n.formula((j) => out[j]!))
    }
    return out
  }

  // Signals are read for the reference through peek-equivalent untracked
  // reads: these calls happen outside any effect, so they track nothing.
  ref = reference()

  const effects: Array<{ target: number; seen: number; runs: number }> = []
  for (let k = 0; k < 4; k++) {
    const target = Math.floor(rand() * TOTAL)
    const rec = { target, seen: -1, runs: 0 }
    effect(() => {
      rec.seen = nodes[target]!.get()
      rec.runs++
    })
    effects.push(rec)
  }
  for (const n of nodes) n.get()

  for (let step = 0; step < 40; step++) {
    const before = ref
    // Pick distinct signals, each written once with a DIFFERENT value, so every
    // DIRTY mark corresponds to a real input change (the optimality premise).
    const count = rand() < 0.5 ? 1 : 1 + Math.floor(rand() * SIGNALS)
    const order = [0, 1, 2, 3].sort(() => rand() - 0.5).slice(0, count)
    const writes = order.map((j) => {
      let v = Math.floor(rand() * 6)
      if (v === before[j]) v = v + 1
      return [j, v] as const
    })
    // Compute the post-write reference BEFORE writing (the fns compare to it).
    const signalVals = before.slice(0, SIGNALS)
    for (const [j, v] of writes) signalVals[j] = v
    const next: number[] = []
    for (let i = 0; i < TOTAL; i++) {
      const n = nodes[i]!
      next.push(i < SIGNALS ? signalVals[i]! : n.formula!((j) => next[j]!))
    }
    ref = next
    const runsBefore = effects.map((e) => e.runs)
    const midPull = rand() < 0.3 ? SIGNALS + Math.floor(rand() * (TOTAL - SIGNALS)) : -1

    if (writes.length === 1) {
      nodes[writes[0]![0]]!.set!(writes[0]![1])
    } else {
      batch(() => {
        for (const [j, v] of writes) nodes[j]!.set!(v)
        if (midPull !== -1) {
          const got = nodes[midPull]!.get()
          if (got !== ref[midPull])
            violations.push(
              `seed ${seed} step ${step}: mid-batch node ${midPull} = ${got}, want ${ref[midPull]}`,
            )
        }
      })
    }

    effects.forEach((e, k) => {
      if (e.seen !== ref[e.target])
        violations.push(
          `seed ${seed} step ${step}: effect ${k} saw ${e.seen}, want ${ref[e.target]}`,
        )
      const want = before[e.target] !== ref[e.target] ? 1 : 0
      if (e.runs - runsBefore[k]! !== want)
        violations.push(
          `seed ${seed} step ${step}: effect ${k} ran ${e.runs - runsBefore[k]!}×, want ${want}`,
        )
    })
    for (let i = SIGNALS; i < TOTAL; i++) {
      const got = nodes[i]!.get()
      if (got !== ref[i])
        violations.push(`seed ${seed} step ${step}: node ${i} = ${got}, want ${ref[i]}`)
    }
  }
  expect(violations.slice(0, 5)).toEqual([])
}

describe('CHECK/DIRTY staleness — differential fuzz', () => {
  test('300 random graphs × 40 steps: values, effect runs and the cutoff', () => {
    for (let seed = 1; seed <= 300; seed++) runSeed(seed)
  })

  test('the cutoff shape: an unchanged gate stops a 10-deep chain after one write', () => {
    const s = signal(0)
    const gate = computed(() => (s() >= 0 ? 0 : 1))
    let chainEvals = 0
    let tail: () => number = gate
    for (let i = 0; i < 10; i++) {
      const prev = tail
      tail = computed(() => {
        chainEvals++
        return prev() + 1
      })
    }
    let runs = 0
    const last = tail
    effect(() => {
      last()
      runs++
    })
    // First write: the predictor starts at "expect a change", so the chain
    // evaluates once, finds every value equal, and switches to refreshing its
    // deps first.
    s.set(1)
    const base = chainEvals
    expect(base).toBeLessThanOrEqual(20)
    for (let k = 2; k <= 100; k++) s.set(k)
    expect(chainEvals - base).toBe(0) // was 990 before CHECK state
    expect(runs).toBe(1)
    // Unobserved too: the pull confirms the chain clean without evaluating it.
    expect(last()).toBe(10)
    expect(chainEvals - base).toBe(0)
    // And a real change still flows through every hop.
    s.set(-1)
    expect(last()).toBe(11)
    expect(chainEvals - base).toBe(10)
    expect(runs).toBe(2)
  })
})

/**
 * Pre-existing bug found by the fuzz above (present on main before CHECK
 * state): three walk exits left the computeds BELOW a marked node unmarked, so
 * a pull inside `batch()` returned the stale cache. Each shape below failed
 * with the old value (`expected 10 to be 20`).
 */
describe('a pull inside batch() sees writes made earlier in the batch', () => {
  test('below a fan-out whose first subscriber is an effect (gated walk)', () => {
    const s = signal(0)
    const o = computed(() => s() + 1)
    effect(() => {
      o()
    }) // subscribes to `o` BEFORE `y`, so the walk meets the runner first
    const y = computed(() => o() * 10)
    expect(y()).toBe(10)
    let inside = -1
    batch(() => {
      s.set(1)
      inside = y()
    })
    expect(inside).toBe(20)
    expect(y()).toBe(20)
  })

  test('below a computed that has a direct updater', () => {
    const s = signal(0)
    const o = computed(() => s() + 1)
    let directRuns = 0
    o.direct(() => {
      directRuns++
    })
    const y = computed(() => o() * 10)
    expect(y()).toBe(10)
    let inside = -1
    batch(() => {
      s.set(1)
      inside = y()
    })
    expect(inside).toBe(20)
    expect(directRuns).toBe(1)
  })

  test('below an { equals } computed', () => {
    const s = signal(0)
    const o = computed(() => s() + 1, { equals: (a, b) => a === b })
    const y = computed(() => o() * 10)
    expect(y()).toBe(10)
    let inside = -1
    batch(() => {
      s.set(1)
      inside = y()
    })
    expect(inside).toBe(20)
    expect(y()).toBe(20)
  })
})

/**
 * Nodes BELOW a self-gating node (an `{ equals }` computed, a computed with a
 * direct updater, a fan-out owner booked for a gated refresh) are marked so a
 * pull inside a batch re-validates — but they must stay as quiet as they were
 * when they were not marked at all. A computed that builds a FRESH object can
 * never gate on its own, so any evaluation re-runs its effect: it must only
 * evaluate when its input really changed. (`@pyreon/flow`'s per-edge geometry
 * under `_edgeById` is this shape: 30 spurious edge re-renders per 60 drag
 * frames before the STRICT CHECK level existed.)
 */
describe('a fresh-object computed below a self-gating node stays quiet', () => {
  function countRuns(
    build: (src: ReturnType<typeof signal<number>>) => () => { v: number },
  ): number {
    const s = signal(0)
    const fresh = build(s)
    let runs = 0
    effect(() => {
      fresh()
      runs++
    })
    for (let k = 1; k <= 20; k++) s.set(k)
    return runs - 1
  }

  test('below an { equals } computed', () => {
    const runs = countRuns((s) => {
      const gate = computed(() => (s() >= 0 ? 1 : 0), { equals: (a, b) => a === b })
      return computed(() => ({ v: gate() }))
    })
    expect(runs).toBe(0)
  })

  test('below a fan-out owner whose first subscriber is an effect', () => {
    const runs = countRuns((s) => {
      const gate = computed(() => (s() >= 0 ? 1 : 0))
      effect(() => {
        gate()
      })
      return computed(() => ({ v: gate() }))
    })
    expect(runs).toBe(0)
  })

  test('below a computed with a direct updater', () => {
    const runs = countRuns((s) => {
      const gate = computed(() => (s() >= 0 ? 1 : 0))
      gate.direct(() => {})
      return computed(() => ({ v: gate() }))
    })
    expect(runs).toBe(0)
  })
})
