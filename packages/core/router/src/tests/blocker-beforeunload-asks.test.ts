/**
 * `useBlocker`'s `beforeunload` handler ASKS the blockers (#4358).
 *
 * It used to call `preventDefault()` unconditionally, so closing or reloading
 * the tab showed "Leave site?" whenever any blocker was mounted, even one that
 * never blocks (`useBlocker(() => false)`, or a dirty-form blocker on a clean
 * form). Now the prompt shows only when a blocker says to block; see
 * `BlockerOptions.beforeUnload` for async blockers and explicit control.
 *
 * Bisect-verified: with the unconditional handler the "does not prompt" specs
 * fail (`expected true to be false`).
 * Real-Chromium coverage: `blocker-beforeunload.browser.test.ts`.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, RouterProvider, useBlocker } from '../index'
import { setActiveRouter } from '../router'
import type { BlockerFn, BlockerOptions, RouteRecord } from '../types'

const Page = () => null
const routes: RouteRecord[] = [{ path: '/', component: Page }]

const unloadPrompts = (): boolean => {
  const e = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(e)
  return e.defaultPrevented
}

// Every mount is torn down after each test, so a failing spec cannot leave a
// registered blocker behind for the next one.
const mounted: (() => void)[] = []

function mountBlocker(fn: BlockerFn, options?: BlockerOptions) {
  const router = createRouter({ routes, url: '/' })
  setActiveRouter(router as never)
  let handle: { remove: () => void } | undefined
  const Comp = () => {
    handle = useBlocker(fn, options)
    return null
  }
  const ctr = document.createElement('div')
  document.body.appendChild(ctr)
  const dispose = mount(h(RouterProvider, { router }, h(Comp, {})), ctr)
  let done = false
  const unmount = () => {
    if (done) return
    done = true
    dispose()
    router.destroy()
  }
  mounted.push(unmount)
  return { unmount, handle: handle!, router }
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount()
  setActiveRouter(null)
  document.body.innerHTML = ''
})

describe('useBlocker — beforeunload asks the blockers', () => {
  test('a blocker that returns false does not prompt', () => {
    const { unmount } = mountBlocker(() => false)
    expect(unloadPrompts()).toBe(false)
    unmount()
  })

  test('a dirty-form blocker prompts only while dirty, and sees the current route', () => {
    const dirty = signal(false)
    const seen: string[] = []
    const { unmount } = mountBlocker((to, from) => {
      seen.push(`${from.path}->${to.path}`)
      return dirty()
    })
    expect(unloadPrompts()).toBe(false)
    dirty.set(true)
    expect(unloadPrompts()).toBe(true)
    expect(seen).toEqual(['/->/', '/->/'])
    unmount()
    expect(unloadPrompts(), 'no prompt once the blocker is gone').toBe(false)
  })

  test('one blocking blocker among non-blocking ones prompts', () => {
    const a = mountBlocker(() => false)
    const b = mountBlocker(() => true)
    expect(unloadPrompts()).toBe(true)
    b.unmount()
    expect(unloadPrompts()).toBe(false)
    a.unmount()
  })

  test('an async blocker counts as blocking (it cannot be awaited)', () => {
    const { unmount } = mountBlocker(async () => false)
    expect(unloadPrompts()).toBe(true)
    unmount()
  })

  test('the beforeUnload option overrides the blocker', () => {
    const never = mountBlocker(() => true, { beforeUnload: false })
    expect(unloadPrompts()).toBe(false)
    never.unmount()
    const always = mountBlocker(() => false, { beforeUnload: true })
    expect(unloadPrompts()).toBe(true)
    always.unmount()
    const dirty = signal(false)
    const fn = mountBlocker(async () => true, { beforeUnload: () => dirty() })
    expect(unloadPrompts()).toBe(false)
    dirty.set(true)
    expect(unloadPrompts()).toBe(true)
    fn.unmount()
  })

  test('a throwing blocker prompts (the safe answer)', () => {
    const { unmount } = mountBlocker(() => {
      throw new Error('boom')
    })
    expect(unloadPrompts()).toBe(true)
    unmount()
  })

  test('router.destroy() drops its blockers from the unload registry', () => {
    const { router, unmount } = mountBlocker(() => true)
    router.destroy()
    expect(unloadPrompts()).toBe(false)
    unmount()
  })

  test('a double remove does not evict another blocker', () => {
    const a = mountBlocker(() => true)
    const b = mountBlocker(() => false)
    b.handle.remove()
    b.handle.remove()
    expect(unloadPrompts(), 'a is still registered').toBe(true)
    a.unmount()
    b.unmount()
  })
})
