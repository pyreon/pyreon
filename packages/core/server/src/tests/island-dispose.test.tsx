// @vitest-environment happy-dom
/**
 * The ONE dispose an island's lifetime ends through (#4387), under happy-dom.
 *
 * The real-Chromium proof of every removal path (router navigation, `<Show>`,
 * `<For>`, Suspense, IntersectionObserver / idle / media triggers, 50-round
 * instance count) is `island-lifecycle.browser.test.tsx` plus the
 * `zero-islands` e2e. This file locks the same contract through the real
 * `h()` + `mount()` path where happy-dom is enough: the dispose returned by
 * `scheduleHydration`, the `island()` marker's unmount, and the cleanup
 * `hydrateIslands()` returns.
 */
import { h, onMount, onUnmount } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrateIslands, scheduleHydration } from '../client'
import { island } from '../island'

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 5))
  expect(cond()).toBe(true)
}

// pyreon-lint-disable-next-line pyreon/prefer-request-context -- a test fixture, not server state; no requests run here
const outside = signal(0)
const s = { loads: 0, mounts: 0, unmounts: 0, effectRuns: 0 }

function Probe() {
  effect(() => {
    outside()
    s.effectRuns++
  })
  onMount(() => {
    s.mounts++
  })
  onUnmount(() => {
    s.unmounts++
  })

  return h('b', { 'data-testid': 'probe' }, 'probe')
}

const loader = async () => {
  s.loads++
  return { default: Probe }
}

afterEach(() => {
  document.body.innerHTML = ''
  s.loads = s.mounts = s.unmounts = s.effectRuns = 0
})

const marker = (html = '') => {
  const el = document.createElement('pyreon-island')
  el.setAttribute('data-component', 'Probe')
  el.setAttribute('data-props', '{}')
  el.setAttribute('data-hydrate', 'load')
  el.innerHTML = html
  document.body.appendChild(el)

  return el
}

describe('scheduleHydration — the dispose it returns', () => {
  it('unmounts a hydrated island once and clears data-island-hydrated', async () => {
    const el = marker('<b data-testid="probe">probe</b>')
    const dispose = scheduleHydration(el, loader, '{}', 'load')
    await until(() => s.mounts === 1)
    expect(el.hasAttribute('data-island-hydrated')).toBe(true)
    dispose()
    expect(s.unmounts).toBe(1)
    expect(el.hasAttribute('data-island-hydrated')).toBe(false)
    const runs = s.effectRuns
    outside.set(outside.peek() + 1)
    expect(s.effectRuns).toBe(runs)
    dispose()
    expect(s.unmounts).toBe(1)
  })

  it('a chunk that lands after dispose never mounts', async () => {
    const el = marker()
    const dispose = scheduleHydration(el, loader, '{}', 'load')
    dispose()
    await tick()
    await tick()
    expect(s.loads).toBe(1)
    expect(s.mounts).toBe(0)
    expect(el.hasAttribute('data-island-hydrated')).toBe(false)
  })

  it('idle (setTimeout fallback) and media triggers are disarmed', async () => {
    const idle = scheduleHydration(marker(), loader, '{}', 'idle')
    idle()
    const mm = window.matchMedia
    let listeners = 0
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => listeners++,
      removeEventListener: () => listeners--,
    })) as unknown as typeof window.matchMedia
    try {
      const media = scheduleHydration(marker(), loader, '{}', 'media((min-width: 1px))')
      expect(listeners).toBe(1)
      media()
      expect(listeners).toBe(0)
    } finally {
      window.matchMedia = mm
    }
    await new Promise((r) => setTimeout(r, 250))
    expect(s.loads).toBe(0)
  })

  it('an empty marker (client-rendered, or emptied by a previous unmount) is mounted into', async () => {
    const el = marker()
    const dispose = scheduleHydration(el, loader, '{}', 'load')
    await until(() => s.mounts === 1)
    expect(el.querySelectorAll('[data-testid="probe"]').length).toBe(1)
    dispose()
    expect(el.childNodes.length).toBe(0)
  })
})

describe('island() — the marker unmount ends the island', () => {
  it('unmounting a hydrated island runs its onUnmount', async () => {
    const Isle = island(loader, { name: 'DisposeIsle', hydrate: 'load' })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const unmount = mount(h(Isle, null), host)
    await until(() => s.mounts === 1)
    unmount()
    expect(s.unmounts).toBe(1)
  })

  it('unmounting before the scheduler module has loaded never schedules', async () => {
    const Isle = island(loader, { name: 'EarlyIsle', hydrate: 'load', prefetch: 'idle' })
    const host = document.createElement('div')
    document.body.appendChild(host)
    mount(h(Isle, null), host)()
    await new Promise((r) => setTimeout(r, 30))
    expect(s.loads).toBe(0)
  })

  it('unmounting a pending island also cancels its prefetch', async () => {
    const Isle = island(loader, { name: 'PrefetchIsle', hydrate: 'media((min-width: 99999px))', prefetch: 'idle' })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const unmount = mount(h(Isle, null), host)
    await new Promise((r) => setTimeout(r, 20))
    unmount()
    await new Promise((r) => setTimeout(r, 250))
    expect(s.loads).toBe(0)
  })
})

describe('hydrateIslands — the cleanup it returns', () => {
  it('disposes hydrated islands, and a second call skips an island that is live', async () => {
    marker('<b data-testid="probe">probe</b>')
    const first = hydrateIslands({ Probe: loader })
    await until(() => s.mounts === 1)
    const second = hydrateIslands({ Probe: loader })
    await tick()
    expect(s.mounts).toBe(1)
    second()
    first()
    expect(s.unmounts).toBe(1)
    first()
    expect(s.unmounts).toBe(1)
  })
})
