/**
 * Contract — direct updaters, raw listeners and the exported subscriber API
 * (design §1.6: C8, C16, C21, C22).
 *
 * Public API only. `_v`, `.direct`, `.peek`, `_hasSubscribers` and the
 * `_suspend*` / `_resume*` pair are exported contracts the design keeps
 * (§3.1 "Mapping the Pyreon surface", stage (ii) "internal exports keep their
 * names/signatures").
 */
import {
  _hasSubscribers,
  _resumeSoleSubscriber,
  _resumeSubscriber,
  _suspendSoleSubscriber,
  _suspendSubscriber,
  batch,
  computed,
  effect,
  signal,
} from '../../index'

describe('C8 — direct updaters', () => {
  test("C8: a signal's direct updater fires synchronously on an unbatched write", () => {
    const s = signal(0)
    const seen: number[] = []
    s.direct(() => seen.push(s.peek()))
    s.set(1)
    expect(seen).toEqual([1])
    s.set(1) // gated
    expect(seen).toEqual([1])
  })

  test("C8: inside batch() a signal's direct updater fires once, at the end, on the final value", () => {
    const s = signal(0)
    const seen: number[] = []
    s.direct(() => seen.push(s.peek()))
    batch(() => {
      s.set(1)
      s.set(2)
      expect(seen).toEqual([])
    })
    expect(seen).toEqual([2])
  })

  test("C8: a computed's direct updaters fire once per change, on a settled value", () => {
    const a = signal(1)
    const b = computed(() => a() + 1)
    const c = computed(() => a() * 10)
    const sum = computed(() => b() + c())
    const seen: number[] = []
    sum.direct(() => seen.push(sum._v))
    void sum._v // establish the edges
    a.set(2)
    expect(seen).toEqual([23])
    batch(() => {
      a.set(3)
      a.set(4)
    })
    expect(seen).toEqual([23, 45])
  })

  test("C8: a computed's direct updaters do not fire when its value is unchanged", () => {
    const a = signal(2)
    const even = computed(() => a() % 2 === 0)
    let fires = 0
    even.direct(() => fires++)
    void even._v
    a.set(4)
    a.set(6)
    expect(fires).toBe(0)
    a.set(7)
    expect(fires).toBe(1)
  })

  test("C8: a computed's direct updater fires at the drain, not mid-batch", () => {
    const a = signal(1)
    const c = computed(() => a() * 2)
    const seen: number[] = []
    c.direct(() => seen.push(c._v))
    void c._v
    batch(() => {
      a.set(2)
      expect(c()).toBe(4) // a pull inside the batch is fresh …
      expect(seen).toEqual([]) // … but the updater waits for the drain
      a.set(3)
    })
    expect(seen).toEqual([6])
  })

  test('C8: a disposed direct updater never fires, and its siblings still do', () => {
    const s = signal(0)
    const fired: string[] = []
    const d1 = s.direct(() => fired.push('a'))
    const d2 = s.direct(() => fired.push('b'))
    s.direct(() => fired.push('c'))
    d2()
    s.set(1)
    expect(fired.sort()).toEqual(['a', 'c'])
    d1()
    d1() // idempotent
    fired.length = 0
    s.set(2)
    expect(fired).toEqual(['c'])
  })

  test('C8: direct-updater churn stays bounded (register/dispose 10k times, one write fires one)', () => {
    const s = signal(0)
    let fires = 0
    for (let i = 0; i < 10_000; i++) s.direct(() => fires++)()
    s.direct(() => fires++)
    s.set(1)
    expect(fires).toBe(1)

    const c = computed(() => s() * 2)
    void c._v
    let cFires = 0
    for (let i = 0; i < 10_000; i++) c.direct(() => cFires++)()
    c.direct(() => cFires++)
    s.set(2)
    expect(cFires).toBe(1)
  })

  test("C8: a computed's disposed direct updaters never fire, in any dispose order", () => {
    for (const order of [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2],
    ]) {
      const s = signal(0)
      const c = computed(() => s() + 1)
      void c._v
      const fired = [0, 0, 0]
      const ds = [0, 1, 2].map((k) => c.direct(() => fired[k]!++))
      s.set(1)
      expect(fired).toEqual([1, 1, 1])
      ds[order[0]!]!()
      s.set(2)
      const live = [0, 1, 2].filter((k) => k !== order[0])
      for (const k of live) expect(fired[k]).toBe(2)
      expect(fired[order[0]!]).toBe(1)
      ds[order[1]!]!()
      ds[order[2]!]!()
      s.set(3)
      expect(fired.reduce((a, b) => a + b)).toBe(5)
    }
  })
})

describe('C16 — a subscriber added during a notification is not fired in that notification', () => {
  test('C16: a listener added by another listener (sole subscriber) waits for the next write', () => {
    const s = signal(0)
    let lateRuns = 0
    let added = false
    s.subscribe(() => {
      if (!added) {
        added = true
        s.subscribe(() => lateRuns++)
      }
    })
    s.set(1)
    expect(lateRuns).toBe(0)
    s.set(2)
    expect(lateRuns).toBe(1)
  })

  test('C16: same with three or more existing subscribers', () => {
    const s = signal(0)
    let lateRuns = 0
    let added = false
    s.subscribe(() => {})
    s.subscribe(() => {
      if (!added) {
        added = true
        s.subscribe(() => lateRuns++)
      }
    })
    s.subscribe(() => {})
    s.set(1)
    expect(lateRuns).toBe(0)
    s.set(2)
    expect(lateRuns).toBe(1)
  })

  test('C16: an effect created during a flush, reading the written signal, runs only its first run', () => {
    const s = signal(0)
    let innerRuns = 0
    effect(() => {
      if (s() === 1) {
        effect(() => {
          s()
          innerRuns++
        })
      }
    })
    s.set(1)
    expect(innerRuns).toBe(1)
  })
})

