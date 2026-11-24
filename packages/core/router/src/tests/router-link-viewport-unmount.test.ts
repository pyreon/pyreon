import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { RouterLink, RouterProvider } from '../components'
import { createRouter } from '../router'

/**
 * `<RouterLink prefetch="viewport">` started observing its anchor from a
 * `queueMicrotask` scheduled at setup. A link unmounted before that microtask
 * ran (a list re-render, a route swap in the same tick) had already had its
 * ref cleared, so the microtask called `observer.observe(null)` — an uncaught
 * TypeError in every browser ("parameter 1 is not of type 'Element'") — and an
 * observer for a dead link could be left observing.
 */
type Observed = { target: unknown; disconnected: boolean }
let calls: Observed[] = []
const origIO = globalThis.IntersectionObserver

beforeEach(() => {
  calls = []
  globalThis.IntersectionObserver = class {
    private rec: Observed | null = null

    observe(target: unknown) {
      this.rec = { target, disconnected: false }
      calls.push(this.rec)
    }

    disconnect() {
      if (this.rec) this.rec.disconnected = true
    }

    unobserve() {}

    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
})

afterEach(() => {
  globalThis.IntersectionObserver = origIO
})

const routes = [
  { path: '/', component: () => h('main', null, 'home') },
  { path: '/next', component: () => h('main', null, 'next') },
]

describe('RouterLink viewport prefetch and unmount', () => {
  test('a link unmounted in the same tick never observes a null target', async () => {
    const router = createRouter({ routes, url: '/' })
    const container = document.createElement('div')
    const unmount = mount(
      h(RouterProvider, { router }, h(RouterLink, { to: '/next', prefetch: 'viewport' }, 'next')),
      container,
    )
    unmount()
    await new Promise<void>((r) => setTimeout(r, 0))
    expect(calls.map((c) => c.target)).not.toContain(null)
    expect(calls.every((c) => c.disconnected)).toBe(true)
  })

  test('a mounted link observes its anchor and disconnects on unmount', async () => {
    const router = createRouter({ routes, url: '/' })
    const container = document.createElement('div')
    const unmount = mount(
      h(RouterProvider, { router }, h(RouterLink, { to: '/next', prefetch: 'viewport' }, 'next')),
      container,
    )
    await new Promise<void>((r) => setTimeout(r, 0))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.target).toBe(container.querySelector('a'))
    unmount()
    expect(calls[0]!.disconnected).toBe(true)
  })
})
