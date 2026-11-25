/**
 * Leak discipline for the graph core: every `Link` an owner creates is removed
 * when the owner is disposed, when its scope stops, and when a run stops
 * reading a source. One spec per node kind and per removal path; each counts
 * the edges left on every source involved (`edgeCount`) and, where the owner
 * is reachable, the edges the owner still holds (`depCount`).
 *
 * A `Link` sits in two lists (the source's subscribers, the owner's deps), so
 * a missed removal keeps BOTH ends alive for the source's lifetime — on a
 * long-lived signal (theme, locale, auth) that is an app-lifetime leak per
 * mounted owner. The churn specs at the bottom pin that the count stays flat.
 */
import {
  _bind,
  batch,
  computed,
  createSelector,
  effect,
  effectScope,
  renderEffect,
  signal,
  type SubscriberHost,
} from '../index'
import {
  _abortOwnerFrame,
  _openOwnerFrame,
  _sampleReads,
} from '../internal'
import { depCount, directCount, rawEdgeCount as edgeCount } from './graph-internals'

describe('effect', () => {
  test('dispose removes every edge, including a source read several times', () => {
    const a = signal(0)
    const b = signal(0)
    const e = effect(() => {
      a()
      b()
      a()
    })
    expect(edgeCount(a)).toBe(1)
    expect(edgeCount(b)).toBe(1)
    expect(depCount(e)).toBe(2)
    e.dispose()
    expect(edgeCount(a)).toBe(0)
    expect(edgeCount(b)).toBe(0)
    expect(depCount(e)).toBe(0)
  })

  test('a run that stops reading a source drops that edge', () => {
    const flag = signal(true)
    const a = signal(0)
    const b = signal(0)
    const e = effect(() => {
      if (flag()) {
        a()
        b()
      }
    })
    expect(edgeCount(a) + edgeCount(b)).toBe(2)
    flag.set(false)
    expect(edgeCount(a)).toBe(0)
    expect(edgeCount(b)).toBe(0)
    expect(depCount(e)).toBe(1)
    e.dispose()
    expect(edgeCount(flag)).toBe(0)
  })

  test('scope.stop removes the edges of every effect in the scope', () => {
    const s = signal(0)
    const scope = effectScope()
    scope.runInScope(() => {
      for (let i = 0; i < 5; i++) {
        effect(() => {
          s()
        })
      }
    })
    expect(edgeCount(s)).toBe(5)
    scope.stop()
    expect(edgeCount(s)).toBe(0)
  })

  test('an inner effect is unlinked when its outer effect re-runs and when it is disposed', () => {
    const outer = signal(0)
    const t = signal(0)
    const e = effect(() => {
      outer()
      effect(() => {
        t()
      })
    })
    expect(edgeCount(t)).toBe(1)
    outer.set(1)
    outer.set(2)
    expect(edgeCount(t)).toBe(1) // the previous inner effects are gone
    e.dispose()
    expect(edgeCount(t)).toBe(0)
    expect(edgeCount(outer)).toBe(0)
  })

  test('an effect that disposes itself mid-run keeps no edge it linked afterwards', () => {
    const a = signal(0)
    const b = signal(0)
    let self: { dispose(): void } | null = null
    self = effect(() => {
      a()
      if (self) self.dispose()
      b()
    })
    a.set(1) // re-run: dispose, then read b
    expect(edgeCount(a)).toBe(0)
    expect(edgeCount(b)).toBe(0)
  })

  test('an effect disposed while queued in a flush never runs and keeps no edge', () => {
    const s = signal(0)
    let victimRuns = 0
    let victim: { dispose(): void } | null = null
    effect(() => {
      if (s() > 0) victim?.dispose()
    })
    victim = effect(() => {
      s()
      victimRuns++
    })
    s.set(1)
    expect(victimRuns).toBe(1)
    expect(edgeCount(s)).toBe(1) // only the disposer remains
  })

  test('a first run that throws keeps its edges until dispose, then drops them all', () => {
    const s = signal(0)
    const errs: unknown[] = []
    const prev = console.error
    console.error = (...a: unknown[]) => void errs.push(a)
    try {
      const e = effect(() => {
        s()
        throw new Error('boom')
      })
      expect(edgeCount(s)).toBe(1)
      e.dispose()
      expect(edgeCount(s)).toBe(0)
    } finally {
      console.error = prev
    }
  })
})

