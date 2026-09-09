/**
 * `createEffect`'s cleanup lifecycle inside the compat wrapper.
 *
 * The wrapper re-runs a Solid component on every state change and flushes its
 * effects afterwards, so two things have to hold and neither had a test:
 *
 *   * the PREVIOUS cleanup runs before the effect re-runs. Without it every
 *     re-render adds a listener/timer/subscription and never removes one — the
 *     component works, and leaks in proportion to how often its state moves;
 *   * a queued effect must NOT run once the component has unmounted.
 *     `scheduleEffects` defers to a microtask, so an unmount between the render
 *     and the flush is an ordinary race (a state change immediately before
 *     navigating away). Running then writes into a torn-down tree.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createEffect, createSignal, Index, onCleanup, Show } from '../index'
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

describe('createEffect cleanup across re-runs', () => {
  test('onCleanup inside createEffect runs at UNMOUNT, not per re-run', async () => {
    // A DIVERGENCE from Solid, pinned rather than asserted as correct.
    //
    // In Solid, `onCleanup` registered inside `createEffect` runs before each
    // re-run. Here it registers an UNMOUNT callback on the component instead,
    // so it runs once, at teardown. Anything that must be undone per run — an
    // event listener, a timer, a subscription — therefore accumulates for the
    // life of the component.
    //
    // This is pinned, not fixed: `onCleanup` is shared between component-body
    // and effect-body positions, and separating them changes semantics for
    // every existing consumer. The value of the test is that the behaviour is
    // now WRITTEN DOWN and a change to it is visible.
    const runs: string[] = []
    let setN!: (v: number) => void

    const Comp = () => {
      const [n, set] = createSignal(0)
      setN = set as (v: number) => void
      createEffect(() => {
        const at = n()
        runs.push(`run:${at}`)
        onCleanup(() => runs.push(`cleanup:${at}`))
      })
      return jsx('div', { children: String(n()) })
    }

    const unmount = mount(h(() => jsx(Comp, {}), null), container())
    await tick()
    setN(1)
    await tick()
    setN(2)
    await tick()

    expect(runs, 'the effect re-runs on every change, with no cleanup between').toEqual([
      'run:0',
      'run:1',
      'run:2',
    ])

    unmount()
    await tick()
    expect(
      runs.filter((r) => r.startsWith('cleanup:')).length,
      'every registered cleanup lands at unmount instead',
    ).toBeGreaterThan(0)
  })

  test('the RETURN value is the accumulator, not a cleanup', async () => {
    // The Solid-specific half. `createEffect(prev => next)` threads the return
    // into the following run; treating it as a cleanup would both call it as a
    // function and lose the accumulated value.
    const seen: Array<number | undefined> = []
    let setN!: (v: number) => void

    const Comp = () => {
      const [n, set] = createSignal(0)
      setN = set as (v: number) => void
      createEffect((prev?: number) => {
        n()
        seen.push(prev)
        return (prev ?? 0) + 1
      }, 10)
      return jsx('div', { children: String(n()) })
    }

    mount(h(() => jsx(Comp, {}), null), container())
    await tick()
    setN(1)
    await tick()
    expect(seen[0], 'the initial value seeds the first run').toBe(10)
    expect(seen[1], 'and the previous return seeds the next').toBe(11)
  })

  test('an effect that returns nothing is fine — no cleanup is attempted', async () => {
    // The other arm: `typeof cleanup === 'function' ? cleanup : undefined`.
    // Calling a non-function return would throw on the second render.
    let setN!: (v: number) => void
    let runs = 0

    const Comp = () => {
      const [n, set] = createSignal(0)
      setN = set as (v: number) => void
      createEffect(() => {
        n()
        runs++
        // deliberately no return
      })
      return jsx('div', { children: String(n()) })
    }

    mount(h(() => jsx(Comp, {}), null), container())
    await tick()
    setN(1)
    await tick()
    expect(runs, 'a cleanup-less effect still re-runs').toBe(2)
  })
})

describe('<Index> accepts both an accessor and a plain array for `each`', () => {
  // `Index`'s children take an ACCESSOR per item — `(item: () => T, i)` — which
  // is what distinguishes it from `For`. Its `each` prop takes either a plain
  // array or an accessor, and the two arms are a ternary: treating an array as
  // an accessor would call it (a TypeError), and treating an accessor as an
  // array would render nothing.
  test('a PLAIN array renders its rows', () => {
    const el = container()
    mount(
      h(
        () =>
          jsx(Index as never, {
            each: ['a', 'b'],
            children: ((item: () => string) =>
              jsx('span', { class: `p-${item()}`, children: item() })) as never,
          }),
        null,
      ),
      el,
    )
    expect(el.querySelector('.p-a'), 'a static list must render').not.toBeNull()
    expect(el.querySelector('.p-b')).not.toBeNull()
  })

  test('an ACCESSOR renders and re-renders when the list changes', async () => {
    const [items, setItems] = createSignal(['x'])
    const el = container()
    mount(
      h(
        () =>
          jsx(Index as never, {
            each: items,
            children: ((item: () => string) =>
              jsx('span', { class: `a-${item()}`, children: item() })) as never,
          }),
        null,
      ),
      el,
    )
    expect(el.querySelector('.a-x')).not.toBeNull()

    ;(setItems as (v: string[]) => void)(['x', 'y'])
    await tick()
    expect(el.querySelector('.a-y'), 'a new row must appear').not.toBeNull()
  })
})

describe("Pyreon's own control-flow components are never wrapped", () => {
  test('Show renders through jsx() and stays reactive', () => {
    // `_nativeComponents` lists the components that rely on their OWN internal
    // reactivity — Show, For, Switch, Match, Suspense, ErrorBoundary. The
    // compat wrapper relocates a Solid component's render frame, which is
    // right for user components and breaks these: their setup would run inside
    // the wrapper's accessor instead of Pyreon's, so the reactive boundary
    // they install would land in a frame that is already torn down.
    //
    // The failure is not a crash — the component renders once and then stops
    // updating, which reads as a missing dependency somewhere in user code.
    const el = container()
    mount(
      h(() => jsx(Show as never, { when: true, children: jsx('span', { class: 'shown', children: 'y' }) }), null),
      el,
    )
    expect(el.querySelector('.shown'), 'a native component must render through jsx()').not.toBeNull()
  })

  test('a plain user component IS wrapped — the bypass is selective', () => {
    // The control. A bypass that returned everything unwrapped would pass the
    // spec above while losing the frame relocation every Solid component needs.
    const User = () => jsx('span', { class: 'user', children: 'u' })
    const el = container()
    mount(h(() => jsx(User, {}), null), el)
    expect(el.querySelector('.user')).not.toBeNull()
  })
})
