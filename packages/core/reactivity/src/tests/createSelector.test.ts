import { createSelector } from '../createSelector'
import { effect } from '../effect'
import { signal } from '../signal'

describe('createSelector', () => {
  test('returns true for the currently selected value', () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    let result = false
    effect(() => {
      result = isSelected(1)
    })
    expect(result).toBe(true)
  })

  test('returns false for non-selected values', () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    let result = true
    effect(() => {
      result = isSelected(2)
    })
    expect(result).toBe(false)
  })

  test('only notifies affected subscribers when selection changes', () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    let runs1 = 0
    let runs2 = 0
    let runs3 = 0

    effect(() => {
      isSelected(1)
      runs1++
    })
    effect(() => {
      isSelected(2)
      runs2++
    })
    effect(() => {
      isSelected(3)
      runs3++
    })

    expect(runs1).toBe(1)
    expect(runs2).toBe(1)
    expect(runs3).toBe(1)

    // Change selection from 1 to 2: only buckets 1 (deselected) and 2 (newly selected) should fire
    selected.set(2)
    expect(runs1).toBe(2) // deselected
    expect(runs2).toBe(2) // newly selected
    expect(runs3).toBe(1) // unaffected
  })

  test('does not notify when source changes to the same value', () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    let runs = 0
    effect(() => {
      isSelected(1)
      runs++
    })

    selected.set(1) // same value
    expect(runs).toBe(1)
  })

  test('works when changing to a value with no subscribers', () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    let runs = 0
    effect(() => {
      isSelected(1)
      runs++
    })

    // Change to value 99 which has no subscriber bucket
    selected.set(99)
    expect(runs).toBe(2) // old bucket (1) notified
  })

  test('reuses host objects for the same value', () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    let result1 = false
    let result2 = false
    effect(() => {
      result1 = isSelected(1)
    })
    // Second call with same value should reuse the host
    effect(() => {
      result2 = isSelected(1)
    })

    expect(result1).toBe(true)
    expect(result2).toBe(true)

    selected.set(2)
    expect(result1).toBe(false)
    expect(result2).toBe(false)
  })

  test('tracks correctly outside an effect (no activeEffect)', () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    // Calling outside an effect should still return the correct boolean
    expect(isSelected(1)).toBe(true)
    expect(isSelected(2)).toBe(false)
  })

  describe('large subscriber sets', () => {
    test('many subscribers (20+), only affected buckets notified', () => {
      const selected = signal(0)
      const isSelected = createSelector(() => selected())

      const runCounts: number[] = []
      for (let i = 0; i < 25; i++) {
        const idx = i
        runCounts.push(0)
        effect(() => {
          isSelected(idx)
          runCounts[idx] = (runCounts[idx] ?? 0) + 1
        })
      }

      // All effects ran once
      const allOnes = runCounts.every((c) => c === 1)
      expect(allOnes).toBe(true)

      // Change from 0 to 5: only buckets 0 and 5 should re-run
      selected.set(5)
      expect(runCounts[0]).toBe(2) // deselected
      expect(runCounts[5]).toBe(2) // newly selected
      const unaffectedAfterFirst = runCounts.every((c, i) => i === 0 || i === 5 || c === 1)
      expect(unaffectedAfterFirst).toBe(true)

      // Change from 5 to 24: only buckets 5 and 24 re-run
      selected.set(24)
      expect(runCounts[5]).toBe(3)
      expect(runCounts[24]).toBe(2)
      const unaffectedAfterSecond = runCounts.every((c, i) => [0, 5, 24].includes(i) || c === 1)
      expect(unaffectedAfterSecond).toBe(true)
    })

    test('selector with undefined and null values', () => {
      const selected = signal<string | null | undefined>('a')
      const isSelected = createSelector(() => selected())

      let nullRuns = 0
      let undefRuns = 0
      let aRuns = 0

      effect(() => {
        isSelected(null)
        nullRuns++
      })
      effect(() => {
        isSelected(undefined)
        undefRuns++
      })
      effect(() => {
        isSelected('a')
        aRuns++
      })

      expect(nullRuns).toBe(1)
      expect(undefRuns).toBe(1)
      expect(aRuns).toBe(1)

      // Switch to null
      selected.set(null)
      expect(aRuns).toBe(2) // deselected
      expect(nullRuns).toBe(2) // newly selected
      expect(undefRuns).toBe(1) // unaffected

      // Switch to undefined
      selected.set(undefined)
      expect(nullRuns).toBe(3) // deselected
      expect(undefRuns).toBe(2) // newly selected
      expect(aRuns).toBe(2) // unaffected
    })

    test('rapid selector changes', () => {
      const selected = signal(0)
      const isSelected = createSelector(() => selected())

      let runs0 = 0
      let runs1 = 0
      let runs2 = 0

      effect(() => {
        isSelected(0)
        runs0++
      })
      effect(() => {
        isSelected(1)
        runs1++
      })
      effect(() => {
        isSelected(2)
        runs2++
      })

      // Rapid changes: 0 -> 1 -> 2 -> 0
      selected.set(1)
      selected.set(2)
      selected.set(0)

      // Each affected bucket should have been notified for each change
      // 0->1: runs0+1, runs1+1
      // 1->2: runs1+1, runs2+1
      // 2->0: runs2+1, runs0+1
      expect(runs0).toBe(3) // initial + deselected + reselected
      expect(runs1).toBe(3) // initial + selected + deselected
      expect(runs2).toBe(3) // initial + selected + deselected

      // Final state
      expect(isSelected(0)).toBe(true)
      expect(isSelected(1)).toBe(false)
      expect(isSelected(2)).toBe(false)
    })
  })

  // Regression: pre-fix, the source-tracking effect ran forever AND the
  // per-value subs/hosts Maps grew unboundedly. With dynamic value spaces
  // (UUIDs, ephemeral IDs) this leaked memory for the lifetime of the
  // program. dispose() now stops the effect AND clears both Maps.
  describe('dispose', () => {
    test('stops source-tracking after dispose', () => {
      const selected = signal(0)
      const isSelected = createSelector(() => selected())
      const runs: number[] = []
      effect(() => {
        runs.push(isSelected(1) ? 1 : 0)
      })
      expect(runs).toEqual([0])
      selected.set(1)
      expect(runs).toEqual([0, 1])

      isSelected.dispose()
      // Source change after dispose — the effect that tracks `isSelected(1)`
      // should NOT re-run because the selector's internal effect was stopped.
      selected.set(2)
      expect(runs).toEqual([0, 1])
    })

    test('post-dispose calls return last-known result without tracking', () => {
      const selected = signal(0)
      const isSelected = createSelector(() => selected())
      isSelected.dispose()
      // Last known value was 0 — calls return its match against the query.
      expect(isSelected(0)).toBe(true)
      expect(isSelected(1)).toBe(false)
    })

    test('dispose is idempotent', () => {
      const selected = signal(0)
      const isSelected = createSelector(() => selected())
      expect(() => {
        isSelected.dispose()
        isSelected.dispose()
        isSelected.dispose()
      }).not.toThrow()
    })

    test('post-dispose: source no longer propagates to selector', () => {
      // Observable consequence of stopping the internal effect — proves
      // the per-value Maps are no longer being populated either (because
      // the tracking path is bypassed entirely after dispose).
      const selected = signal('initial')
      const isSelected = createSelector(() => selected())
      // Build up the cache by querying many unique values.
      for (let i = 0; i < 100; i++) isSelected(`uuid-${i}`)
      isSelected.dispose()
      // After dispose, the source is no longer tracked — changing it
      // doesn't propagate to the selector's internal `current` value.
      selected.set('changed')
      expect(isSelected('initial')).toBe(true) // last-known wins
      expect(isSelected('changed')).toBe(false) // never propagated
    })
  })
})

