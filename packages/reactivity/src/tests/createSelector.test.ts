import { createSelector } from "../createSelector"
import { effect } from "../effect"
import { signal } from "../signal"

describe("createSelector", () => {
  test("returns true for the currently selected value", () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    let result = false
    effect(() => {
      result = isSelected(1)
    })
    expect(result).toBe(true)
  })

  test("returns false for non-selected values", () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    let result = true
    effect(() => {
      result = isSelected(2)
    })
    expect(result).toBe(false)
  })

  test("only notifies affected subscribers when selection changes", () => {
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

  test("does not notify when source changes to the same value", () => {
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

  test("works when changing to a value with no subscribers", () => {
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

  test("reuses host objects for the same value", () => {
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

  test("tracks correctly outside an effect (no activeEffect)", () => {
    const selected = signal(1)
    const isSelected = createSelector(() => selected())

    // Calling outside an effect should still return the correct boolean
    expect(isSelected(1)).toBe(true)
    expect(isSelected(2)).toBe(false)
  })
})
