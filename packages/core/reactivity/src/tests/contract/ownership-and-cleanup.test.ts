/**
 * Contract — cleanup, ownership, scopes and disposal (design §1.6: C11, C12,
 * C14, C17, C19, C20).
 *
 * Public API only. `setSnapshotCapture`, `renderEffect`, `_bind` and
 * `_noopDispose` are exports the design keeps with their signatures
 * (stage (ii): "internal exports keep their names/signatures").
 */
import {
  _bind,
  _noopDispose,
  type ReactiveSnapshotCapture,
  computed,
  effect,
  effectScope,
  onCleanup,
  renderEffect,
  setSnapshotCapture,
  signal,
  untrack,
} from '../../index'

describe('C11 — cleanup order: inner effects, then onCleanup in registration order, then the returned cleanup', () => {
  function build(log: string[]) {
    const s = signal(0)
    const e = effect(() => {
      const v = s()
      effect(() => {
        onCleanup(() => log.push(`inner-${v}`))
      })
      onCleanup(() => log.push(`a-${v}`))
      onCleanup(() => log.push(`b-${v}`))
      log.push(`run-${v}`)
      return () => log.push(`ret-${v}`)
    })
    return { s, e }
  }

  test('C11: before a re-run', () => {
    const log: string[] = []
    const { s } = build(log)
    log.length = 0
    s.set(1)
    expect(log).toEqual(['inner-0', 'a-0', 'b-0', 'ret-0', 'run-1'])
  })

  test('C11: on dispose, and each cleanup runs exactly once', () => {
    const log: string[] = []
    const { s, e } = build(log)
    log.length = 0
    e.dispose()
    expect(log).toEqual(['inner-0', 'a-0', 'b-0', 'ret-0'])
    e.dispose()
    s.set(5)
    expect(log).toEqual(['inner-0', 'a-0', 'b-0', 'ret-0'])
  })

  test('C11: an onCleanup registered after a nested effect() in the same run is kept', () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      s()
      onCleanup(() => log.push('before'))
      effect(() => {})
      onCleanup(() => log.push('after'))
    })
    s.set(1)
    expect(log).toEqual(['before', 'after'])
  })
})

describe('C12 — inner-effect ownership', () => {
  test('C12: an effect created in an effect run is disposed when the outer re-runs', () => {
    const outer = signal(0)
    const inner = signal(0)
    const innerSeen: string[] = []
    effect(() => {
      const o = outer()
      effect(() => {
        innerSeen.push(`${o}:${inner()}`)
      })
    })
    outer.set(1) // disposes inner#0, creates inner#1
    innerSeen.length = 0
    inner.set(1)
    expect(innerSeen).toEqual(['1:1']) // only the live inner reacts
  })

  test('C12: an effect created inside untrack() in an effect run belongs to the scope, not the outer run', () => {
    const outer = signal(0)
    const inner = signal(0)
    const scope = effectScope()
    const innerSeen: string[] = []
    scope.runInScope(() => {
      effect(() => {
        const o = outer()
        untrack(() => {
          effect(() => {
            innerSeen.push(`${o}:${inner()}`)
          })
        })
      })
    })
    outer.set(1) // the untracked inner#0 survives the outer re-run
    innerSeen.length = 0
    inner.set(1)
    expect(innerSeen).toContain('0:1')
    // inner#0 was created while the scope was current, so the scope owns it.
    // (The inner#1 created during the re-run is not asserted on: today it is
    // registered with whatever scope is current at re-run time — see the PR.)
    scope.stop()
    innerSeen.length = 0
    inner.set(2)
    expect(innerSeen.filter((x) => x.startsWith('0:'))).toEqual([])
  })

  test('C12: disposing the outer effect disposes its inner effects', () => {
    const inner = signal(0)
    let innerRuns = 0
    const e = effect(() => {
      effect(() => {
        inner()
        innerRuns++
      })
    })
    e.dispose()
    inner.set(1)
    expect(innerRuns).toBe(1)
  })

  test('C12: effects and computeds created in scope.runInScope are disposed by scope.stop()', () => {
    const s = signal(0)
    const scope = effectScope()
    let runs = 0
    let evals = 0
    let c!: () => number
    scope.runInScope(() => {
      c = computed(() => {
        evals++
        return s()
      })
      effect(() => {
        c()
        runs++
      })
    })
    scope.stop()
    s.set(1)
    expect(runs).toBe(1)
    expect(evals).toBe(1)
  })

  test('C12: onCleanup inside scope.runInScope (outside any effect) runs on scope.stop()', () => {
    const scope = effectScope()
    const log: string[] = []
    scope.runInScope(() => {
      onCleanup(() => log.push('scope-cleanup'))
    })
    expect(log).toEqual([])
    scope.stop()
    expect(log).toEqual(['scope-cleanup'])
  })
})

