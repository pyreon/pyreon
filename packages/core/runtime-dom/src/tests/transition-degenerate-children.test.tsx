/**
 * `<Transition>` and `<TransitionGroup>` when there is no element to animate.
 *
 * Both components work by writing classes onto a DOM element they reach through
 * an injected ref — so their entire mechanism is unavailable for a child that
 * is not a DOM element: a bare string, a component, an item that renders text.
 * Those are all legal children, and a user writes them without any sense of
 * having asked for something impossible.
 *
 * The requirement is therefore not that the animation happens. It is that the
 * CONTENT still renders, the component says why the animation did not, and
 * nothing spins: the ref-retry loop has a floor, so a child that will never
 * produce an element stops being waited for instead of rescheduling a
 * microtask against an app that has moved on.
 */
import { h } from '@pyreon/core'
import { batch, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Transition, TransitionGroup, mount } from '../index'

let container: HTMLElement
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** Drain more microtask turns than the ref-retry loop is allowed. */
const drain = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve()
}

describe('<Transition> with a child it cannot animate', () => {
  it('animates a DOM element child — the control', async () => {
    const show = signal(false)
    const dispose = mount(
      h(Transition, { show: () => show(), name: 't' }, h('div', { class: 'box' }, 'x')),
      container,
    )
    show.set(true)
    await drain()
    expect(container.querySelector('.box')).not.toBeNull()
    dispose()
  })

  it('RENDERS a plain string child', async () => {
    // No element means no classes to write, but the text is the content the
    // user asked for and dropping it would be a far worse failure than not
    // fading it in.
    const show = signal(true)
    const dispose = mount(
      h(Transition, { show: () => show(), name: 't', appear: true }, 'just text' as never),
      container,
    )
    await drain()
    expect(container.textContent).toContain('just text')
    dispose()
  })

  it('STOPS retrying for a child that will never produce an element', async () => {
    // The ref is filled by the mount pipeline, which can be several turns
    // behind for a portaled or deferred child — hence the retry. Without a
    // floor, a child that never produces one reschedules a microtask forever,
    // which is a busy loop that survives the component itself.
    const show = signal(true)
    const dispose = mount(
      h(Transition, { show: () => show(), name: 't', appear: true }, 'just text' as never),
      container,
    )
    await drain()
    // Reaching here at all is the assertion: an unbounded retry starves the
    // microtask queue and this never resolves.
    expect(container.textContent).toContain('just text')
    dispose()
    await drain()
    expect(container.textContent, 'and it stopped after unmount too').toBe('')
  })

  it('WARNS that a component child cannot be animated', async () => {
    // The failure is silent otherwise: the content renders, the animation
    // simply never happens, and there is nothing to search for.
    const warn = console.warn as unknown as { mock: { calls: unknown[][] } }
    const Inner = () => h('div', { class: 'inner' }, 'i')
    const show = signal(true)
    const dispose = mount(
      h(Transition, { show: () => show(), name: 't', appear: true }, h(Inner, null)),
      container,
    )
    await drain()
    expect(container.querySelector('.inner')).not.toBeNull()
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('component')),
      'it names the reason',
    ).toBe(true)
    dispose()
  })

  it('UNMOUNTS a string child when show goes false', async () => {
    const show = signal(true)
    const dispose = mount(
      h(Transition, { show: () => show(), name: 't' }, 'just text' as never),
      container,
    )
    expect(container.textContent).toContain('just text')
    show.set(false)
    await drain()
    expect(container.textContent, 'no element to animate, so it just goes').toBe('')
    dispose()
  })

  it('ignores a hide that lands while it is already hidden', async () => {
    // A batched toggle that settles back where it started — a state machine
    // resolving in one tick. The component sees ONE run with the final value,
    // and acting on it would run a leave animation over nothing.
    const show = signal(false)
    const dispose = mount(
      h(Transition, { show: () => show(), name: 't' }, h('div', { class: 'box' }, 'x')),
      container,
    )
    expect(container.querySelector('.box')).toBeNull()
    batch(() => {
      show.set(true)
      show.set(false)
    })
    await drain()
    expect(container.querySelector('.box'), 'still hidden, no work done').toBeNull()
    dispose()
  })

  it('ignores a show that lands while it is already shown', async () => {
    const show = signal(true)
    const dispose = mount(
      h(Transition, { show: () => show(), name: 't' }, h('div', { class: 'box' }, 'x')),
      container,
    )
    batch(() => {
      show.set(false)
      show.set(true)
    })
    await drain()
    expect(container.querySelectorAll('.box'), 'one box, not two').toHaveLength(1)
    dispose()
  })
})

