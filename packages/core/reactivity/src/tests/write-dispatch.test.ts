/**
 * The write-path shortcuts of the link-graph core must be indistinguishable
 * from the queued path they skip:
 *
 *   - `deliver`: an UNBATCHED write whose only tracked subscriber is one
 *     effect / render binding runs it in place instead of pushing it and
 *     draining the queue.
 *   - Marking runs no user code, so an unbatched write opens no window around
 *     it (one opens only for the flush).
 *   - Inside a batch, a write whose sole subscriber is already DIRTY skips the
 *     marking walk.
 *   - `propagate` is one iterative walk that tells level 0 (DIRTY) from the
 *     levels below (PENDING) by the depth of its continuation stack.
 *
 * Each differential spec runs the same scenario twice — the write unbatched
 * (the shortcut) and the same single write inside `batch()` (the queue) — and
 * requires identical observations: run order, run counts, values, which
 * callbacks were dropped by a throw, and that the graph stays live afterwards.
 */
import { _bind, batch, computed, effect, renderEffect, signal } from '../index'
import { MAX_PASSES } from '../graph'

type Mode = 'direct' | 'queued'
const MODES: Mode[] = ['direct', 'queued']

function write(mode: Mode, fn: () => void): void {
  if (mode === 'direct') fn()
  else batch(fn)
}

describe('sole-watcher dispatch matches the queue', () => {
  it('runs what the watcher queues after it, depth-first, in the same order', () => {
    const logs = MODES.map((mode) => {
      const log: string[] = []
      const s = signal(0)
      const t = signal(0)
      const u = signal(0)
      effect(() => {
        log.push(`e1:${s()}`)
        if (s() > 0) t.set(s())
      })
      effect(() => {
        log.push(`e2:${t()}`)
        if (t() > 0) u.set(t() * 10)
      })
      effect(() => {
        log.push(`e3:${t()}`)
      })
      effect(() => {
        log.push(`e4:${u()}`)
      })
      log.length = 0
      write(mode, () => s.set(1))
      write(mode, () => s.set(2))
      return log
    })
    expect(logs[0]).toEqual(logs[1])
    expect(logs[0]).toEqual(['e1:1', 'e2:1', 'e3:1', 'e4:10', 'e1:2', 'e2:2', 'e3:2', 'e4:20'])
  })

  it('counts a watcher re-queued by its own write as the next pass (same MAX_PASSES cap)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const counts = MODES.map((mode) => {
        const s = signal(0)
        const go = signal(false)
        let runs = 0
        effect(() => {
          runs++
          // Unconditional self-refire once armed: only the pass cap stops it.
          if (go()) s.set(s() + 1)
        })
        runs = 0
        write(mode, () => go.set(true))
        const first = runs
        runs = 0
        // A later write must still reach it: nothing was left marked.
        write(mode, () => s.set(-100))
        return [first, runs]
      })
      expect(counts[0]).toEqual(counts[1])
      expect(counts[0]![0]).toBe(MAX_PASSES)
      expect(counts[0]![1]).toBeGreaterThan(0)
    } finally {
      warn.mockRestore()
      error.mockRestore()
    }
  })

  it('a watcher that throws drops what its run queued, rethrows, and leaves the graph live', () => {
    const results = MODES.map((mode) => {
      const log: string[] = []
      const s = signal(0)
      const t = signal(0)
      renderEffect(() => {
        const v = s()
        log.push(`r:${v}`)
        if (v > 0) {
          t.set(v)
          if (v === 1) throw new Error('boom')
        }
      })
      effect(() => {
        log.push(`e:${t()}`)
      })
      log.length = 0
      let thrown: unknown = null
      try {
        write(mode, () => s.set(1))
      } catch (err) {
        thrown = err
      }
      // Dropped by the throw: `e` has not seen t = 1 yet. A later write of `t`
      // (a different value) and of `s` both still reach their subscribers.
      write(mode, () => t.set(5))
      write(mode, () => s.set(2))
      return { log, thrown: (thrown as Error | null)?.message, t: t() }
    })
    expect(results[0]).toEqual(results[1])
    expect(results[0]).toEqual({ log: ['r:1', 'e:5', 'r:2', 'e:2'], thrown: 'boom', t: 2 })
  })

  it('runs the watcher with no tracking frame: a write from inside a computed does not link its reads', () => {
    const results = MODES.map((mode) => {
      const src = signal(0)
      const ping = signal(0)
      const x = signal(0)
      let bound = 0
      // A static binding re-runs WITHOUT opening a tracking frame of its own.
      _bind(() => {
        ping()
        bound += x()
      })
      let evals = 0
      const c = computed(() => {
        evals++
        const v = src()
        write(mode, () => ping.set(v))
        return v
      })
      src.set(1)
      expect(c()).toBe(1)
      const before = evals
      // `x` was read by the binding's re-run, which ran while `c` was
      // evaluating. Had it linked to `c`, this write would make `c` stale.
      x.set(7)
      expect(c()).toBe(1)
      return { extra: evals - before, bound }
    })
    expect(results[0]).toEqual(results[1])
    expect(results[0]!.extra).toBe(0)
  })
})

