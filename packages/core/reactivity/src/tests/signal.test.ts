import { batch } from '../batch'
import { computed } from '../computed'
import { onSignalUpdate } from '../debug'
import { effect } from '../effect'
import { _resumeSubscriber, _suspendSubscriber, signal } from '../signal'

describe('signal', () => {
  test('reads initial value', () => {
    const s = signal(42)
    expect(s()).toBe(42)
  })

  test('set updates value', () => {
    const s = signal(0)
    s.set(10)
    expect(s()).toBe(10)
  })

  test('update transforms value', () => {
    const s = signal(5)
    s.update((n) => n * 2)
    expect(s()).toBe(10)
  })

  test('set with same value does not notify', () => {
    const s = signal(1)
    let calls = 0
    effect(() => {
      s() // track
      calls++
    })
    expect(calls).toBe(1) // initial run
    s.set(1) // same value — no notification
    expect(calls).toBe(1)
    s.set(2) // different value — notifies
    expect(calls).toBe(2)
  })

  test('works with objects', () => {
    const s = signal({ x: 1 })
    s.update((o) => ({ ...o, x: 2 }))
    expect(s().x).toBe(2)
  })

  test('works with null and undefined', () => {
    const s = signal<string | null>(null)
    expect(s()).toBeNull()
    s.set('hello')
    expect(s()).toBe('hello')
  })

  test('peek reads value without tracking', () => {
    const s = signal(42)
    let count = 0
    effect(() => {
      s.peek() // should NOT track
      count++
    })
    expect(count).toBe(1)
    s.set(100)
    expect(count).toBe(1) // no re-run because peek doesn't track
    expect(s.peek()).toBe(100)
  })

  test('subscribe adds a static listener', () => {
    const s = signal(0)
    let notified = 0
    const unsub = s.subscribe(() => {
      notified++
    })

    s.set(1)
    expect(notified).toBe(1)
    s.set(2)
    expect(notified).toBe(2)

    unsub()
    s.set(3)
    expect(notified).toBe(2) // unsubscribed
  })

  test('subscribe disposer is safe to call multiple times', () => {
    const s = signal(0)
    let runs = 0
    const unsub = s.subscribe(() => {
      runs++
    })
    unsub()
    expect(() => unsub()).not.toThrow() // double-unsub is safe
    // The disposer actually removed the subscriber — a double call must not
    // corrupt the subscriber set back into a live subscription.
    const before = runs
    s.set(1)
    expect(runs).toBe(before)
  })

  test('label getter returns name from options', () => {
    const s = signal(0, { name: 'counter' })
    expect(s.label).toBe('counter')
  })

  test('label setter updates the name', () => {
    const s = signal(0)
    expect(s.label).toBeUndefined()
    s.label = 'renamed'
    expect(s.label).toBe('renamed')
  })

  test('debug() returns signal info', () => {
    const s = signal(42, { name: 'test' })
    const info = s.debug()
    expect(info.name).toBe('test')
    expect(info.value).toBe(42)
    expect(info.subscriberCount).toBe(0)
  })

  test('debug() reports subscriber count', () => {
    const s = signal(0)
    s.subscribe(() => {})
    s.subscribe(() => {})
    const info = s.debug()
    expect(info.subscriberCount).toBe(2)
  })

  test('signal without options has undefined name', () => {
    const s = signal(0)
    expect(s.label).toBeUndefined()
    const info = s.debug()
    expect(info.name).toBeUndefined()
  })

  describe('direct updater disposal', () => {
    test('disposed direct updater is not called on subsequent updates', () => {
      const s = signal(0)
      let called = 0
      const dispose = s.direct(() => {
        called++
      })

      s.set(1)
      expect(called).toBe(1)

      dispose()
      s.set(2)
      expect(called).toBe(1) // not called after disposal
    })

    test('multiple direct updaters, dispose one, others still fire', () => {
      const s = signal(0)
      let calls1 = 0
      let calls2 = 0
      let calls3 = 0

      const dispose1 = s.direct(() => {
        calls1++
      })
      s.direct(() => {
        calls2++
      })
      s.direct(() => {
        calls3++
      })

      s.set(1)
      expect(calls1).toBe(1)
      expect(calls2).toBe(1)
      expect(calls3).toBe(1)

      dispose1()
      s.set(2)
      expect(calls1).toBe(1) // disposed — not called
      expect(calls2).toBe(2) // still active
      expect(calls3).toBe(2) // still active
    })

    test('direct updater is removed after disposal (single-subscriber inline slot)', () => {
      // With the two-tier storage (PR: bindText single-subscriber fast
      // path), a single subscribe lives in the `_d1` inline slot — the
      // `_d` Set is NEVER allocated unless a second subscriber arrives.
      // Disposal clears `_d1` to null — no memory leak, no dead-slot
      // accumulation, no Set allocation.
      const s = signal(0)
      let calls = 0
      const dispose = s.direct(() => {
        calls++
      })

      const internal = s as unknown as {
        _d: Set<() => void> | null
        _d1: (() => void) | null
      }
      expect(internal._d).toBeNull() // Set NOT allocated — inline slot only
      expect(internal._d1).not.toBeNull()
      s.set(1)
      expect(calls).toBe(1)

      dispose()
      // O(1) removal — the inline slot is cleared.
      expect(internal._d1).toBeNull()
      expect(internal._d).toBeNull()
      s.set(2)
      expect(calls).toBe(1) // disposed updater not invoked
    })
  })

  describe('signal.direct() for template binding', () => {
    test('direct updater is called synchronously on signal change', () => {
      const s = signal(0)
      const values: number[] = []
      s.direct(() => {
        values.push(s.peek())
      })

      s.set(1)
      expect(values).toEqual([1])
      s.set(2)
      expect(values).toEqual([1, 2])
    })

    test('direct updaters are batch-aware', () => {
      const s = signal(0)
      let calls = 0
      s.direct(() => {
        calls++
      })

      batch(() => {
        s.set(1)
        s.set(2)
        s.set(3)
      })
      // Should only be called once after batch (deduplication via Set)
      expect(calls).toBe(1)
    })

    test('direct updater storage initializes lazily', () => {
      // Single-subscriber path uses the `_d1` inline slot; `_d` Set is
      // never allocated for the common case (one binding per signal).
      const s = signal(0)
      const internal = s as unknown as {
        _d: Set<() => void> | null
        _d1: (() => void) | null
      }
      expect(internal._d).toBeNull()
      expect(internal._d1).toBeNull()
      s.direct(() => {})
      expect(internal._d).toBeNull() // Set still not allocated
      expect(internal._d1).not.toBeNull()
    })

    test('promotes from inline slot to Set on second subscriber', () => {
      // The fast-path inline slot covers ONE subscriber. A second
      // subscribe promotes both into a fresh `_d` Set and clears `_d1`.
      // Subsequent subscribes/disposes use the Set path.
      const s = signal(0)
      const internal = s as unknown as {
        _d: Set<() => void> | null
        _d1: (() => void) | null
      }
      const dispose1 = s.direct(() => {})
      expect(internal._d).toBeNull()
      expect(internal._d1).not.toBeNull()
      // Second subscribe → promotion
      const dispose2 = s.direct(() => {})
      expect(internal._d1).toBeNull()
      expect(internal._d).not.toBeNull()
      expect(internal._d!.size).toBe(2)
      // Dispose one → Set still has the other
      dispose1()
      expect(internal._d!.size).toBe(1)
      // Dispose remaining → Set is empty (note: the Set is NOT
      // deallocated; future churn stays on the Set path).
      dispose2()
      expect(internal._d!.size).toBe(0)
    })

    test('churned direct bindings do not accumulate (no unbounded growth)', () => {
      // Regression for the array-form leak: a long-lived signal whose
      // direct bindings register+dispose repeatedly (e.g. <For> rows
      // re-mounting) must keep storage bounded to the LIVE set, not grow
      // one permanent dead slot per ever-registered binding.
      //
      // With the two-tier storage, this churn never even ALLOCATES the
      // `_d` Set — each iteration uses the `_d1` inline slot which is
      // cleared on dispose. Even cheaper than the Set-only shape.
      const s = signal(0)
      const internal = s as unknown as {
        _d: Set<() => void> | null
        _d1: (() => void) | null
      }
      for (let i = 0; i < 10_000; i++) {
        const dispose = s.direct(() => {})
        dispose()
      }
      // No Set ever allocated — storage stays at the inline-slot tier.
      expect(internal._d).toBeNull()
      expect(internal._d1).toBeNull()
      // One live binding survives in the inline slot.
      const dispose = s.direct(() => {})
      expect(internal._d1).not.toBeNull()
      expect(internal._d).toBeNull()
      dispose()
    })
  })

  describe('signal misuse warning in dev', () => {
    test('warns when signal is called with arguments', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const s = signal(42)
      // Call signal with an argument (common mistake — trying to set via call)
      ;(s as unknown as (v: number) => number)(99)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('signal() was called with an argument'),
      )
      // Value should not change — the argument is ignored
      expect(s()).toBe(42)
      warnSpy.mockRestore()
    })
  })

  // Regression: pre-fix, a throwing trace listener (registered via
  // onSignalUpdate) was called inline between the `_v` write and subscriber
  // notification. If it threw, `_v` was updated but no effects ran — divergent
  // state. Fix wraps the trace dispatch in try/catch.
  describe('throwing trace listener does not corrupt state', () => {
    test('subscribers still fire when a trace listener throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const s = signal(0)
      const subscriberRuns: number[] = []
      effect(() => {
        subscriberRuns.push(s())
      })

      const dispose = onSignalUpdate(() => {
        throw new Error('trace listener boom')
      })

      // Pre-fix: the throwing listener would prevent the subscriber from
      // firing. Post-fix: the listener throws, gets logged, subscriber runs.
      s.set(5)
      expect(subscriberRuns).toEqual([0, 5])
      // Dev mode logs the listener error — bisect-verify the wrap is in place
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('trace listener threw'),
        expect.any(Error),
      )

      dispose()
      errorSpy.mockRestore()
    })

    test('multiple writes survive a chronically-broken listener', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const s = signal(0)
      const seen: number[] = []
      effect(() => {
        seen.push(s())
      })

      const dispose = onSignalUpdate(() => {
        throw new Error('always')
      })
      s.set(1)
      s.set(2)
      s.set(3)
      expect(seen).toEqual([0, 1, 2, 3])

      dispose()
      errorSpy.mockRestore()
    })
  })

  // L7 audit gap: cap-iteration in notifySubscribers caps at originalSize to
  // avoid infinite loops if a subscriber re-inserts itself or others into the
  // Set. The contract: subscribers added DURING notification fire next round,
  // not this round (no double-fire). Pin the contract.
  describe('subscriber cap-iteration during notification (L7)', () => {
    test('subscriber added mid-notification fires on the NEXT write, not the current one', () => {
      const s = signal(0)
      const fires: string[] = []

      const lateSubscriber = (): void => {
        fires.push('late')
      }

      s.subscribe(() => {
        fires.push('first')
        // Add a NEW subscriber during the notification. Per cap-iteration
        // contract, it should NOT fire this round.
        s.subscribe(lateSubscriber)
      })

      s.set(1)
      // Only "first" fires this round — "late" gets registered, doesn't run.
      expect(fires).toEqual(['first'])

      // Next write — both fire (first was already there, late is now registered).
      fires.length = 0
      s.set(2)
      expect(fires.sort()).toEqual(['first', 'late'])
    })

    test('subscriber that disposes itself mid-iteration cleans up cleanly', () => {
      const s = signal(0)
      let disposeMe: (() => void) | null = null
      let firstRuns = 0
      let secondRuns = 0

      s.subscribe(() => {
        firstRuns++
      })
      disposeMe = s.subscribe(() => {
        secondRuns++
        disposeMe?.() // self-dispose
      })

      s.set(1)
      expect(firstRuns).toBe(1)
      expect(secondRuns).toBe(1)

      // Next write — second is gone, first still fires.
      s.set(2)
      expect(firstRuns).toBe(2)
      expect(secondRuns).toBe(1)
    })
  })

  // Regression guard: when SignalProto landed as a bare `{ ... }` object
  // literal, its `[[Prototype]]` was Object.prototype — chains became
  // `read → SignalProto → Object.prototype` instead of the prior
  // `read → Function.prototype → Object.prototype`. Every signal silently
  // lost `instanceof Function === true`, breaking every ecosystem consumer
  // that uses that check to discriminate signals from plain values
  // (perf-harness, devtools, third-party libs, user code). Fix:
  // `Object.setPrototypeOf(SignalProto, Function.prototype)` restores the
  // chain link without giving up the monomorphic shared-proto allocation
  // win. Both signal AND computed are covered (computed uses SignalProto).
  describe('signal callables remain instanceof Function (regression)', () => {
    test('signal(x) instanceof Function === true', () => {
      const s = signal(0)
      expect(typeof s).toBe('function')
      expect(s instanceof Function).toBe(true)
    })

    test('computed(...) instanceof Function === true', () => {
      const s = signal(0)
      const c = computed(() => s() * 2)
      expect(typeof c).toBe('function')
      expect(c instanceof Function).toBe(true)
    })

    test('signal proto chain reaches Function.prototype', () => {
      const s = signal(0)
      // Walk the chain: read → SignalProto → Function.prototype.
      const signalProto = Object.getPrototypeOf(s)
      expect(signalProto).not.toBe(null)
      const protoOfProto = Object.getPrototypeOf(signalProto)
      // SignalProto's [[Prototype]] must be Function.prototype, not
      // Object.prototype. This is the load-bearing line of the fix.
      expect(protoOfProto).toBe(Function.prototype)
    })

    test('signal methods still resolve via prototype chain (monomorphic-shape preserved)', () => {
      const s = signal(0)
      // Sanity: the fix must NOT break method dispatch.
      s.set(5)
      expect(s()).toBe(5)
      s.update((n) => n + 1)
      expect(s()).toBe(6)
      expect(s.peek()).toBe(6)
    })
  })
})

