/**
 * Contract — error isolation (design §1.6: C10).
 *
 * Public API only.
 */
import { batch, computed, effect, onCleanup, signal } from '../../index'
import { captureErrors, ContractError } from './_helpers'

let cap: ReturnType<typeof captureErrors>
beforeEach(() => {
  cap = captureErrors()
})
afterEach(() => {
  cap.restore()
})

describe('C10 — error isolation', () => {
  test('C10: an effect that throws is reported and does not stop other effects of the same write', () => {
    const s = signal(0)
    const err = new ContractError('effect')
    const ran: string[] = []
    effect(() => {
      if (s() > 0) throw err
    })
    effect(() => {
      s()
      ran.push('after')
    })
    s.set(1)
    expect(cap.errors).toEqual([err])
    expect(ran).toEqual(['after', 'after'])
  })

  test('C10: a throwing effect stays subscribed and re-runs on the next change', () => {
    const s = signal(0)
    const seen: number[] = []
    effect(() => {
      const v = s()
      seen.push(v)
      if (v === 1) throw new ContractError('once')
    })
    s.set(1)
    s.set(2)
    expect(seen).toEqual([0, 1, 2])
    expect(cap.errors).toHaveLength(1)
  })

  test('C10: a throwing effect inside batch() does not stop the other queued effects', () => {
    const a = signal(0)
    const b = signal(0)
    const seen: number[] = []
    effect(() => {
      if (a() > 0) throw new ContractError('batched')
    })
    effect(() => {
      seen.push(b())
    })
    batch(() => {
      a.set(1)
      b.set(1)
    })
    expect(seen).toEqual([0, 1])
    expect(cap.errors).toHaveLength(1)
  })

  test('C10: throwing cleanups are reported; the remaining cleanups still run and the effect re-runs', () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      const v = s()
      log.push(`run${v}`)
      onCleanup(() => {
        log.push(`c1-${v}`)
        throw new ContractError('cleanup1')
      })
      onCleanup(() => log.push(`c2-${v}`))
      return () => {
        log.push(`ret-${v}`)
        throw new ContractError('ret')
      }
    })
    s.set(1)
    expect(log).toEqual(['run0', 'c1-0', 'c2-0', 'ret-0', 'run1'])
    expect(cap.errors.map((e) => (e as ContractError).tag)).toEqual(['cleanup1', 'ret'])
  })

  test('C10: a throwing computed is reported and stays readable with its previous value', () => {
    const s = signal(1)
    const err = new ContractError('computed')
    const c = computed(() => {
      if (s() === 2) throw err
      return s() * 10
    })
    const seen: number[] = []
    effect(() => {
      seen.push(c())
    })
    s.set(2)
    expect(cap.errors).toEqual([err])
    expect(c()).toBe(10)
    expect(seen).toEqual([10]) // the kept value is unchanged, so nothing re-runs
    s.set(3)
    expect(seen).toEqual([10, 30])
    expect(c()).toBe(30)
  })

  test('C10: a throwing computed read outside any effect also reports and keeps its value', () => {
    const s = signal(1)
    const c = computed(() => {
      if (s() < 0) throw new ContractError('neg')
      return s()
    })
    expect(c()).toBe(1)
    s.set(-1)
    expect(c()).toBe(1)
    expect(cap.errors).toHaveLength(1)
    s.set(4)
    expect(c()).toBe(4)
  })

  test('C10: after a drain aborted by a throwing listener, the next read of a pending computed is fresh and its direct updater fires once', () => {
    // An effect earlier in the same pass wrote `s`, so the computed's refresh
    // was pending when the listener threw. Nothing may be lost: the next read
    // refreshes it and delivers the change.
    const s = signal(0)
    const trigger = signal(0)
    const e = computed(() => s() * 2, { equals: (a, b) => a === b })
    e()
    let directRuns = 0
    e.direct(() => directRuns++)
    effect(() => {
      if (trigger() > 0) s.set(trigger())
    })
    trigger.subscribe(() => {
      throw new ContractError('raw')
    })
    expect(() => trigger.set(1)).toThrow('contract:raw')
    expect(e()).toBe(2)
    expect(directRuns).toBe(1)
  })

  test('C10: a throwing raw listener propagates out of the write, and leaks no queued work into the next one', () => {
    const s = signal(0)
    const t = signal(0)
    const u = signal(0)
    let armed = true
    s.subscribe(() => {
      if (armed) throw new ContractError('listener')
    })
    let tRuns = 0
    effect(() => {
      t()
      tRuns++
    })
    let uRuns = 0
    effect(() => {
      u()
      uRuns++
    })
    expect(() =>
      batch(() => {
        s.set(1) // the listener is queued first …
        t.set(1) // … so the t effect is still queued when it throws
      }),
    ).toThrow('contract:listener')
    armed = false
    const tAfterThrow = tRuns

    // An unrelated write afterwards runs only its own effect.
    u.set(1)
    expect(uRuns).toBe(2)
    expect(tRuns).toBe(tAfterThrow)

    // The graph is not wedged: the t effect still reacts.
    t.set(2)
    expect(tRuns).toBe(tAfterThrow + 1)
  })
})
