/**
 * `useBlocker`'s shared `beforeunload` listener — the refcount.
 *
 * One `beforeunload` listener is shared by every blocker. Its own comment
 * states the reason: "Avoids listener accumulation from multiple useBlocker()
 * calls." That is leak class D from the repo's catalogue — a shared global
 * listener with no refcount piles up one registration per caller — and the
 * refcount that prevents it had no test.
 *
 * Both directions fail silently, which is why they need pinning:
 *
 *   * retain not guarded -> N listeners for N blockers, each firing on every
 *     unload attempt, and N-1 of them outliving their component;
 *   * release not guarded -> the FIRST component to unmount removes the
 *     listener for everyone, so the remaining blockers stop warning about
 *     unsaved work. Nothing throws; the guard is just gone.
 *
 * The floor at zero matters too: an unbalanced release must not drive the
 * count negative, or the next retain sees a non-zero count and never
 * registers, leaving the app permanently unguarded.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, RouterProvider, useBlocker } from '../index'
import { setActiveRouter } from '../router'
import type { RouteRecord } from '../types'

const Page = () => null
const routes: RouteRecord[] = [{ path: '/', component: Page }]

/** Count add/remove of the beforeunload listener only. */
function trackBeforeUnload(): {
  adds: number
  removes: number
  restore: () => void
} {
  const state = { adds: 0, removes: 0, restore: () => undefined as void }
  const realAdd = window.addEventListener.bind(window)
  const realRemove = window.removeEventListener.bind(window)
  window.addEventListener = ((type: string, fn: EventListener, opts?: unknown) => {
    if (type === 'beforeunload') state.adds++
    return realAdd(type, fn, opts as never)
  }) as typeof window.addEventListener
  window.removeEventListener = ((type: string, fn: EventListener, opts?: unknown) => {
    if (type === 'beforeunload') state.removes++
    return realRemove(type, fn, opts as never)
  }) as typeof window.removeEventListener
  state.restore = () => {
    window.addEventListener = realAdd as typeof window.addEventListener
    window.removeEventListener = realRemove as typeof window.removeEventListener
  }
  return state
}

/** Mount a component that registers `n` blockers; returns unmount + handles. */
function mountBlockers(n: number): { unmount: () => void; handles: { remove: () => void }[] } {
  const router = createRouter({ routes, url: '/' })
  setActiveRouter(router as never)
  const handles: { remove: () => void }[] = []
  const Comp = () => {
    for (let i = 0; i < n; i++) handles.push(useBlocker(() => true))
    return null
  }
  const ctr = document.createElement('div')
  document.body.appendChild(ctr)
  const unmount = mount(h(RouterProvider, { router }, h(Comp, {})), ctr)
  return { unmount, handles }
}

afterEach(() => {
  setActiveRouter(null)
  document.body.innerHTML = ''
})

describe('useBlocker — the shared beforeunload listener is refcounted', () => {
  test('THREE blockers register exactly ONE listener', () => {
    // Leak class D in its plainest form: without the `=== 0` guard this is 3.
    const t = trackBeforeUnload()
    try {
      const { unmount } = mountBlockers(3)
      expect(t.adds, 'one shared listener, however many blockers').toBe(1)
      unmount()
    } finally {
      t.restore()
    }
  })

  test('removing ONE of three does not unregister the other two', () => {
    // The dangerous direction. Nothing throws when this breaks — the app
    // simply stops warning about unsaved work, and only for users who
    // happened to unmount one blocker first.
    const t = trackBeforeUnload()
    try {
      const { unmount, handles } = mountBlockers(3)
      handles[0]!.remove()
      expect(t.removes, 'two blockers still need the listener').toBe(0)
      handles[1]!.remove()
      expect(t.removes).toBe(0)
      handles[2]!.remove()
      expect(t.removes, 'the last one out turns off the light').toBe(1)
      unmount()
    } finally {
      t.restore()
    }
  })

  test('unmounting the component releases every blocker it registered', () => {
    // `onUnmount` removes each blocker; the count must land back at zero so a
    // later mount registers a fresh listener rather than believing one is up.
    const t = trackBeforeUnload()
    try {
      const first = mountBlockers(2)
      expect(t.adds).toBe(1)
      first.unmount()
      expect(t.removes, 'unmount must release both').toBe(1)

      const second = mountBlockers(1)
      expect(t.adds, 'a later mount registers again from zero').toBe(2)
      second.unmount()
    } finally {
      t.restore()
    }
  })

  test('an over-release cannot drive the count negative', () => {
    // If it could, the next retain would see a non-zero count, skip
    // registration, and leave the app permanently unguarded — a failure that
    // outlives the component that caused it.
    const t = trackBeforeUnload()
    try {
      const { unmount, handles } = mountBlockers(1)
      handles[0]!.remove()
      expect(t.removes).toBe(1)
      // Double-remove: idempotent by contract, and must not go below zero.
      handles[0]!.remove()
      handles[0]!.remove()
      unmount()

      const after = mountBlockers(1)
      expect(t.adds, 'registration still works after an over-release').toBe(2)
      after.unmount()
    } finally {
      t.restore()
    }
  })
})