describe('C14 — a disposed computed never re-subscribes when read', () => {
  test('C14: reading a disposed computed returns its last value and links nothing', () => {
    const s = signal(1)
    let evals = 0
    const c = computed(() => {
      evals++
      return s() * 2
    })
    expect(c()).toBe(2)
    c.dispose()
    expect(s.debug().subscriberCount).toBe(0)
    s.set(5)
    expect(c()).toBe(2)
    expect(s.debug().subscriberCount).toBe(0)
    expect(evals).toBe(1)
  })

  test('C14: disposed while dirty — the read still links nothing', () => {
    const s = signal(1)
    const c = computed(() => s() * 2)
    expect(c()).toBe(2)
    s.set(2) // c is now stale
    c.dispose()
    c()
    c()
    expect(s.debug().subscriberCount).toBe(0)
    s.set(3)
    expect(s.debug().subscriberCount).toBe(0)
  })

  test('C14: an effect reading a disposed computed is not re-run by its old sources', () => {
    const s = signal(1)
    const c = computed(() => s() * 2)
    let runs = 0
    effect(() => {
      c()
      runs++
    })
    c.dispose()
    s.set(2)
    s.set(3)
    expect(runs).toBe(1)
  })
})

describe('C17 — dead bindings return the shared _noopDispose', () => {
  test('C17: renderEffect and _bind that track nothing return _noopDispose', () => {
    let ran = 0
    expect(renderEffect(() => void ran++)).toBe(_noopDispose)
    expect(_bind(() => void ran++)).toBe(_noopDispose)
    expect(ran).toBe(2)
  })

  test('C17: a binding that tracked something returns its own disposer, which unsubscribes', () => {
    const s = signal(0)
    let runs = 0
    const d = renderEffect(() => {
      s()
      runs++
    })
    expect(d).not.toBe(_noopDispose)
    s.set(1)
    expect(runs).toBe(2)
    d()
    s.set(2)
    expect(runs).toBe(2)
    const b = _bind(() => {
      s()
      runs++
    })
    expect(b).not.toBe(_noopDispose)
    b()
    s.set(3)
    expect(runs).toBe(3)
  })

  test('C17: a dead binding created in a scope does not keep a disposer alive in it', () => {
    // Observable half of "registers nothing": stopping the scope does not
    // call into the dead binding (it has nothing to run) and does not throw.
    const scope = effectScope()
    scope.runInScope(() => {
      renderEffect(() => {})
      _bind(() => {})
    })
    expect(() => scope.stop()).not.toThrow()
  })
})

describe('C19 — re-runs restore the setup-time context snapshot', () => {
  afterEach(() => setSnapshotCapture(null))

  test('C19: effect, renderEffect and _bind re-run inside the snapshot captured at setup', () => {
    let current = 'setup'
    const restoredWith: string[] = []
    const hook: ReactiveSnapshotCapture = {
      capture: () => current,
      restore: (snap, fn) => {
        const prev = current
        current = snap as string
        restoredWith.push(current)
        try {
          return fn()
        } finally {
          current = prev
        }
      },
    }
    setSnapshotCapture(hook)
    const s = signal(0)
    const seen: string[] = []
    effect(() => {
      s()
      seen.push(`effect:${current}`)
    })
    renderEffect(() => {
      s()
      seen.push(`render:${current}`)
    })
    _bind(() => {
      s()
      seen.push(`bind:${current}`)
    })
    current = 'later'
    seen.length = 0
    s.set(1)
    expect(seen.sort()).toEqual(['bind:setup', 'effect:setup', 'render:setup'])
    expect(current).toBe('later') // restored after each run
  })
})

describe('C20 — onUpdate hooks fire in a microtask after re-runs, never after the first run', () => {
  test('C20: no hook after the first run; one microtask hook per tick of re-runs', async () => {
    const s = signal(0)
    const scope = effectScope()
    let hooks = 0
    scope.addUpdateHook(() => hooks++)
    scope.runInScope(() => {
      effect(() => {
        s()
      })
      effect(() => {
        s()
      })
    })
    await Promise.resolve()
    expect(hooks).toBe(0)
    s.set(1)
    s.set(2)
    expect(hooks).toBe(0) // not synchronous
    await Promise.resolve()
    expect(hooks).toBe(1)
    scope.stop()
    s.set(3)
    await Promise.resolve()
    expect(hooks).toBe(1)
  })
})