describe('<TransitionGroup> when the element-per-item contract is broken', () => {
  // `render` is documented to return a VNode whose `type` is a string, because
  // the component injects a ref into it and reads the DOM node back to measure
  // and move it. An item that renders text has no node, so ORDERING and
  // ANIMATION are genuinely outside what this API promises for it — and the
  // specs below deliberately do not assert either.
  //
  // What must still hold is the part a user cannot recover from: the content is
  // not LOST, the measurement pass does not THROW on an item it cannot measure
  // (which would take the rest of the list down with it), and teardown is
  // clean. A wrongly-ordered list is a bug the user can see and fix; a list
  // that silently drops half its items, or an exception thrown from inside a
  // FLIP measurement, is not.
  const groupApp = (items: () => string[], render: (s: string) => unknown) =>
    h(TransitionGroup, {
      tag: 'ul',
      name: 'g',
      items,
      keyFn: (s: string) => s,
      render: render as never,
    })

  it('renders element items in order — the contract, and the control', async () => {
    const items = signal(['a', 'b', 'c'])
    const dispose = mount(
      groupApp(
        () => items(),
        (s: string) => h('li', { class: 'row' }, s),
      ),
      container,
    )
    await drain()
    expect(container.querySelectorAll('.row')).toHaveLength(3)
    expect(container.textContent).toBe('abc')
    dispose()
  })

  it('REORDERS element items — also the contract', async () => {
    const items = signal(['a', 'b', 'c'])
    const dispose = mount(
      groupApp(
        () => items(),
        (s: string) => h('li', { class: 'row' }, s),
      ),
      container,
    )
    await drain()
    items.set(['c', 'a', 'b'])
    await drain()
    expect(container.textContent).toBe('cab')
    dispose()
  })

  it('does not LOSE a text item that cannot carry a ref', async () => {
    const items = signal(['a', 'b'])
    const dispose = mount(
      groupApp(
        () => items(),
        (s: string) => s,
      ),
      container,
    )
    await drain()
    expect(container.textContent?.split('').sort().join('')).toBe('ab')
    dispose()
  })

  it('does not THROW when a reorder has to measure an item with no node', async () => {
    // The measurement pass runs over every entry. One that has no element must
    // be skipped, not measured — an exception here escapes mid-reorder and the
    // items that were going to move never do.
    const items = signal(['a', 'b', 'c'])
    const dispose = mount(
      groupApp(
        () => items(),
        (s: string) => s,
      ),
      container,
    )
    await drain()
    expect(() => items.set(['c', 'a', 'b'])).not.toThrow()
    await drain()
    expect(container.textContent?.split('').sort().join(''), 'all three survive').toBe('abc')
    dispose()
  })

  it('does not throw on a MIXED list either', async () => {
    const items = signal(['a', 'b'])
    const dispose = mount(
      groupApp(
        () => items(),
        (s: string) => (s === 'a' ? h('li', { class: 'row' }, s) : s),
      ),
      container,
    )
    await drain()
    expect(() => items.set(['b', 'a'])).not.toThrow()
    await drain()
    expect(container.textContent?.split('').sort().join('')).toBe('ab')
    dispose()
  })

  it('REMOVES a text item cleanly', async () => {
    const items = signal(['a', 'b'])
    const dispose = mount(
      groupApp(
        () => items(),
        (s: string) => s,
      ),
      container,
    )
    await drain()
    items.set(['b'])
    await drain()
    expect(container.textContent).toBe('b')
    dispose()
  })

  it('tears down clean from a text-item list', async () => {
    const items = signal(['a', 'b'])
    const dispose = mount(
      groupApp(
        () => items(),
        (s: string) => s,
      ),
      container,
    )
    await drain()
    dispose()
    expect(container.textContent).toBe('')
  })
})
