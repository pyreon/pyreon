/**
 * Contract — dynamic dependencies and depth (design §1.6: C13, C18).
 *
 * Public API only. `signal.debug().subscriberCount` is the public count of a
 * signal's tracking subscribers.
 */
import { batch, computed, effect, signal } from '../../index'

describe('C13 — dynamic deps are exact after every run', () => {
  test('C13: a branch flip unsubscribes the branch no longer read', () => {
    const cond = signal(true)
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    effect(() => {
      runs++
      if (cond()) a()
      else b()
    })
    cond.set(false)
    expect(runs).toBe(2)
    a.set(1) // no longer read
    expect(runs).toBe(2)
    expect(a.debug().subscriberCount).toBe(0)
    b.set(1)
    expect(runs).toBe(3)
    cond.set(true)
    b.set(2) // no longer read
    expect(runs).toBe(4)
    expect(b.debug().subscriberCount).toBe(0)
  })

  test('C13: the same flip in a computed', () => {
    const cond = signal(true)
    const a = signal(1)
    const b = signal(2)
    let evals = 0
    const c = computed(() => {
      evals++
      return cond() ? a() : b()
    })
    effect(() => {
      c()
    })
    cond.set(false)
    const base = evals
    a.set(10)
    expect(evals).toBe(base)
    b.set(20)
    expect(c()).toBe(20)
    expect(evals).toBe(base + 1)
  })

  test('C13: a reorder keeps both deps', () => {
    const flip = signal(false)
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    effect(() => {
      runs++
      if (flip()) {
        b()
        a()
      } else {
        a()
        b()
      }
    })
    flip.set(true)
    const base = runs
    a.set(1)
    b.set(1)
    expect(runs).toBe(base + 2)
  })

  test('C13: duplicate reads are safe — one run per write, nothing left behind on dispose', () => {
    const s = signal(0)
    const other = signal(0)
    let runs = 0
    const e = effect(() => {
      runs++
      s()
      if (other() > 0) other()
      s()
    })
    s.set(1)
    expect(runs).toBe(2)
    other.set(1) // grows: s, other, other, s
    expect(runs).toBe(3)
    other.set(0) // shrinks back
    s.set(2)
    expect(runs).toBe(5)
    expect(s.debug().subscriberCount).toBe(1)
    e.dispose()
    expect(s.debug().subscriberCount).toBe(0)
    expect(other.debug().subscriberCount).toBe(0)
  })

  test('C13: a dep list that grows and shrinks over time tracks exactly the last run', () => {
    const n = signal(0)
    const items = Array.from({ length: 5 }, (_, i) => signal(i))
    let runs = 0
    effect(() => {
      runs++
      for (let i = 0; i < n(); i++) items[i]!()
    })
    n.set(5)
    for (const it of items) expect(it.debug().subscriberCount).toBe(1)
    n.set(2)
    expect(items.map((it) => it.debug().subscriberCount)).toEqual([1, 1, 0, 0, 0])
    const base = runs
    items[4]!.set(40)
    expect(runs).toBe(base)
    items[1]!.set(10)
    expect(runs).toBe(base + 1)
  })

  test('C13: a run that throws keeps the deps it read before throwing', () => {
    const trip = signal(0)
    const a = signal(0)
    let runs = 0
    const errors: unknown[] = []
    const prev = console.error
    console.error = (...args: unknown[]) => void errors.push(args)
    try {
      effect(() => {
        runs++
        a()
        if (trip() === 1) throw new Error('mid-run')
      })
      trip.set(1)
      a.set(1) // still a dep
      expect(runs).toBe(3)
    } finally {
      console.error = prev
    }
  })
})

describe('C13 — a throwing run keeps its unconfirmed tail (design §1.5, kept by Design A)', () => {
  test('C13: deps after the throw point stay subscribed until a run completes', () => {
    const trip = signal(0)
    const a = signal(0)
    let runs = 0
    const prev = console.error
    console.error = () => {}
    try {
      effect(() => {
        runs++
        if (trip() === 1) throw new Error('stop before a')
        a()
      })
      trip.set(1) // reads only `trip`, throws
      a.set(1) // `a` is still a dep: re-runs
      expect(runs).toBe(3)
      trip.set(2) // completes, reads trip + a
      a.set(2)
      expect(runs).toBe(5)
    } finally {
      console.error = prev
    }
  })
})

describe('C18 — 10,000-deep chains neither overflow nor lose updates', () => {
  const DEPTH = 10_000

  // A chain's FIRST evaluation recurses through every user closure (inherent
  // in any core: each getter calls the next), so every test builds clean state
  // by reading bottom-up once. What C18 pins is what happens AFTER that.
  function chain(head: () => number, depth = DEPTH) {
    const nodes: Array<() => number> = []
    let prev = head
    for (let i = 0; i < depth; i++) {
      const p = prev
      const c = computed(() => p() + 1)
      nodes.push(c)
      prev = c
    }
    for (const n of nodes) n()
    return { nodes, tail: prev }
  }

  test('C18: a write below a warm chain marks it without overflow (10k, and 100k for the write side alone)', () => {
    // The write side must not recurse per hop at all: 100k is far past what
    // any per-hop recursion survives, even with the suite's --stack-size.
    for (const depth of [DEPTH, 100_000]) {
      const s = signal(0)
      const { nodes } = chain(s, depth)
      s.set(1)
      batch(() => s.set(2))
      for (const n of nodes) n()
      expect(nodes.at(-1)!()).toBe(depth + 2)
    }
  })

  test('C18: a direct updater at the tail of a warm 10k chain gets every write', () => {
    const s = signal(0)
    const { nodes } = chain(s)
    const tail = nodes.at(-1) as ReturnType<typeof computed<number>>
    const seen: number[] = []
    tail.direct(() => seen.push(tail._v))
    s.set(1)
    s.set(2)
    expect(seen).toEqual([DEPTH + 1, DEPTH + 2])
  })

  test('C18: an effect at the tail of a warm 10k chain sees every write', () => {
    const s = signal(0)
    const { tail } = chain(s)
    const seen: number[] = []
    const prev = console.error
    console.error = () => {}
    try {
      effect(() => {
        seen.push(tail())
      })
      s.set(1)
    } finally {
      console.error = prev
    }
    expect(seen).toEqual([DEPTH, DEPTH + 1])
  })

  test('C18: a warm 10k chain behind an { equals } gate, written with no change, does no work', () => {
    const s = signal(0)
    const gate = computed(() => s() >= 0, { equals: (a, b) => a === b })
    const nodes: Array<() => number> = []
    let prev: () => number = () => (gate() ? 1 : 0)
    for (let i = 0; i < DEPTH; i++) {
      const p = prev
      const c = computed(() => p() + 1)
      nodes.push(c)
      prev = c
    }
    for (const n of nodes) n()
    const tail = prev
    let runs = 0
    effect(() => {
      tail()
      runs++
    })
    s.set(1)
    s.set(2)
    expect(runs).toBe(1)
    expect(tail()).toBe(DEPTH + 1)
  })
})