describe('C16/C22 — every subscriber fires exactly once per write, whatever their number', () => {
  test('C22: 1 to 5 listeners and effects each fire once per write, also after one in the middle leaves', () => {
    for (let n = 1; n <= 5; n++) {
      const s = signal(0)
      const fired = Array.from({ length: n }, () => 0)
      const disposers = fired.map((_, k) =>
        k % 2 === 0
          ? s.subscribe(() => fired[k]!++)
          : effect(() => {
              if (s() > 0) fired[k]!++
            }).dispose,
      )
      s.set(1)
      batch(() => s.set(2))
      expect(fired).toEqual(fired.map(() => 2))
      if (n >= 3) {
        disposers[1]!()
        s.set(3)
        expect(fired).toEqual(fired.map((_, k) => (k === 1 ? 2 : 3)))
      }
    }
  })
})

describe('C21 — `_v`, `.direct`, `.peek`, callable + instanceof Function', () => {
  test('C21: signal `_v` is the current value, read without tracking', () => {
    // `_v` is a field on every signal (compiled bindings read it); it is not on
    // the public `Signal` type, hence the cast.
    const s = signal(1) as ReturnType<typeof signal<number>> & { _v: number }
    let runs = 0
    effect(() => {
      void s._v
      runs++
    })
    s.set(2)
    expect(s._v).toBe(2)
    expect(runs).toBe(1)
  })

  test('C21: computed `_v` is fresh even when nothing has read the computed since the write', () => {
    const s = signal(1)
    const c = computed(() => s() * 3)
    expect(c._v).toBe(3)
    s.set(2)
    expect(c._v).toBe(6)
    batch(() => {
      s.set(5)
      expect(c._v).toBe(15)
    })
  })

  test('C21: .peek reads without tracking', () => {
    const s = signal(1)
    let runs = 0
    effect(() => {
      s.peek()
      runs++
    })
    s.set(2)
    expect(runs).toBe(1)
    expect(s.peek()).toBe(2)
  })

  test('C21: signals and computeds are callable and instanceof Function', () => {
    const s = signal(1)
    const c = computed(() => s() + 1)
    expect(s).toBeInstanceOf(Function)
    expect(c).toBeInstanceOf(Function)
    expect(typeof s).toBe('function')
    expect(typeof c).toBe('function')
    expect(c()).toBe(2)
  })

  test('C21: .direct returns a disposer on both signals and computeds', () => {
    const s = signal(1)
    const c = computed(() => s() + 1)
    void c._v
    let fires = 0
    const ds = s.direct(() => fires++)
    const dc = c.direct(() => fires++)
    s.set(2)
    expect(fires).toBe(2)
    ds()
    dc()
    s.set(3)
    expect(fires).toBe(2)
  })
})

describe('C22 — `_hasSubscribers` and suspend/resume see every subscriber kind and count', () => {
  test('C22: _hasSubscribers is true for 1, 2 and 3+ tracking subscribers, and for direct updaters', () => {
    const s = signal(0)
    expect(_hasSubscribers(s)).toBe(false)
    const disposers: Array<() => void> = []
    for (let i = 0; i < 4; i++) {
      disposers.push(s.subscribe(() => {}))
      expect(_hasSubscribers(s)).toBe(true)
    }
    for (const d of disposers) d()
    expect(_hasSubscribers(s)).toBe(false)

    const d1 = s.direct(() => {})
    expect(_hasSubscribers(s)).toBe(true)
    const d2 = s.direct(() => {})
    d1()
    expect(_hasSubscribers(s)).toBe(true)
    d2()
    expect(_hasSubscribers(s)).toBe(false)

    const e = effect(() => {
      s()
    })
    expect(_hasSubscribers(s)).toBe(true)
    e.dispose()
    expect(_hasSubscribers(s)).toBe(false)
  })

  test('C22: _suspendSubscriber / _resumeSubscriber silence one listener among several', () => {
    const s = signal(0)
    const fired: string[] = []
    const a = () => fired.push('a')
    s.subscribe(a)
    s.subscribe(() => fired.push('b'))
    s.subscribe(() => fired.push('c'))
    _suspendSubscriber(s, a)
    s.set(1)
    expect(fired.sort()).toEqual(['b', 'c'])
    _resumeSubscriber(s, a)
    fired.length = 0
    s.set(2)
    expect(fired.sort()).toEqual(['a', 'b', 'c'])
  })

  test('C22: _suspendSoleSubscriber detaches a sole listener and refuses when there are two', () => {
    const s = signal(0)
    let fires = 0
    const l = () => fires++
    s.subscribe(l)
    const token = _suspendSoleSubscriber(s)
    expect(token).not.toBeNull()
    expect(_hasSubscribers(s)).toBe(false)
    s.set(1)
    expect(fires).toBe(0)
    _resumeSoleSubscriber(s, token!, l)
    s.set(2)
    expect(fires).toBe(1)

    s.subscribe(() => {})
    expect(_suspendSoleSubscriber(s)).toBeNull()
    s.set(3)
    expect(fires).toBe(2)
  })

  test('C22: a listener subscribed during a sole suspension is kept on resume', () => {
    const s = signal(0)
    const fired: string[] = []
    const l = () => fired.push('l')
    s.subscribe(l)
    const token = _suspendSoleSubscriber(s)!
    s.subscribe(() => fired.push('new'))
    _resumeSoleSubscriber(s, token, l)
    s.set(1)
    expect(fired.sort()).toEqual(['l', 'new'])
  })
})
