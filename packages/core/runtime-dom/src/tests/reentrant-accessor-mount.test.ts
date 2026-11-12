// A reactive child whose OWN mount writes a signal the accessor read must end
// up mounted ONCE.
//
// The shape is ordinary: a ref callback (or a child's setup) that records
// state the enclosing accessor depends on. `@pyreon/kinetic`'s `appear` is
// exactly this — the element's ref moves the transition stage from `entered`
// to `entering`, and the `<Show when={shouldMount}>` above it reads that stage.
// The write re-runs the binding synchronously, while the first mount is still
// in progress, and two dispatchers used to treat that nested run as a fresh
// mount on top of the one in flight:
//
// - `mountAccessorChild` (every `() => …` child and every component that
//   returns an accessor, `<Show>` included) classified the value AGAIN and
//   built a second structural binding, so the content appeared twice.
// - The polymorphic text core (`() => cond ? 'text' : <Comp/>`) mounted the
//   subtree again and then overwrote the nested run's cleanup with the outer
//   one, orphaning the nested subtree in the DOM.
//
// Bisect-verified: reverting either guard in `mount.ts` fails its spec here
// with `expected 2 to be 1`.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { bindPolymorphicText, mount } from '../index'

describe('reactive child whose mount writes a signal it read', () => {
  it('a structural accessor child mounts once when a ref writes its dependency', () => {
    const stage = signal<'entered' | 'entering'>('entered')
    const el = document.createElement('div')
    const dispose = mount(
      h('ul', null, () =>
        stage() === 'entered' || stage() === 'entering'
          ? h('li', { ref: (node: Element | null) => node && stage.set('entering') }, 'row')
          : null,
      ),
      el,
    )
    expect(el.querySelectorAll('li').length).toBe(1)
    expect(stage()).toBe('entering')
    dispose()
    expect(el.querySelectorAll('li').length).toBe(0)
  })

  it('a component returning an accessor (Show-shaped) mounts once', () => {
    const stage = signal(0)
    const Gate = () => () => (stage() >= 0 ? h('li', { ref: (node: Element | null) => node && stage.set(1) }, 'row') : null)
    const el = document.createElement('div')
    const dispose = mount(h('ul', null, h(Gate, null)), el)
    expect(el.querySelectorAll('li').length).toBe(1)
    // Still a live binding: a later change re-renders in place.
    stage.set(-1)
    expect(el.querySelectorAll('li').length).toBe(0)
    dispose()
  })

  it('the text-to-subtree swap mounts once when the subtree writes its dependency', () => {
    const n = signal(0)
    // The write happens inside the child's OWN reactive boundary (as it does
    // under a `<Show>`), so it re-runs the outer binding while that binding's
    // first subtree mount is still on the stack.
    const Child = () => () => h('b', { ref: (node: Element | null) => node && n.set(2) }, 'child')
    const el = document.createElement('div')
    const dispose = mount(
      h('p', null, () => (n() === 0 ? 'idle' : h(Child, null))),
      el,
    )
    expect(el.textContent).toBe('idle')
    n.set(1)
    expect(el.querySelectorAll('b').length).toBe(1)
    // Back to text, then to a subtree again: no stale subtree survives.
    n.set(0)
    expect(el.querySelectorAll('b').length).toBe(0)
    expect(el.textContent).toBe('idle')
    n.set(1)
    expect(el.querySelectorAll('b').length).toBe(1)
    dispose()
    expect(el.querySelectorAll('b').length).toBe(0)
  })

  it('a text binding whose FIRST value is a subtree mounts it once', () => {
    // bindPolymorphicText is what compiled templates and hydration use for an
    // expression child; its first application runs inside the binding's first run.
    const n = signal(0)
    const Child = () => () => h('b', { ref: (node: Element | null) => node && n.set(1) }, 'child')
    const p = document.createElement('p')
    const text = document.createTextNode('')
    p.appendChild(text)
    const dispose = bindPolymorphicText(() => (n() >= 0 ? h(Child, null) : 'none'), text, p)
    expect(p.querySelectorAll('b').length).toBe(1)
    n.set(-1)
    expect(p.querySelectorAll('b').length).toBe(0)
    expect(p.textContent).toBe('none')
    dispose()
  })
})
