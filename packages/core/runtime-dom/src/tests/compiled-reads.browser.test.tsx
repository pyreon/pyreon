/**
 * Real-Chromium proof of two compiler contracts, through components compiled
 * by the REAL transform (`fixtures/compiled-reads.fixture.tsx`):
 *
 * - A prop-derived `const` whose initializer mints state anywhere
 *   (`props.shared ?? signal(0)`) is evaluated once, so the documented
 *   standalone counter counts; a pure one stays inlined and live on every
 *   element path (handlers on components and childless elements, function
 *   children included).
 * - A bare signal inside a function nested in JSX is a read on every element
 *   path (#4536): component, childless and spread-carrying elements, and a
 *   component's function child.
 */
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Counter,
  CounterButton,
  LabelPaths,
  NestedChildless,
  NestedComponent,
  NestedFunctionChild,
  NestedSpread,
  nestedCount,
} from './fixtures/compiled-reads.fixture'

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function render(vnode: ReturnType<typeof h>): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(vnode, container)
  cleanups.push(() => {
    unmount()
    container.remove()
  })
  return container
}

const q = (root: HTMLElement, sel: string) => root.querySelector<HTMLElement>(sel)!

describe('a prop-derived const that mints state is created once', () => {
  it('the live-examples Counter counts standalone', () => {
    const root = render(h(Counter, {}))
    q(root, 'button').click()
    q(root, 'button').click()
    expect(q(root, 'span').textContent).toBe('2')
  })

  it('the zero-content CounterButton counts standalone', () => {
    const root = render(h(CounterButton, {}))
    q(root, 'button').click()
    expect(q(root, 'button').textContent).toBe('bump (now 1)')
  })

  it('with a shared signal, the click drives the shared one', () => {
    const shared = signal(5)
    const root = render(h(Counter, { shared }))
    q(root, 'button').click()
    expect(shared()).toBe(6)
    shared.set(9)
    expect(q(root, 'span').textContent).toBe('9')
  })
})

describe('a pure prop-derived const is live on every element path', () => {
  it('text, attribute, component and childless handlers, function child', () => {
    const label = signal('a')
    const seen: string[] = []
    // `_rp` is what the compiler emits for `<LabelPaths label={label()} />`.
    const root = render(h(LabelPaths, { label: _rp(() => label()), seen } as never))
    expect(q(root, '.label').textContent).toBe('a')
    label.set('b')
    expect(q(root, '.label').textContent).toBe('b')
    expect(q(root, '.label').getAttribute('title')).toBe('b')
    expect(q(root, '.box').textContent).toBe('b!')
    q(root, '.label-btn').click()
    q(root, '.label-bare').click()
    expect(seen).toEqual(['b', 'b'])
  })
})

describe('a bare signal in a nested function is read on every element path (#4536)', () => {
  it('component, childless and spread-element handlers write numbers', () => {
    nestedCount.set(0)
    for (const [Comp, sel] of [
      [NestedComponent, '.cmp'],
      [NestedChildless, '.childless'],
      [NestedSpread, '.spread'],
    ] as const) {
      q(render(h(Comp, null)), sel).click()
    }
    expect(typeof nestedCount()).toBe('number')
    expect(nestedCount()).toBe(3)
  })

  it("a component's function child renders the value, not the function source", () => {
    nestedCount.set(41)
    const root = render(h(NestedFunctionChild, null))
    expect(q(root, '.box').textContent).toBe('42')
    nestedCount.set(1)
    expect(q(root, '.box').textContent).toBe('2')
  })
})
