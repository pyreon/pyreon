import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mountCallbacks: Array<() => void> = []
let unmountCallbacks: Array<() => void> = []

// Mock only @pyreon/core's onMount (collect + fire manually); use the REAL
// @pyreon/reactivity so `watch` actually tracks the signal transition.
vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(() => {
      const ret = fn()
      if (typeof ret === 'function') unmountCallbacks.push(ret as () => void)
    })
  },
}))

import { signal } from '@pyreon/reactivity'
import { useFocusReturn } from '../useFocusReturn'

const tick = () => new Promise<void>((r) => queueMicrotask(r))

describe('useFocusReturn', () => {
  let trigger: HTMLButtonElement
  let inside: HTMLButtonElement

  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    trigger = document.createElement('button')
    inside = document.createElement('button')
    document.body.append(trigger, inside)
  })

  afterEach(() => {
    trigger.remove()
    inside.remove()
  })

  it('restores focus to the opener when isOpen flips false', async () => {
    const open = signal(false)
    useFocusReturn(() => open())
    mountCallbacks.forEach((cb) => cb())

    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    open.set(true) // captures the trigger (active element at open time)
    await tick()
    inside.focus() // focus moves into the overlay
    expect(document.activeElement).toBe(inside)

    open.set(false) // restores focus to the captured trigger
    await tick()
    expect(document.activeElement).toBe(trigger)
  })

  it('restores to an explicit returnTo target when provided', async () => {
    const open = signal(false)
    useFocusReturn(() => open(), { returnTo: () => inside })
    mountCallbacks.forEach((cb) => cb())

    trigger.focus()
    open.set(true)
    await tick()
    open.set(false)
    await tick()
    expect(document.activeElement).toBe(inside) // returnTo wins over the captured opener
  })

  it('does nothing while it never opens', async () => {
    const open = signal(false)
    useFocusReturn(() => open())
    mountCallbacks.forEach((cb) => cb())

    trigger.focus()
    await tick()
    // no open/close cycle → focus is untouched
    expect(document.activeElement).toBe(trigger)
  })
})
