import { effect } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { useField, useFieldArray, useForm } from '../index'

/**
 * Notification-count contracts for the `{ equals }`-gated computeds.
 *
 * These assert COUNTS, not values — the values were already correct without the
 * gate, which is precisely why the waste was invisible. Counts are deterministic
 * and load-independent, so these are stable under parallel CI.
 *
 * Bisect recipe: drop `{ equals: Object.is }` from the computed under test and
 * the matching spec fails with the higher count.
 */

function Capture<T>({ fn }: { fn: () => T }) {
  fn()
  return null
}

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    <Capture
      fn={() => {
        result = fn()
      }}
    />,
    el,
  )
  // `mountWith` has NO auto-cleanup — every caller must unmount, or the mounted
  // component, its effects and this element leak into later tests.
  return { result: result!, unmount: () => { unmount(); el.remove() } }
}

describe('{ equals } gating — notification counts', () => {
  it('useFieldArray().length does NOT re-notify when a reorder leaves the count alone', () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(['a', 'b', 'c', 'd']))

    let runs = 0
    const fx = effect(() => {
      arr.length()
      runs++
    })
    expect(runs).toBe(1) // initial

    // Four operations that all change `items` IDENTITY while leaving length at 4.
    arr.move(1, 3)
    arr.move(0, 2)
    arr.swap(0, 1)
    arr.swap(2, 3)

    expect(arr.values()).toHaveLength(4)
    expect(runs).toBe(1) // ← un-gated this is 5

    fx.dispose()
    unmount()
  })

  it('still notifies when the length ACTUALLY changes — the gate must not over-suppress', () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(['a']))

    let runs = 0
    const fx = effect(() => {
      arr.length()
      runs++
    })
    expect(runs).toBe(1)

    arr.append('b')
    expect(runs).toBe(2)
    arr.remove(0)
    expect(runs).toBe(3)

    fx.dispose()
    unmount()
  })
})
