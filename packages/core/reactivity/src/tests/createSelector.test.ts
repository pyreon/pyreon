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
})
