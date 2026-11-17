/**
 * Real-Chromium lifecycle suite for islands (#4387): an island's lifetime ends
 * when its DOM leaves the document, whatever removed it.
 *
 * Every removal path below funnels into ONE dispose — the function
 * `scheduleHydration` returns. It cancels a trigger that has not fired yet
 * (IntersectionObserver / idle callback / matchMedia listener / interaction
 * listeners), stops an in-flight hydration from mounting after its chunk
 * lands, and unmounts a hydrated root (`onUnmount`, effects, `onMount`
 * cleanups). Its callers:
 *   - the `island()` marker's `onUnmount` (zero routes, `<Show>`, `<For>`, a
 *     parent re-render, Suspense, router navigation and the router HMR swap —
 *     all of which unmount the marker component);
 *   - the cleanup `hydrateIslands()` returns (static pages: the host decides
 *     when the page is over; a host that replaces island DOM itself calls it).
 *
 * The probe island counts what a leaked instance keeps doing: interval ticks,
 * an effect re-running on an outside signal, a window listener firing.
 *
 * This file is compiled by vite's JSX transform, not Pyreon's compiler — it
 * uses `h()` throughout so nothing depends on the compiler's lowering.
 */

import type { ComponentFn } from '@pyreon/core'
import { For, h, lazy, onMount, onUnmount, Show, Suspense } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { createRouter, RouterProvider, RouterView, setActiveRouter } from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'
import { query } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrateIslands } from '../client'
import type { HydrationStrategy, PrefetchStrategy } from '../island'
import { island } from '../island'

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