describe('computed', () => {
  test('dispose removes its edges to its sources; its reader drops its edge on dispose', () => {
    const a = signal(1)
    const b = signal(2)
    const c = computed(() => a() + b())
    const e = effect(() => {
      c()
    })
    expect(edgeCount(a)).toBe(1)
    expect(edgeCount(c)).toBe(1)
    e.dispose()
    expect(edgeCount(c)).toBe(0)
    expect(edgeCount(a)).toBe(1) // a computed stays linked until disposed (design D8)
    c.dispose()
    expect(edgeCount(a)).toBe(0)
    expect(edgeCount(b)).toBe(0)
    expect(depCount(c)).toBe(0)
  })

  test('a disposed computed read again never re-links', () => {
    const a = signal(1)
    const c = computed(() => a() * 2)
    c()
    a.set(2) // stale
    c.dispose()
    expect(c()).toBe(2) // its last value
    a.set(3)
    expect(c()).toBe(2)
    expect(edgeCount(a)).toBe(0)
  })

  test('a re-evaluation that stops reading a branch drops those edges', () => {
    const flag = signal(true)
    const a = signal(1)
    const b = signal(2)
    const c = computed(() => (flag() ? a() : b()))
    c()
    expect(edgeCount(a)).toBe(1)
    flag.set(false)
    c()
    expect(edgeCount(a)).toBe(0)
    expect(edgeCount(b)).toBe(1)
    c.dispose()
    expect(edgeCount(b) + edgeCount(flag)).toBe(0)
  })

  test('scope.stop disposes computeds created in the scope', () => {
    const a = signal(1)
    const scope = effectScope()
    const c = scope.runInScope(() => computed(() => a() + 1))
    c()
    expect(edgeCount(a)).toBe(1)
    scope.stop()
    expect(edgeCount(a)).toBe(0)
  })

  test('direct updaters are removed by their disposers', () => {
    const a = signal(1)
    const c = computed(() => a() + 1)
    c()
    const offs = [c.direct(() => {}), c.direct(() => {}), c.direct(() => {})]
    expect(directCount(c)).toBe(3)
    for (const off of offs) off()
    expect(directCount(c)).toBe(0)
  })
})

describe('render bindings', () => {
  test('renderEffect: dispose and scope.stop remove its edges', () => {
    const a = signal(0)
    const dispose = renderEffect(() => {
      a()
    })
    expect(edgeCount(a)).toBe(1)
    dispose()
    expect(edgeCount(a)).toBe(0)

    const scope = effectScope()
    scope.runInScope(() =>
      renderEffect(() => {
        a()
      }),
    )
    expect(edgeCount(a)).toBe(1)
    scope.stop()
    expect(edgeCount(a)).toBe(0)
  })

  test('_bind: dispose and scope.stop remove its edges', () => {
    const a = signal(0)
    const b = signal(0)
    const dispose = _bind(() => {
      a()
      b()
    })
    expect(edgeCount(a) + edgeCount(b)).toBe(2)
    dispose()
    expect(edgeCount(a) + edgeCount(b)).toBe(0)

    // Template-owned (#4682): a `_bind` binding is NOT registered with the
    // ambient scope; its only owner is the returned disposer, and an open
    // owner frame disposes it on a mount's error path.
    const scope = effectScope()
    scope.runInScope(() =>
      _bind(() => {
        a()
      }),
    )
    expect(edgeCount(a)).toBe(1)
    scope.stop()
    expect(edgeCount(a)).toBe(1)

    const c = signal(0)
    const mark = _openOwnerFrame()
    _bind(() => {
      c()
    })
    expect(edgeCount(c)).toBe(1)
    _abortOwnerFrame(mark)
    expect(edgeCount(c)).toBe(0)
  })

  test('a dead binding (tracked nothing) links nothing', () => {
    const a = signal(0)
    renderEffect(() => {
      a.peek()
    })
    _bind(() => {
      a.peek()
    })
    expect(edgeCount(a)).toBe(0)
  })
})

describe('signal direct tier', () => {
  test('.direct() and subscribe() disposers empty the tier in any order', () => {
    const s = signal(0)
    const offs = [s.direct(() => {}), s.subscribe(() => {}), s.direct(() => {}), s.subscribe(() => {})]
    expect(directCount(s)).toBe(4)
    for (const i of [2, 0, 3, 1]) offs[i]!()
    expect(directCount(s)).toBe(0)
  })
})

describe('createSelector', () => {
  test('a row effect is unlinked from its bucket on dispose; dispose() unlinks the source', () => {
    const sel = signal(1)
    const isSelected = createSelector(sel)
    const rows = [1, 2, 3].map((k) =>
      effect(() => {
        isSelected(k)
      }),
    )
    expect(edgeCount(sel)).toBe(1) // the selector's source effect
    sel.set(2)
    for (const r of rows) r.dispose()
    isSelected.dispose()
    expect(edgeCount(sel)).toBe(0)
  })
})

describe('_sampleReads', () => {
  test('returns the reads and leaves no edge behind, also when the sample throws', () => {
    const a = signal(1)
    const b = signal(2)
    const reads: SubscriberHost[] = []
    _sampleReads(() => a() + b(), reads)
    expect(edgeCount(a) + edgeCount(b)).toBe(0)
    expect(() =>
      _sampleReads(() => {
        a()
        throw new Error('sample')
      }, []),
    ).toThrow('sample')
    expect(edgeCount(a)).toBe(0)
  })
})

describe('churn on a long-lived source stays flat', () => {
  test('10k effects created and disposed on one signal leave no edge', () => {
    const theme = signal('light')
    for (let i = 0; i < 10_000; i++) {
      const e = effect(() => {
        theme()
      })
      if (i % 7 === 0) theme.set(i % 2 === 0 ? 'dark' : 'light')
      e.dispose()
    }
    expect(edgeCount(theme)).toBe(0)
  })

  test('10k scoped components (computed + effect + bindings) mounted and stopped leave no edge', () => {
    const theme = signal(0)
    for (let i = 0; i < 10_000; i++) {
      const scope = effectScope()
      scope.runInScope(() => {
        const c = computed(() => theme() + 1)
        effect(() => {
          c()
        })
        renderEffect(() => {
          theme()
        })
        _bind(() => {
          c()
        })
      })
      if (i % 11 === 0) batch(() => theme.set(i))
      scope.stop()
    }
    expect(edgeCount(theme)).toBe(0)
  })
})
