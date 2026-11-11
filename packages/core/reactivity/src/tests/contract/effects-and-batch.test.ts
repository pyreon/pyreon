/**
 * Contract — effect scheduling and batching (design §1.6: C1, C2, C9, C15).
 *
 * Public API only. Each test is named after the guarantee it pins; the PR
 * that introduced this suite records, per test, the one-line source breakage
 * that makes it fail.
 */
import { batch, computed, effect, signal } from '../../index'

describe('C1 — effects run once at creation and synchronously before an unbatched set returns', () => {
  test('C1: the first run happens inside effect(), exactly once', () => {
    const s = signal(1)
    const seen: number[] = []
    effect(() => {
      seen.push(s())
    })
    expect(seen).toEqual([1])
  })

  test('C1: an unbatched set re-runs the effect before set() returns', () => {
    const s = signal(1)
    const seen: number[] = []
    effect(() => {
      seen.push(s())
    })
    s.set(2)
    expect(seen).toEqual([1, 2])
    s.set(3)
    expect(seen).toEqual([1, 2, 3])
  })

  test('C1: an effect behind a computed also re-runs before set() returns', () => {
    const s = signal(1)
    const c = computed(() => s() * 10)
    const seen: number[] = []
    effect(() => {
      seen.push(c())
    })
    s.set(2)
    expect(seen).toEqual([10, 20])
  })

  test('C1: with many subscribers, every effect has run before set() returns', () => {
    const s = signal(0)
    const runs = [0, 0, 0, 0]
    for (let i = 0; i < runs.length; i++)
      effect(() => {
        s()
        runs[i]!++
      })
    s.set(1)
    expect(runs).toEqual([2, 2, 2, 2])
  })
})

