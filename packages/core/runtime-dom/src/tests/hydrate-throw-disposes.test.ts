/**
 * A throw while hydrating a component's subtree escaped `hydrateComponent`:
 * unlike `mountComponent`, its `hydrateChild` call had no try/catch. The throw
 * left `hydrateRoot` with no cleanup to return, so everything hydrated before
 * it (a sibling's effects) could never be disposed, and the context owner was
 * left pointing at the component that threw.
 *
 * Hydration now does what a mount does for the same throw: the throwing
 * component's scope is stopped, the owner restored, the error routed to the
 * nearest error boundary (or logged), and the walk continues — so the root
 * returns a cleanup that disposes what did hydrate.
 */
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { effect, getContextOwner, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateRoot, mount } from '../index'

function tree() {
  const g = signal(0)
  const counter = { runs: 0 }
  const A = (): VNodeChild => {
    effect(() => {
      g()
      counter.runs++
    })

    return h('span', null, 'a')
  }
  const B = (): VNodeChild =>
    h('p', null, () => {
      throw new Error('B exploded')
    })
  const App = (): VNodeChild => h('div', null, h(A, null), h(B, null))

  return { App, g, counter }
}

describe('a throw during hydration', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('is contained like a mount-time throw: owner restored, siblings disposable', () => {
    const { App, g, counter } = tree()
    const container = document.createElement('div')
    container.innerHTML = '<div><span>a</span><p></p></div>'

    let unmount: (() => void) | undefined
    let escaped: unknown
    try {
      unmount = hydrateRoot(container, h(App, null))
    } catch (err) {
      escaped = err
    }

    expect(escaped).toBeUndefined()
    expect(getContextOwner()).toBeNull()
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[1]).includes('B exploded'))).toBe(true)
    expect(counter.runs).toBe(1)
    unmount!()
    g.set(1)
    // Disposed with the root: A's effect no longer runs.
    expect(counter.runs).toBe(1)
  })

  it('matches what mount() does with the same tree', () => {
    const { App, g, counter } = tree()
    const container = document.createElement('div')
    const unmount = mount(h(App, null), container)
    expect(getContextOwner()).toBeNull()
    expect(counter.runs).toBe(1)
    unmount()
    g.set(1)
    expect(counter.runs).toBe(1)
  })
})
