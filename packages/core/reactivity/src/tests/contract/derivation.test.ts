/**
 * Contract — derived values (design §1.6: C3, C4, C5, plus the stale-read
 * bug fixed by #4240, pinned here as S1).
 *
 * Public API only.
 */
import { batch, computed, effect, signal, untrack } from '../../index'
import { captureErrors } from './_helpers'

describe('C3 — glitch-freedom', () => {
  test('C3: a diamond effect runs once per change and never sees a torn pair', () => {
    const a = signal(1)
    const b = computed(() => a() * 2)
    const c = computed(() => a() * 3)
    const seen: Array<[number, number]> = []
    effect(() => {
      seen.push([b(), c()])
    })
    a.set(2)
    a.set(3)
    expect(seen).toEqual([
      [2, 3],
      [4, 6],
      [6, 9],
    ])
  })

  test('C3: a diamond whose tip is a computed evaluates on consistent inputs only', () => {
    const a = signal(1)
    const b = computed(() => a() + 1)
    const c = computed(() => a() + 2)
    const pairs: Array<[number, number]> = []
    const d = computed(() => {
      pairs.push([b(), c()])
      return b() + c()
    })
    const seen: number[] = []
    effect(() => {
      seen.push(d())
    })
    a.set(10)
    expect(seen).toEqual([5, 23])
    for (const [x, y] of pairs) expect(y - x).toBe(1)
  })

  test('C3: an intermediate that would throw on a torn pair never reports', () => {
    const { errors, restore } = captureErrors()
    try {
      const a = signal(1)
      const b = computed(() => a())
      const c = computed(() => a())
      const guard = computed(() => {
        if (b() !== c()) throw new Error('torn')
        return b()
      })
      const seen: number[] = []
      effect(() => {
        seen.push(guard())
      })
      for (let i = 2; i < 10; i++) a.set(i)
      batch(() => {
        a.set(100)
        a.set(101)
      })
      expect(errors).toEqual([])
      expect(seen.at(-1)).toBe(101)
    } finally {
      restore()
    }
  })

  test('C3: an effect reading a signal and a computed of it sees both settled', () => {
    const a = signal(1)
    const double = computed(() => a() * 2)
    const torn: number[] = []
    effect(() => {
      if (double() !== a() * 2) torn.push(a())
    })
    effect(() => {
      if (a() * 2 !== double()) torn.push(a())
    })
    for (let i = 2; i < 6; i++) a.set(i)
    expect(torn).toEqual([])
  })
})

describe('C4 — value gate', () => {
  test('C4: signal.set with Object.is-equal value (incl. NaN, same ref) notifies nobody', () => {
    const n = signal(Number.NaN)
    const obj = { x: 1 }
    const o = signal(obj)
    let runs = 0
    effect(() => {
      n()
      o()
      runs++
    })
    n.set(Number.NaN)
    o.set(obj)
    expect(runs).toBe(1)
    o.set({ x: 1 }) // fresh reference: not gated
    expect(runs).toBe(2)
  })

  test('C4: a computed that recomputes to an Object.is-equal value re-runs nothing (NaN gated)', () => {
    const s = signal(0)
    const parity = computed(() => s() % 2)
    const nan = computed(() => (s() >= 0 ? Number.NaN : 0))
    let runs = 0
    effect(() => {
      parity()
      nan()
      runs++
    })
    s.set(2)
    s.set(4)
    expect(runs).toBe(1)
    s.set(5)
    expect(runs).toBe(2)
  })

  test('C4: a computed returning a fresh object is NOT gated by default', () => {
    const s = signal(0)
    const box = computed(() => ({ v: s() >= 0 }))
    let runs = 0
    effect(() => {
      box()
      runs++
    })
    s.set(1)
    expect(runs).toBe(2)
  })

  test('C4: a custom equals overrides Object.is, and the old reference is kept', () => {
    const s = signal([1, 2])
    const copy = computed(() => s().slice(), {
      equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
    })
    const seen: number[][] = []
    effect(() => {
      seen.push(copy())
    })
    const first = seen[0]
    s.set([1, 2]) // fresh array, equal contents
    expect(seen.length).toBe(1)
    expect(copy()).toBe(first) // the memoised reference survives
    s.set([1, 3])
    expect(seen.length).toBe(2)
  })

  test('C4: an unchanged derived value re-runs nothing below it (chain)', () => {
    const s = signal(1)
    const sign = computed(() => (s() > 0 ? 1 : -1))
    const label = computed(() => (sign() > 0 ? 'pos' : 'neg'))
    let runs = 0
    effect(() => {
      label()
      runs++
    })
    for (let i = 2; i < 10; i++) s.set(i)
    expect(runs).toBe(1)
    s.set(-1)
    expect(runs).toBe(2)
  })

  test('C4: a batch whose writes cancel out fires nothing downstream of a computed', () => {
    const s = signal(1)
    const c = computed(() => s() * 2)
    let runs = 0
    effect(() => {
      c()
      runs++
    })
    batch(() => {
      s.set(5)
      s.set(1)
    })
    expect(runs).toBe(1)
  })
})

describe('C5 — laziness', () => {
  test('C5: a computed with no runner below it evaluates zero times across writes', () => {
    const s = signal(0)
    let evals = 0
    const a = computed(() => {
      evals++
      return s() + 1
    })
    const b = computed(() => a() * 2)
    expect(b()).toBe(2) // read once so the edges exist
    const base = evals
    for (let i = 1; i <= 10; i++) s.set(i)
    batch(() => {
      s.set(20)
      s.set(21)
    })
    expect(evals).toBe(base)
    expect(b()).toBe(44)
    expect(evals).toBe(base + 1)
  })

  test('C5: a computed goes cold again after its last runner is disposed', () => {
    const s = signal(0)
    let evals = 0
    const c = computed(() => {
      evals++
      return s() * 2
    })
    const e = effect(() => {
      c()
    })
    s.set(1)
    expect(evals).toBe(2)
    e.dispose()
    for (let i = 2; i < 10; i++) s.set(i)
    expect(evals).toBe(2)
    expect(c()).toBe(18)
  })

  test('C5: a computed never read evaluates zero times (no eager first evaluation)', () => {
    const s = signal(0)
    let evals = 0
    computed(() => {
      evals++
      return s()
    })
    s.set(1)
    expect(evals).toBe(0)
  })

  test('C5: repeated reads of a clean computed do not re-evaluate', () => {
    const s = signal(1)
    let evals = 0
    const c = computed(() => {
      evals++
      return s()
    })
    c()
    c()
    untrack(() => c())
    expect(evals).toBe(1)
  })
})

describe('S1 — a computed read inside batch() after a write in the same batch is fresh (#4240)', () => {
  // The design lists this as a bug on main fixed by #4240 (`staleness-fuzz.test.ts`).
  // Pinned here through the three walk exits that used to leave the reader stale.
  test('S1: below a fan-out whose first subscriber is an effect', () => {
    const s = signal(0)
    const o = computed(() => s() + 1)
    effect(() => {
      o()
    })
    const y = computed(() => o() * 10)
    expect(y()).toBe(10)
    let inside = -1
    batch(() => {
      s.set(1)
      inside = y()
    })
    expect(inside).toBe(20)
  })

  test('S1: below a computed that has a direct updater', () => {
    const s = signal(0)
    const o = computed(() => s() + 1)
    o.direct(() => {})
    const y = computed(() => o() * 10)
    expect(y()).toBe(10)
    let inside = -1
    batch(() => {
      s.set(1)
      inside = y()
    })
    expect(inside).toBe(20)
  })

  test('S1: below an { equals } computed', () => {
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
  })
})