describe('createSelector.bind — effect-free per-key fast path', () => {
  it('calls updater inline with initial state (matches current selection)', () => {
    const selected = signal<string | null>('id-A')
    const isSelected = createSelector(selected)
    const calls: boolean[] = []
    isSelected.subscribe('id-A', (m) => calls.push(m))
    expect(calls).toEqual([true])
  })

  it('calls updater inline with initial state (does NOT match selection)', () => {
    const selected = signal<string | null>('id-A')
    const isSelected = createSelector(selected)
    const calls: boolean[] = []
    isSelected.subscribe('id-B', (m) => calls.push(m))
    expect(calls).toEqual([false])
  })

  it('updater fires on selection change crossing this key (false → true)', () => {
    const selected = signal<string | null>(null)
    const isSelected = createSelector(selected)
    const calls: boolean[] = []
    isSelected.subscribe('id-A', (m) => calls.push(m))
    expect(calls).toEqual([false])
    selected.set('id-A')
    expect(calls).toEqual([false, true])
  })

  it('updater fires on selection change crossing this key (true → false)', () => {
    const selected = signal<string | null>('id-A')
    const isSelected = createSelector(selected)
    const calls: boolean[] = []
    isSelected.subscribe('id-A', (m) => calls.push(m))
    expect(calls).toEqual([true])
    selected.set('id-B')
    expect(calls).toEqual([true, false])
  })

  it('updater does NOT fire on selection change unrelated to this key', () => {
    const selected = signal<string | null>('id-A')
    const isSelected = createSelector(selected)
    const calls: boolean[] = []
    isSelected.subscribe('id-X', (m) => calls.push(m))
    expect(calls).toEqual([false])
    selected.set('id-A')
    selected.set('id-B')
    selected.set('id-C')
    expect(calls).toEqual([false])
  })

  it('dispose removes the updater from the bucket', () => {
    const selected = signal<string | null>(null)
    const isSelected = createSelector(selected)
    const calls: boolean[] = []
    const dispose = isSelected.subscribe('id-A', (m) => calls.push(m))
    expect(calls).toEqual([false])
    dispose()
    selected.set('id-A')
    expect(calls).toEqual([false])
  })

  it('post-dispose .bind calls updater with last-known + returns no-op', () => {
    const selected = signal<string | null>('id-A')
    const isSelected = createSelector(selected)
    isSelected.dispose()
    const calls: boolean[] = []
    const dispose = isSelected.subscribe('id-A', (m) => calls.push(m))
    expect(calls).toEqual([true])
    expect(typeof dispose).toBe('function')
    dispose()
  })

  it('O(1) — only the affected buckets fire on selection change', () => {
    const selected = signal<string | null>(null)
    const isSelected = createSelector(selected)
    let totalCalls = 0
    for (let i = 0; i < 1000; i++) {
      isSelected.subscribe(`row-${i}`, () => {
        totalCalls++
      })
    }
    expect(totalCalls).toBe(1000)
    selected.set('row-500')
    expect(totalCalls).toBe(1001)
    selected.set('row-700')
    expect(totalCalls).toBe(1003)
  })

  it('multiple .bind calls on the same key share the bucket and all fire', () => {
    const selected = signal<string | null>(null)
    const isSelected = createSelector(selected)
    const calls1: boolean[] = []
    const calls2: boolean[] = []
    isSelected.subscribe('id-A', (m) => calls1.push(m))
    isSelected.subscribe('id-A', (m) => calls2.push(m))
    selected.set('id-A')
    expect(calls1).toEqual([false, true])
    expect(calls2).toEqual([false, true])
  })

  it('inline-slot: disposing the SOLE subscriber drops the key; re-subscribe works', () => {
    // The inline-first-subscriber storage (signal `_d1` trick): one
    // subscriber per key is stored as a bare function — dispose must
    // delete the key (not leave a dangling entry), and a fresh subscribe
    // after dispose must work.
    const selected = signal<string | null>(null)
    const isSelected = createSelector(selected)
    const calls: boolean[] = []
    const d = isSelected.subscribe('k', (m) => calls.push(m))
    d()
    selected.set('k') // no subscriber — must not throw, must not call
    expect(calls).toEqual([false]) // only the initial inline call
    const calls2: boolean[] = []
    isSelected.subscribe('k', (m) => calls2.push(m))
    selected.set(null)
    selected.set('k')
    expect(calls2).toEqual([true, false, true])
  })

  it('promoted bucket: disposing ONE of two subscribers keeps the survivor firing', () => {
    const selected = signal<string | null>(null)
    const isSelected = createSelector(selected)
    const calls1: boolean[] = []
    const calls2: boolean[] = []
    const d1 = isSelected.subscribe('k', (m) => calls1.push(m))
    isSelected.subscribe('k', (m) => calls2.push(m)) // promotes to Set
    d1()
    selected.set('k')
    expect(calls1).toEqual([false]) // disposed before the change
    expect(calls2).toEqual([false, true]) // survivor still fires
  })

  it('inline-slot dispose is identity-safe: disposing does not affect a DIFFERENT key', () => {
    const selected = signal<string | null>(null)
    const isSelected = createSelector(selected)
    const callsA: boolean[] = []
    const callsB: boolean[] = []
    const dA = isSelected.subscribe('a', (m) => callsA.push(m))
    isSelected.subscribe('b', (m) => callsB.push(m))
    dA()
    selected.set('b')
    expect(callsB).toEqual([false, true])
  })

  it('a THIRD subscriber on the same key is added to the existing Set (no re-promote)', () => {
    const selected = signal<string | null>(null)
    const isSelected = createSelector(selected)
    const c1: boolean[] = []
    const c2: boolean[] = []
    const c3: boolean[] = []
    isSelected.subscribe('k', (m) => c1.push(m)) // bare
    isSelected.subscribe('k', (m) => c2.push(m)) // promote → Set
    isSelected.subscribe('k', (m) => c3.push(m)) // existing.add (the 3rd path)
    selected.set('k')
    // All three fire on selection — proves the 3rd was added to the live Set.
    expect(c1).toEqual([false, true])
    expect(c2).toEqual([false, true])
    expect(c3).toEqual([false, true])
  })

  it('a multi-subscriber key fires every subscriber with false when selection LEAVES it', () => {
    const selected = signal<string | null>('k') // 'k' selected to start
    const isSelected = createSelector(selected)
    const c1: boolean[] = []
    const c2: boolean[] = []
    isSelected.subscribe('k', (m) => c1.push(m)) // initial true
    isSelected.subscribe('k', (m) => c2.push(m)) // initial true (Set of 2)
    selected.set('other') // selection leaves 'k' → the Set bucket fires false
    expect(c1).toEqual([true, false])
    expect(c2).toEqual([true, false])
  })

  it('interop — .bind subscribers coexist with selector() inside effect', () => {
    const selected = signal<string | null>(null)
    const isSelected = createSelector(selected)
    const bindCalls: boolean[] = []
    const effectCalls: boolean[] = []
    isSelected.subscribe('id-A', (m) => bindCalls.push(m))
    const eff = effect(() => {
      effectCalls.push(isSelected('id-A'))
    })
    expect(bindCalls).toEqual([false])
    expect(effectCalls).toEqual([false])
    selected.set('id-A')
    expect(bindCalls).toEqual([false, true])
    expect(effectCalls).toEqual([false, true])
    eff.dispose()
  })
})