const waitFor = async (cond: () => boolean, timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await flush()
    if (cond()) return
    if (Date.now() > deadline) throw new Error(`waitFor: condition not met within ${timeoutMs}ms`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** An outside signal the probe's effect reads — a leaked effect re-runs on it. */
// pyreon-lint-disable-next-line pyreon/prefer-request-context -- a test fixture, not server state; no requests run here
const outside = signal(0)

interface Stats {
  loads: number
  mounts: number
  unmounts: number
  mountCleanups: number
  effectRuns: number
  ticks: number
  windowHits: number
  live: number
}

const stats: Stats = {
  loads: 0,
  mounts: 0,
  unmounts: 0,
  mountCleanups: 0,
  effectRuns: 0,
  ticks: 0,
  windowHits: 0,
  live: 0,
}

const resetStats = () => {
  for (const k of Object.keys(stats) as (keyof Stats)[]) stats[k] = 0
}

const Probe: ComponentFn = () => {
  effect(() => {
    outside()
    stats.effectRuns++
  })
  onMount(() => {
    stats.mounts++
    stats.live++
    const id = setInterval(() => stats.ticks++, 5)
    const onPing = () => stats.windowHits++
    window.addEventListener('probe-ping', onPing)

    return () => {
      stats.mountCleanups++
      clearInterval(id)
      window.removeEventListener('probe-ping', onPing)
    }
  })
  onUnmount(() => {
    stats.unmounts++
    stats.live--
  })

  return h('button', { type: 'button', 'data-testid': 'probe' }, 'probe')
}

let loaderGate: Promise<void> | null = null

const probeLoader = async () => {
  stats.loads++
  if (loaderGate) await loaderGate
  return { default: Probe }
}

let islandSeq = 0

const makeIsland = (hydrate: HydrationStrategy = 'load', prefetch: PrefetchStrategy = 'none') =>
  island(probeLoader, { name: `Probe${++islandSeq}`, hydrate, prefetch })

/** Assert a disposed instance is fully dead: nothing it registered still runs. */
const expectDead = async () => {
  const before = { ...stats }
  outside.set(outside.peek() + 1)
  window.dispatchEvent(new Event('probe-ping'))
  await sleep(40)
  expect(stats.effectRuns).toBe(before.effectRuns)
  expect(stats.windowHits).toBe(before.windowHits)
  expect(stats.ticks).toBe(before.ticks)
}

/**
 * Replace the idle-callback API with one that only queues: a real idle period
 * can arrive within a millisecond, before the test removes the island. `run()`
 * fires whatever is still queued, as an idle period would.
 */
const trackIdle = () => {
  const ric = window.requestIdleCallback
  const cic = window.cancelIdleCallback
  const queued = new Map<number, IdleRequestCallback>()
  let next = 1
  window.requestIdleCallback = (cb) => {
    const id = next++
    queued.set(id, cb)
    return id
  }
  window.cancelIdleCallback = (id) => {
    queued.delete(id)
  }

  return {
    pending: () => queued.size,
    run: () => {
      for (const [id, cb] of [...queued]) {
        queued.delete(id)
        cb({ didTimeout: false, timeRemaining: () => 50 })
      }
    },
    restore: () => {
      window.requestIdleCallback = ric
      window.cancelIdleCallback = cic
    },
  }
}

const hosts: HTMLElement[] = []
const unmounts: (() => void)[] = []

/** `mount` into a fresh host; the instance is unmounted after the test. */
const mountHere = (vnode: Parameters<typeof mount>[0], el = host()) => {
  const u = mount(vnode, el)
  unmounts.push(u)
  return u
}

const host = () => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  hosts.push(el)

  return el
}

afterEach(() => {
  for (const u of unmounts.splice(0)) u()
  for (const el of hosts.splice(0)) el.remove()
  for (const el of document.querySelectorAll('pyreon-island')) el.remove()
  loaderGate = null
  resetStats()
})

describe('island lifecycle — every removal path disposes the island (#4387)', () => {
  it('<Show> removing a hydrated island runs onUnmount once and stops effects, timers and listeners', async () => {
    const Isle = makeIsland('load')
    const on = signal(true)
    const unmount = mountHere(h(Show, { when: () => on() }, h(Isle, null)))
    await waitFor(() => stats.mounts === 1)
    await sleep(30)
    expect(stats.ticks).toBeGreaterThan(0)

    on.set(false)
    await flush()
    expect(stats.unmounts).toBe(1)
    expect(stats.mountCleanups).toBe(1)
    expect(stats.live).toBe(0)
    await expectDead()
    unmount()
    expect(stats.unmounts).toBe(1)
  })

  it('<For> removing a row disposes only that row\'s island', async () => {
    const Isle = makeIsland('load')
    const rows = signal([1, 2, 3])
    mountHere(
      h(For<number>, {
        each: rows,
        by: (r) => r,
        children: (r) => h('div', { 'data-row': r }, h(Isle, null)),
      }),
    )
    await waitFor(() => stats.mounts === 3)
    rows.set([1, 3])
    await flush()
    expect(stats.unmounts).toBe(1)
    expect(stats.live).toBe(2)
    rows.set([])
    await flush()
    expect(stats.unmounts).toBe(3)
    await expectDead()
  })

  it('a parent re-render that replaces the island host disposes the old instance and hydrates a new one', async () => {
    const Isle = makeIsland('load')
    const key = signal(0)
    mountHere(h('section', null, () => (key(), h('div', null, h(Isle, null)))))
    await waitFor(() => stats.mounts === 1)
    key.set(1)
    await waitFor(() => stats.mounts === 2)
    expect(stats.unmounts).toBe(1)
    expect(stats.live).toBe(1)
  })

  it('a Suspense fallback island is disposed when the content resolves', async () => {
    const Isle = makeIsland('load')
    let release!: () => void
    const ready = new Promise<void>((r) => (release = r))
    const Content = lazy(async () => {
      await ready
      return { default: () => h('p', { 'data-testid': 'content' }, 'content') }
    })
    const el = host()
    mountHere(h(Suspense, { fallback: h(Isle, null) }, h(Content, null)), el)
    await waitFor(() => stats.mounts === 1)
    release()
    await waitFor(() => el.querySelector('[data-testid="content"]') !== null)
    expect(stats.unmounts).toBe(1)
    await expectDead()
  })

  it('router navigation away disposes the island; back hydrates exactly one fresh instance', async () => {
    const Isle = makeIsland('load')
    const PageA = () => h('div', { id: 'page-a' }, h(Isle, null))
    const PageB = () => h('div', { id: 'page-b' }, 'B')
    const router = createRouter({
      mode: 'hash',
      routes: [
        { path: '/', component: PageB },
        { path: '/a', component: PageA },
        { path: '/b', component: PageB },
        { path: '*', component: PageB },
      ],
    })
    const unmount = mount(h(RouterProvider, { router }, h(RouterView, null)), host())
    try {
      await router.push('/a')
      await waitFor(() => stats.mounts === 1)
      await router.push('/b')
      await waitFor(() => document.getElementById('page-b') !== null)
      expect(stats.unmounts).toBe(1)
      expect(stats.mountCleanups).toBe(1)
      await expectDead()

      router.back()
      await waitFor(() => stats.mounts === 2)
      await sleep(30)
      expect(stats.mounts).toBe(2)
      expect(stats.live).toBe(1)
    } finally {
      unmount()
      router.destroy()
      setActiveRouter(null)
      location.hash = ''
    }
  })

  it('cross-layout navigation disposes an island that lives in the layout being left', async () => {
    const Isle = makeIsland('load')
    const LayoutA = () => h('div', { id: 'layout-a' }, h(Isle, null), h(RouterView, null))
    const LayoutB = () => h('div', { id: 'layout-b' }, h(RouterView, null))
    const Leaf = () => h('p', null, 'leaf')
    const router = createRouter({
      mode: 'hash',
      routes: [
        { path: '/', component: Leaf },
        { path: '/x', component: LayoutA, children: [{ path: 'one', component: Leaf }, { path: 'two', component: Leaf }] },
        { path: '/y', component: LayoutB, children: [{ path: 'one', component: Leaf }] },
        { path: '*', component: Leaf },
      ],
    })
    const unmount = mount(h(RouterProvider, { router }, h(RouterView, null)), host())
    try {
      await router.push('/x/one')
      await waitFor(() => stats.mounts === 1)
      // Same layout, different leaf: the layout's island stays.
      await router.push('/x/two')
      await sleep(30)
      expect(stats.unmounts).toBe(0)
      expect(stats.live).toBe(1)
      // Different layout: it goes.
      await router.push('/y/one')
      await waitFor(() => document.getElementById('layout-b') !== null)
      expect(stats.unmounts).toBe(1)
      await expectDead()
    } finally {
      unmount()
      router.destroy()
      setActiveRouter(null)
      location.hash = ''
    }
  })

  it('50 navigations away and back keep exactly one live instance (no growth)', async () => {
    const Isle = makeIsland('load')
    const PageA = () => h('div', { id: 'page-a' }, h(Isle, null))
    const PageB = () => h('div', { id: 'page-b' }, 'B')
    const router = createRouter({
      mode: 'hash',
      routes: [
        { path: '/', component: PageB },
        { path: '/a', component: PageA },
        { path: '/b', component: PageB },
        { path: '*', component: PageB },
      ],
    })
    const unmount = mount(h(RouterProvider, { router }, h(RouterView, null)), host())
    const N = 50
    let maxLive = 0
    try {
      for (let i = 1; i <= N; i++) {
        await router.push('/a')
        await waitFor(() => stats.mounts === i)
        maxLive = Math.max(maxLive, stats.live)
        await router.push('/b')
        await waitFor(() => stats.unmounts === i)
      }
      expect(maxLive).toBe(1)
      expect(stats.mounts).toBe(N)
      expect(stats.unmounts).toBe(N)
      expect(stats.mountCleanups).toBe(N)
      expect(stats.live).toBe(0)
      expect(document.querySelectorAll('pyreon-island').length).toBe(0)
      await expectDead()
    } finally {
      unmount()
      router.destroy()
      setActiveRouter(null)
      location.hash = ''
    }
  })
})

describe('island lifecycle — a trigger that has not fired is cancelled on removal (#4387)', () => {
  it('load: removal while the chunk is in flight never mounts the island', async () => {
    let release!: () => void
    loaderGate = new Promise<void>((r) => (release = r))
    const Isle = makeIsland('load')
    const on = signal(true)
    mountHere(h(Show, { when: () => on() }, h(Isle, null)))
    await waitFor(() => stats.loads === 1)
    on.set(false)
    release()
    await sleep(40)
    expect(stats.mounts).toBe(0)
    await expectDead()
  })

  it('idle: removal before the idle callback means the chunk is never requested', async () => {
    const idle = trackIdle()
    try {
      const Isle = makeIsland('idle')
      const on = signal(true)
      mountHere(h(Show, { when: () => on() }, h(Isle, null)))
      await waitFor(() => idle.pending() === 1)
      on.set(false)
      await flush()
      expect(idle.pending()).toBe(0)
      idle.run()
      await sleep(40)
      expect(stats.loads).toBe(0)
      expect(stats.mounts).toBe(0)
    } finally {
      idle.restore()
    }
  })

  it('visible: removal disconnects the IntersectionObserver', async () => {
    const live = new Set<IntersectionObserver>()
    const Native = window.IntersectionObserver
    class Tracked extends Native {
      constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
        super(cb, opts)
        live.add(this)
      }

      override disconnect(): void {
        live.delete(this)
        super.disconnect()
      }
    }
    window.IntersectionObserver = Tracked
    try {
      const Isle = makeIsland('visible', 'visible')
      const spacer = host()
      spacer.style.height = '5000px'
      const on = signal(true)
      mountHere(h(Show, { when: () => on() }, h(Isle, null)))
      await waitFor(() => live.size === 2) // hydration trigger + prefetch trigger
      on.set(false)
      await flush()
      expect(live.size).toBe(0)
      expect(stats.loads).toBe(0)
    } finally {
      window.IntersectionObserver = Native
    }
  })

  it('media: removal removes the matchMedia change listener', async () => {
    const proto = MediaQueryList.prototype
    const add = proto.addEventListener
    const remove = proto.removeEventListener
    let listeners = 0
    proto.addEventListener = function (this: MediaQueryList, ...args: Parameters<typeof add>) {
      if (args[0] === 'change') listeners++
      return add.apply(this, args)
    } as typeof add
    proto.removeEventListener = function (this: MediaQueryList, ...args: Parameters<typeof remove>) {
      if (args[0] === 'change') listeners--
      return remove.apply(this, args)
    } as typeof remove
    try {
      const Isle = makeIsland('media((min-width: 99999px))')
      const on = signal(true)
      mountHere(h(Show, { when: () => on() }, h(Isle, null)))
      await waitFor(() => listeners === 1)
      on.set(false)
      await flush()
      expect(listeners).toBe(0)
    } finally {
      proto.addEventListener = add
      proto.removeEventListener = remove
    }
  })

  it('interaction: an event on a removed island no longer starts hydration', async () => {
    const Isle = makeIsland('interaction')
    const on = signal(true)
    const el = host()
    mountHere(h(Show, { when: () => on() }, h(Isle, null)), el)
    await waitFor(() => el.querySelector('pyreon-island')?.getAttribute('data-island-state') === 'awaiting-interaction')
    const marker = query(el, 'pyreon-island')
    on.set(false)
    await flush()
    marker.dispatchEvent(new Event('focus'))
    await sleep(40)
    expect(stats.loads).toBe(0)
  })

  it('prefetch idle: removal cancels the prefetch', async () => {
    const idle = trackIdle()
    try {
      const Isle = makeIsland('visible', 'idle')
      const spacer = host()
      spacer.style.height = '5000px'
      const on = signal(true)
      mountHere(h(Show, { when: () => on() }, h(Isle, null)))
      await waitFor(() => idle.pending() === 1)
      on.set(false)
      await flush()
      expect(idle.pending()).toBe(0)
      idle.run()
      await sleep(40)
      expect(stats.loads).toBe(0)
    } finally {
      idle.restore()
    }
  })
})

