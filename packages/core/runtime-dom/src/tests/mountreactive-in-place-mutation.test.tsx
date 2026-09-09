import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'

/**
 * `mountReactive` skips its teardown+remount when the accessor returns the value
 * already mounted (#3082). That is right for the shape it was written for: a
 * component's sole child is `_lc`-memoized, so the accessor hands back the SAME
 * `_tpl` NativeItem whose DOM and bindings were built once — tearing it down
 * disposes bindings the remount does not rebuild, leaving one live, permanently
 * stale node.
 *
 * But `===` cannot separate "the same value, unchanged" from "the same value,
 * MUTATED IN PLACE", and Pyreon ships two APIs whose whole purpose is the latter:
 *
 *   - `signal.trigger()` is public and manifest-documented as force-notifying
 *     subscribers after an in-place mutation (the Vue `triggerRef` semantic).
 *   - `createStore`'s proxy cache returns an identical reference for a nested
 *     array on every read, so a `push` through the proxy never changes identity.
 *
 * With an unkeyed array child — which `mountAccessorChild` routes to
 * `mountReactive`, not `mountKeyedList` — an identity-only skip made both of
 * those silently do nothing.
 *
 * The skip is therefore gated on the value carrying construction-time DOM
 * (`__isNative`), which is exactly the destructive case. Everything else is
 * rebuilt correctly by a remount, which is the pre-#3082 behaviour.
 */
const mountList = (child: unknown): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  mount((() => h('ul', null, child as never)) as never, host)
  return host
}

describe('mountReactive honours in-place mutation', () => {
  it('signal.trigger() after an in-place push mounts the new row', () => {
    const rows = signal<unknown[]>([h('li', null, 'a'), h('li', null, 'b')])
    const host = mountList(rows)
    expect(host.querySelectorAll('li').length).toBe(2)

    ;(rows.peek() as unknown[]).push(h('li', null, 'c'))
    rows.trigger()

    expect(
      host.querySelectorAll('li').length,
      'signal.trigger() is documented for exactly this: an in-place mutation with no identity change',
    ).toBe(3)
    expect(host.textContent).toBe('abc')
  })

  it('signal.trigger() after an in-place splice removes the row', () => {
    const rows = signal<unknown[]>([h('li', null, 'a'), h('li', null, 'b')])
    const host = mountList(rows)
    ;(rows.peek() as unknown[]).splice(0, 1)
    rows.trigger()
    expect(host.querySelectorAll('li').length).toBe(1)
    expect(host.textContent).toBe('b')
  })

  // The counterpart: the skip must still fire for the shape it exists for, or
  // this fix has silently reverted #3082. `show-child-retrack.test.tsx` is the
  // behavioural half; this is the direct one.
  it('still skips a re-emitted NativeItem (the #3082 shape)', () => {
    const native = { __isNative: true, el: document.createElement('span') }
    native.el.textContent = 'once'
    const tick = signal(0)
    const host = document.createElement('div')
    document.body.appendChild(host)
    mount((() => h('div', null, (() => (tick(), native)) as never)) as never, host)
    const first = host.querySelector('span')
    expect(first?.textContent).toBe('once')
    tick.set(1)
    expect(
      host.querySelector('span'),
      'the same NativeItem must not be torn down and re-inserted',
    ).toBe(first)
  })

  it('control: a NEW array reference still updates', () => {
    const rows = signal<unknown[]>([h('li', null, 'a')])
    const host = mountList(rows)
    rows.set([h('li', null, 'a'), h('li', null, 'b')])
    expect(host.querySelectorAll('li').length).toBe(2)
  })
})
