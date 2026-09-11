/**
 * A component unmounted before its effects flush must not run them.
 *
 * `scheduleEffects` defers into a microtask, so there is always a window
 * between render and effect in which the component can go away — a route
 * change, a `<Show>` flipping, a parent re-render that drops the child. The
 * guard inside the loop is what stops the effect executing against a
 * torn-down context.
 *
 * It matters because the failure is silent. An `onMount` that runs after
 * unmount does not throw: it subscribes to something, starts a timer, or
 * writes to a signal whose owner is already disposed, and the work simply
 * leaks. Nothing in the output says a component that no longer exists is
 * still doing things.
 *
 * Note what is NOT covered here, deliberately. `runLayoutEffects` and the
 * `typeof cleanup === 'function'` arms beside it are unreachable through
 * the shipped API: nothing pushes to `pendingLayoutEffects`, and
 * `onMount`'s wrapper returns `undefined` unconditionally, so a stored
 * cleanup is never a function. Covering them would mean calling internals
 * directly, which asserts nothing about what a consumer can do.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { onMount } from '../index'
import { jsx } from '../jsx-runtime'

/** Two turns: one for the scheduling microtask, one for anything it queues. */
const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((r) => setTimeout(r, 0))
}

let hosts: HTMLElement[] = []

const host = (): HTMLElement => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  hosts.push(el)
  return el
}

afterEach(() => {
  for (const h of hosts) h.remove()
  hosts = []
})

describe('effects deferred to a microtask respect unmount', () => {
  it('runs onMount for a component that stays mounted', async () => {
    // The control. Without it the spec below passes against a runtime that
    // never runs effects at all — which would be a far worse bug and would
    // look identical from the assertion's side.
    let ran = 0
    const C = (): null => {
      onMount(() => {
        ran += 1
      })
      return null
    }

    mount(h(jsx(C as never, {}).type as never, {}), host())
    await flush()

    expect(ran, 'a mounted component must get its effect').toBe(1)
  })

  it('does NOT run onMount when the component unmounts first', async () => {
    // The window between render and the microtask. An effect that runs
    // here subscribes, or times, or writes into a disposed owner — and
    // says nothing about it.
    let ran = 0
    const C = (): null => {
      onMount(() => {
        ran += 1
      })
      return null
    }

    const dispose = mount(h(jsx(C as never, {}).type as never, {}), host())
    dispose()
    await flush()

    expect(ran, 'an unmounted component must not run its effect').toBe(0)
  })

  it('unmounting AFTER the flush leaves the effect already run', async () => {
    // The boundary on the other side: the guard must not retroactively
    // suppress an effect that legitimately ran while mounted.
    let ran = 0
    const C = (): null => {
      onMount(() => {
        ran += 1
      })
      return null
    }

    const dispose = mount(h(jsx(C as never, {}).type as never, {}), host())
    await flush()
    expect(ran).toBe(1)

    dispose()
    await flush()
    expect(ran, 'and it does not run a second time').toBe(1)
  })
})
