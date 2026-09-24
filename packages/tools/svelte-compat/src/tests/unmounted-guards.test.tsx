/**
 * Nothing may schedule work after the component has unmounted.
 *
 * A Svelte store outlives the components that read it — that is the point of a
 * store. So a write after a subscriber unmounts is not an edge case, it is the
 * ordinary shape: navigate away from a page while a fetch is in flight, and the
 * store lands its result into components that are gone.
 *
 * Four guards stand between that and a crash, all reading `ctx.unmounted`:
 * the subscription's `rerender`, `scheduleRerender`'s entry, its microtask
 * (the state can change between scheduling and running), and the effect
 * flush. None of them was covered — every existing test unmounts last, if at
 * all, so the guards were only ever evaluated in the mounted state.
 *
 * The failure is not silent here, which is unusual and worth saying: it throws
 * into a microtask, so it surfaces as an unhandled rejection with no component
 * name attached — the kind of error that gets triaged as "flaky test".
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { writable } from '../index'
import { jsx } from '../jsx-runtime'

const tick = () => new Promise<void>((r) => setTimeout(r, 10))

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('a store write after unmount', () => {
  test('does not throw, and does not re-render the gone component', async () => {
    const store = writable(0)
    let renders = 0

    const Comp = () => {
      renders++
      // `store.subscribe` inside a component is the REACTIVE path — `get()`
      // subscribes and immediately unsubscribes, so it never re-renders and a
      // test built on it passes without exercising any guard.
      let v = 0
      store.subscribe((x) => {
        v = x
      })
      return jsx('div', { class: 'v', children: String(v) })
    }

    const el = container()
    const unmount = mount(h(() => jsx(Comp, {}), null), el)
    await tick()
    const afterMount = renders

    unmount()
    await tick()

    // The write that arrives too late — a resolved fetch, a websocket frame,
    // a timer. It must be a no-op for this component rather than an error.
    expect(() => store.set(1)).not.toThrow()
    await tick()
    expect(renders, 'an unmounted component must not re-render').toBe(afterMount)
  })

  test('repeated writes after unmount stay quiet', async () => {
    // A stream that keeps arriving. One guarded write proves the branch; a
    // burst proves the guard is not a one-shot that a second write walks past.
    const store = writable(0)
    let renders = 0

    const Comp = () => {
      renders++
      let v = 0
      store.subscribe((x) => {
        v = x
      })
      return jsx('div', { class: 'w', children: String(v) })
    }

    const el = container()
    const unmount = mount(h(() => jsx(Comp, {}), null), el)
    await tick()
    const afterMount = renders

    unmount()
    for (let i = 1; i <= 5; i++) store.set(i)
    await tick()
    expect(renders).toBe(afterMount)
  })

  test('a still-MOUNTED component DOES re-render — the guard is selective', async () => {
    // The control. A `scheduleRerender` that returned unconditionally would
    // pass both specs above while breaking every store-driven update in the
    // library.
    const store = writable(0)
    const el = container()
    const Comp = () => {
      let v = 0
      store.subscribe((x) => {
        v = x
      })
      return jsx('div', { class: 'live', children: String(v) })
    }

    mount(h(() => jsx(Comp, {}), null), el)
    await tick()
    expect(el.querySelector('.live')?.textContent).toBe('0')

    store.set(7)
    await tick()
    expect(el.querySelector('.live')?.textContent, 'a live component must update').toBe('7')
  })
})