describe('marking walk', () => {
  it('marks only level 0 DIRTY when level 0 ends on a node it descends', () => {
    // s → x (a gate whose value never changes) → y1, y2 — x is the LAST (and
    // only) level-0 node, so the walk keeps no level-0 continuation; y1
    // descends and pushes y2's. When y2 is popped the walk is still below level
    // 0: y2 must be PENDING (resolved through x) — not DIRTY (re-evaluated).
    const s = signal(0)
    const x = computed(() => (s() >= 0 ? 'same' : 'other'))
    let y1Evals = 0
    let y2Evals = 0
    let zEvals = 0
    const y1 = computed(() => {
      y1Evals++
      return `${x()}!`
    })
    const y2 = computed(() => {
      y2Evals++
      return `${x()}?`
    })
    const z = computed(() => {
      zEvals++
      return y1().length
    })
    let e1 = 0
    let e2 = 0
    effect(() => {
      z()
      e1++
    })
    effect(() => {
      y2()
      e2++
    })
    y1Evals = y2Evals = zEvals = e1 = e2 = 0
    for (let i = 1; i <= 5; i++) s.set(i)
    expect({ y1Evals, y2Evals, zEvals, e1, e2 }).toEqual({ y1Evals: 0, y2Evals: 0, zEvals: 0, e1: 0, e2: 0 })
  })

  it('upgrades a PENDING level-0 subscriber to DIRTY on a second path', () => {
    // a → b → d and a → d: d is reached PENDING through b first, then directly.
    const a = signal(1)
    const b = computed(() => (a() > 0 ? 1 : 0)) // unchanged for positive a
    let dEvals = 0
    const d = computed(() => {
      dEvals++
      return b() + a()
    })
    let seen = 0
    effect(() => {
      seen = d()
    })
    dEvals = 0
    a.set(2)
    expect(seen).toBe(3)
    expect(dEvals).toBe(1)
  })

  it('inside a batch, a second write to a source whose sole subscriber is DIRTY still settles once', () => {
    const s = signal(0)
    let runs = 0
    let seen = -1
    effect(() => {
      seen = s()
      runs++
    })
    runs = 0
    batch(() => {
      s.set(1)
      s.set(2)
      s.set(3)
    })
    expect({ runs, seen }).toEqual({ runs: 1, seen: 3 })
  })
})

describe('computed direct tier flag', () => {
  it('queues a computed while it has a direct updater, and is lazy again once the last one leaves', () => {
    const s = signal(0)
    let evals = 0
    const c = computed(() => {
      evals++
      return s() * 2
    })
    const fired: number[] = []
    const off1 = c.direct(() => fired.push(c._v))
    const off2 = c.direct(() => fired.push(-c._v))
    c()
    evals = 0
    s.set(1)
    expect(fired).toEqual([2, -2])
    expect(evals).toBe(1)
    off1()
    s.set(2)
    expect(fired).toEqual([2, -2, -4])
    off2()
    evals = 0
    // No reader left: the computed must not evaluate on writes.
    s.set(3)
    s.set(4)
    expect(evals).toBe(0)
    expect(c()).toBe(8)
    expect(evals).toBe(1)
  })
})