describe('island lifecycle — static pages (hydrateIslands, no router)', () => {
  const installMarker = (name: string, hydrate = 'load'): HTMLElement => {
    const el = document.createElement('pyreon-island')
    el.setAttribute('data-component', name)
    el.setAttribute('data-props', '{}')
    el.setAttribute('data-hydrate', hydrate)
    el.innerHTML = '<button type="button" data-testid="probe">probe</button>'
    document.body.appendChild(el)

    return el
  }

  it('the cleanup hydrateIslands returns disposes hydrated islands (onUnmount once, effects stop)', async () => {
    installMarker('StaticProbe')
    const cleanup = hydrateIslands({ StaticProbe: probeLoader })
    await waitFor(() => stats.mounts === 1)
    cleanup()
    expect(stats.unmounts).toBe(1)
    expect(stats.mountCleanups).toBe(1)
    await expectDead()
    cleanup()
    expect(stats.unmounts).toBe(1)
  })

  it('a host that replaces island DOM (innerHTML) disposes through the same cleanup', async () => {
    const el = host()
    const marker = installMarker('StaticProbe')
    el.appendChild(marker)
    const cleanup = hydrateIslands({ StaticProbe: probeLoader })
    await waitFor(() => stats.mounts === 1)
    el.innerHTML = '<p>new content</p>'
    // Not observed: a removal the framework did not make is the host's to
    // report. The documented contract is to call the cleanup.
    cleanup()
    expect(stats.unmounts).toBe(1)
    await expectDead()
  })

  it('re-registering after cleanup (HMR) hydrates each island once, never twice', async () => {
    installMarker('StaticProbe')
    const first = hydrateIslands({ StaticProbe: probeLoader })
    await waitFor(() => stats.mounts === 1)
    first()
    const second = hydrateIslands({ StaticProbe: probeLoader })
    await waitFor(() => stats.mounts === 2)
    await sleep(30)
    expect(stats.live).toBe(1)
    expect(document.querySelectorAll('[data-testid="probe"]').length).toBe(1)
    second()
    expect(stats.live).toBe(0)
  })

  it('a second hydrateIslands without cleanup does not hydrate a live island again', async () => {
    installMarker('StaticProbe')
    const first = hydrateIslands({ StaticProbe: probeLoader })
    await waitFor(() => stats.mounts === 1)
    const second = hydrateIslands({ StaticProbe: probeLoader })
    await sleep(40)
    expect(stats.mounts).toBe(1)
    expect(stats.live).toBe(1)
    second()
    first()
    expect(stats.live).toBe(0)
  })
})
