import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mountCallbacks: Array<() => void> = []
let unmountCallbacks: Array<() => void> = []

vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(() => {
      const ret = fn()
      if (typeof ret === 'function') unmountCallbacks.push(ret as () => void)
    })
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn)
  },
}))

import { signal } from '@pyreon/reactivity'
import { useInertOthers } from '../useInertOthers'

const tick = () => new Promise<void>((r) => queueMicrotask(r))

const mountAll = () => {
  mountCallbacks.forEach((cb) => {
    cb()
  })
}
const unmountAll = () => {
  unmountCallbacks.splice(0).forEach((cb) => {
    cb()
  })
}

describe('useInertOthers', () => {
  let sibling: HTMLDivElement
  let wrap: HTMLDivElement
  let innerSibling: HTMLDivElement
  let target: HTMLDivElement

  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    // body > [sibling, wrap > [innerSibling, target]]
    sibling = document.createElement('div')
    sibling.id = 'sibling'
    wrap = document.createElement('div')
    wrap.id = 'wrap'
    innerSibling = document.createElement('div')
    innerSibling.id = 'inner-sibling'
    target = document.createElement('div')
    target.id = 'target'
    wrap.append(innerSibling, target)
    document.body.append(sibling, wrap)
  })

  afterEach(() => {
    unmountAll()
    document.body.innerHTML = ''
  })

  it('inerts sibling subtrees at every level up to body, not the ancestor chain', () => {
    useInertOthers(() => target)
    mountAll()

    expect(sibling.hasAttribute('inert')).toBe(true)
    expect(innerSibling.hasAttribute('inert')).toBe(true)
    // The ancestor chain + the element itself stay interactive.
    expect(wrap.hasAttribute('inert')).toBe(false)
    expect(target.hasAttribute('inert')).toBe(false)
  })

  it('restores on unmount', () => {
    useInertOthers(() => target)
    mountAll()
    expect(sibling.hasAttribute('inert')).toBe(true)

    unmountAll()
    expect(sibling.hasAttribute('inert')).toBe(false)
    expect(innerSibling.hasAttribute('inert')).toBe(false)
  })

  it('preserves an element that was ALREADY inert before application', () => {
    sibling.setAttribute('inert', '')
    useInertOthers(() => target)
    mountAll()
    expect(sibling.hasAttribute('inert')).toBe(true)

    unmountAll()
    // Snapshot restore: it was inert before us, it stays inert after us.
    expect(sibling.hasAttribute('inert')).toBe(true)
    expect(innerSibling.hasAttribute('inert')).toBe(false)
  })

  it('is refcount/nesting-safe for stacked overlays', () => {
    // Two body-level "modals": each inerts the other + shared background.
    const modalA = document.createElement('div')
    const modalB = document.createElement('div')
    document.body.append(modalA, modalB)

    useInertOthers(() => modalA)
    mountAll()
    mountCallbacks = []
    const releaseA = unmountCallbacks.splice(0)

    useInertOthers(() => modalB)
    mountAll()
    const releaseB = unmountCallbacks.splice(0)

    // Both applied: background counted twice, each modal inert-ed by the other.
    expect(sibling.hasAttribute('inert')).toBe(true)
    expect(modalA.hasAttribute('inert')).toBe(true)
    expect(modalB.hasAttribute('inert')).toBe(true)

    // Inner (B) closes: A is released, but B's cleanup must NOT un-inert the
    // shared background the outer (A) still needs.
    releaseB.forEach((cb) => {
      cb()
    })
    expect(modalA.hasAttribute('inert')).toBe(false)
    expect(sibling.hasAttribute('inert')).toBe(true)
    expect(modalB.hasAttribute('inert')).toBe(true)

    releaseA.forEach((cb) => {
      cb()
    })
    expect(sibling.hasAttribute('inert')).toBe(false)
    expect(modalB.hasAttribute('inert')).toBe(false)
  })

  it('follows a signal-backed getter: applies on mount, releases on null', async () => {
    const el = signal<HTMLElement | null>(null)
    useInertOthers(() => el())
    mountAll()
    expect(sibling.hasAttribute('inert')).toBe(false)

    el.set(target)
    await tick()
    expect(sibling.hasAttribute('inert')).toBe(true)

    el.set(null)
    await tick()
    expect(sibling.hasAttribute('inert')).toBe(false)
  })

  it('re-applies when the element identity changes', async () => {
    const other = document.createElement('div')
    document.body.append(other)

    const el = signal<HTMLElement | null>(target)
    useInertOthers(() => el())
    mountAll()
    expect(other.hasAttribute('inert')).toBe(true)
    expect(target.hasAttribute('inert')).toBe(false)

    el.set(other)
    await tick()
    // Old application released, new one applied: target is now a sibling of
    // the chain, other is the protected element.
    expect(other.hasAttribute('inert')).toBe(false)
    expect(wrap.hasAttribute('inert')).toBe(true)
  })

  it('arms/disarms via a reactive `active` getter (options object)', async () => {
    const active = signal(false)
    useInertOthers(() => target, { active: () => active() })
    mountAll()
    expect(sibling.hasAttribute('inert')).toBe(false)

    active.set(true)
    await tick()
    expect(sibling.hasAttribute('inert')).toBe(true)

    active.set(false)
    await tick()
    expect(sibling.hasAttribute('inert')).toBe(false)
  })

  it('accepts the positional boolean / function shorthand', () => {
    useInertOthers(() => target, false)
    mountAll()
    expect(sibling.hasAttribute('inert')).toBe(false)
    unmountAll()

    useInertOthers(() => target, () => true)
    mountAll()
    expect(sibling.hasAttribute('inert')).toBe(true)
  })

  it('skips script/style/template/link/meta tags and live regions', () => {
    const script = document.createElement('script')
    const style = document.createElement('style')
    const live = document.createElement('div')
    live.setAttribute('aria-live', 'polite')
    const announcer = document.createElement('div')
    announcer.setAttribute('data-live-announcer', '')
    document.body.append(script, style, live, announcer)

    useInertOthers(() => target)
    mountAll()

    expect(script.hasAttribute('inert')).toBe(false)
    expect(style.hasAttribute('inert')).toBe(false)
    expect(live.hasAttribute('inert')).toBe(false)
    expect(announcer.hasAttribute('inert')).toBe(false)
    expect(sibling.hasAttribute('inert')).toBe(true)
  })

  it('skips non-HTMLElement siblings (SVG, text)', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.append(svg)

    useInertOthers(() => target)
    mountAll()

    expect(svg.hasAttribute('inert')).toBe(false)
    expect(sibling.hasAttribute('inert')).toBe(true)
  })

  it('no-ops for a detached element (no path to body)', () => {
    const detached = document.createElement('div')
    useInertOthers(() => detached)
    mountAll()
    expect(sibling.hasAttribute('inert')).toBe(false)
  })

  it('no-ops while the getter returns null (no `active` needed)', () => {
    useInertOthers(() => null)
    mountAll()
    expect(sibling.hasAttribute('inert')).toBe(false)
  })
})