describe('C2 — batch() nests, flushes at the outermost end, each effect at most once on settled values', () => {
  test('C2: nothing runs until the outermost batch ends', () => {
    const a = signal(0)
    const b = signal(0)
    const seen: string[] = []
    effect(() => {
      seen.push(`${a()}:${b()}`)
    })
    batch(() => {
      a.set(1)
      batch(() => {
        b.set(1)
      })
      expect(seen).toEqual(['0:0']) // inner batch end does not flush
      a.set(2)
    })
    expect(seen).toEqual(['0:0', '2:1'])
  })

  test('C2: an effect reading several written signals runs once, on the settled values', () => {
    const a = signal(0)
    const b = signal(0)
    const c = computed(() => a() + b())
    const seen: Array<[number, number, number]> = []
    effect(() => {
      seen.push([a(), b(), c()])
    })
    batch(() => {
      a.set(1)
      b.set(2)
      a.set(3)
    })
    expect(seen).toEqual([
      [0, 0, 0],
      [3, 2, 5],
    ])
  })

  test('C2: signal writes commit immediately — peek() inside the batch sees them', () => {
    const s = signal(0)
    let inside = -1
    batch(() => {
      s.set(5)
      inside = s.peek()
    })
    expect(inside).toBe(5)
  })

  test('C2: a batch whose fn throws still flushes what it wrote, and rethrows', () => {
    const s = signal(0)
    const seen: number[] = []
    effect(() => {
      seen.push(s())
    })
    expect(() =>
      batch(() => {
        s.set(1)
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(seen).toEqual([0, 1])
    // and the next write is not swallowed by a stuck batch depth
    s.set(2)
    expect(seen).toEqual([0, 1, 2])
  })
})

describe('C9 — an effect that writes a signal it reads re-runs in a later pass; >32 passes drops the queue', () => {
  test('C9: a converging self-write re-runs the effect until it settles, within the same set()', () => {
    const s = signal(0)
    const seen: number[] = []
    effect(() => {
      const v = s()
      seen.push(v)
      if (v > 0 && v < 5) s.set(v + 1)
    })
    s.set(1)
    expect(seen).toEqual([0, 1, 2, 3, 4, 5])
    expect(s.peek()).toBe(5)
  })

  test('C9: a converging self-write inside batch() also settles before batch() returns', () => {
    const s = signal(0)
    const seen: number[] = []
    effect(() => {
      const v = s()
      seen.push(v)
      if (v > 0 && v < 3) s.set(v + 1)
    })
    batch(() => s.set(1))
    expect(seen).toEqual([0, 1, 2, 3])
  })

  test('C9: an effect writing a signal another effect reads — the reader sees the final value', () => {
    const src = signal(0)
    const out = signal(0)
    const seen: number[] = []
    effect(() => {
      seen.push(out())
    })
    effect(() => {
      out.set(src() * 2)
    })
    src.set(4)
    expect(out.peek()).toBe(8)
    expect(seen.at(-1)).toBe(8)
  })

  test('C9: the ErrorBoundary shape — a first-run self-write, then a reset, re-renders (the effect stays subscribed)', () => {
    // runtime-dom's ErrorBoundary: the mount run catches a child throw and
    // writes `error`, which it reads; a later reset writes `error` back. The
    // effect must still be subscribed to `error` after the self-dispatch, or
    // the reset never re-renders (the failure that sank the 2026 no-teardown
    // prototype; design D9). Order-independent: only the end states are pinned.
    const error = signal<Error | null>(null)
    let childThrows = true
    const rendered: string[] = []
    effect(() => {
      const e = error()
      if (e) {
        rendered.push(`fallback:${e.message}`)
        return
      }
      try {
        if (childThrows) throw new Error('child')
        rendered.push('child')
      } catch (err) {
        error.set(err as Error)
      }
    })
    expect(rendered.at(-1)).toBe('fallback:child')
    childThrows = false
    error.set(null) // reset
    expect(rendered.at(-1)).toBe('child')
    childThrows = true
    error.set(null)
    error.set(new Error('again'))
    expect(rendered.at(-1)).toBe('fallback:again')
  })

  test('C9: an unconditional self-refire is cut off after 32 passes with a console message, and the next write works', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const s = signal(0)
      let runs = 0
      let armed = false
      effect(() => {
        s()
        runs++
        if (armed) s.set(s.peek() + 1)
      })
      armed = true
      runs = 0
      s.set(1) // run → write → re-queue … forever, unless capped
      const messages = [...warn.mock.calls, ...error.mock.calls].map((c) => String(c[0]))
      expect(messages.some((m) => m.includes('MAX_PASSES'))).toBe(true)
      // Bounded: one pass per run, cap at 32 passes.
      expect(runs).toBeGreaterThanOrEqual(32)
      expect(runs).toBeLessThanOrEqual(34)

      // The dropped queue does not leak into the next, unrelated write.
      armed = false
      warn.mockClear()
      error.mockClear()
      const t = signal(0)
      let tRuns = 0
      effect(() => {
        t()
        tRuns++
      })
      t.set(1)
      expect(tRuns).toBe(2)
      const after = [...warn.mock.calls, ...error.mock.calls].map((c) => String(c[0]))
      expect(after.some((m) => m.includes('MAX_PASSES'))).toBe(false)
    } finally {
      warn.mockRestore()
      error.mockRestore()
    }
  })
})

describe('C15 — an effect disposed during a flush does not run', () => {
  test('C15: an earlier effect in the same flush disposes a later one — the later one does not run', () => {
    const s = signal(0)
    let bRuns = 0
    let b: { dispose(): void } | null = null
    effect(() => {
      if (s() > 0 && b) {
        b.dispose()
        b = null
      }
    })
    b = effect(() => {
      s()
      bRuns++
    })
    expect(bRuns).toBe(1)
    s.set(1)
    expect(bRuns).toBe(1)
    s.set(2)
    expect(bRuns).toBe(1)
  })

  test('C15: same, when the two effects are reached through a batch', () => {
    const s = signal(0)
    const t = signal(0)
    let bRuns = 0
    let b: { dispose(): void } | null = null
    effect(() => {
      if (s() > 0 && b) {
        b.dispose()
        b = null
      }
    })
    b = effect(() => {
      t()
      bRuns++
    })
    batch(() => {
      s.set(1)
      t.set(1)
    })
    expect(bRuns).toBe(1)
  })

  test('C15: an effect disposed before a write never runs again', () => {
    const s = signal(0)
    let runs = 0
    const e = effect(() => {
      s()
      runs++
    })
    e.dispose()
    s.set(1)
    batch(() => s.set(2))
    expect(runs).toBe(1)
  })
})