describe('_suspendSubscriber / _resumeSubscriber', () => {
  test('suspend stops a specific subscriber from firing; resume restores it', () => {
    const s = signal(0)
    let fired = 0
    const listener = () => {
      fired++
    }
    s.subscribe(listener)

    s.set(1)
    expect(fired).toBe(1)

    _suspendSubscriber(s, listener)
    s.set(2)
    expect(fired).toBe(1) // suspended — did not fire

    _resumeSubscriber(s, listener)
    s.set(3)
    expect(fired).toBe(2) // restored
  })

  test('suspend affects ONLY the given listener; siblings still fire', () => {
    const s = signal(0)
    let a = 0
    let b = 0
    const la = () => {
      a++
    }
    const lb = () => {
      b++
    }
    s.subscribe(la)
    s.subscribe(lb)

    _suspendSubscriber(s, la)
    s.set(1)
    expect(a).toBe(0) // suspended
    expect(b).toBe(1) // sibling still fires

    _resumeSubscriber(s, la)
    s.set(2)
    expect(a).toBe(1)
    expect(b).toBe(2)
  })

  test('suspend is a no-op when the listener is not subscribed', () => {
    const s = signal(0)
    const orphan = () => {}
    // Signal has no subscriber set yet (`_s` is null) — must not throw.
    expect(() => _suspendSubscriber(s, orphan)).not.toThrow()
    // Even with an existing set, suspending an unknown listener is a no-op.
    s.subscribe(() => {})
    expect(() => _suspendSubscriber(s, orphan)).not.toThrow()
  })

  test('resume adds the listener even if the signal had no subscriber set yet', () => {
    const s = signal(0)
    let fired = 0
    const listener = () => {
      fired++
    }
    // `_s` is null — resume must create the set and add the listener.
    _resumeSubscriber(s, listener)
    s.set(1)
    expect(fired).toBe(1)
  })
})
