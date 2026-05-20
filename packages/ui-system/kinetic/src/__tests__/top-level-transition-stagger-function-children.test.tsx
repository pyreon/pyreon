/** @jsxImportSource @pyreon/core */
/**
 * Regression: PR #731 fixed the kinetic-mode renderers (StaggerRenderer +
 * TransitionItem under `src/kinetic/`) but missed the parallel TOP-LEVEL
 * `<Transition>` and `<Stagger>` components in `src/Transition.tsx` and
 * `src/Stagger.tsx`. They have the SAME iteration + cloneVNode shape and
 * the SAME bug when the Pyreon compiler wraps the children prop in
 * `() => x` (the prop-inlining pass).
 *
 * The Pyreon vite-plugin auto-wraps `<Comp>{x}</Comp>` JSX child
 * expressions in `() => x` for stable prop-derived references; downstream
 * libraries that iterate `props.children` directly at the VNode level or
 * `cloneVNode` them silently break — the function spread produces
 * `{type: undefined}` → `<undefined>` DOM tags. PR #732 added the
 * compiler carve-out for stable references; library-side `resolveChildren`
 * is still needed for the CallExpression-inside-JSX-child shape that the
 * compiler (correctly) doesn't optimize.
 *
 * Bisect-verified: reverting the `resolveChildren` call in `Stagger.tsx`
 * fails the Stagger spec (no children rendered); reverting in
 * `Transition.tsx` fails the Transition spec (`<undefined>` tag rendered
 * instead of the cloned child).
 */
import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import Stagger from '../Stagger'
import Transition from '../Transition'

let containers: HTMLElement[] = []
afterEach(() => {
  for (const c of containers) c.remove()
  containers = []
})

describe('top-level <Stagger> — function-wrapped children survive render', () => {
  it('iterates function-wrapped children correctly (no empty render)', () => {
    const childArray: VNode[] = [
      h('h1', { 'data-id': 'st-h1' }, 'Hello'),
      h('p', { 'data-id': 'st-p' }, 'tagline'),
      h('ul', { 'data-id': 'st-ul' }, h('li', null, 'a')),
    ]

    const tree = h(Stagger, {
      show: () => true,
      appear: true,
      interval: 20,
      // Compiler-emitted shape: children is a function returning the array.
      children: (() => childArray) as unknown as VNode[],
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)

    const dispose = mount(tree as VNode, container)

    const h1 = container.querySelector('[data-id="st-h1"]')
    const p = container.querySelector('[data-id="st-p"]')
    const ul = container.querySelector('[data-id="st-ul"]')

    expect(
      h1,
      `Stagger collapsed when children is a function — html=${container.innerHTML.slice(0, 400)}`,
    ).not.toBeNull()
    expect(h1?.tagName).toBe('H1')
    expect(h1?.textContent).toBe('Hello')
    expect(p?.tagName).toBe('P')
    expect(ul?.tagName).toBe('UL')
    expect(container.querySelector('undefined')).toBeNull()

    dispose()
  })

  it('static-array children control — was always working', () => {
    const tree = h(
      Stagger,
      { show: () => true, appear: true, interval: 20 },
      h('h1', { 'data-id': 'st-static' }, 'Static'),
      h('p', { 'data-id': 'st-static-p' }, 't'),
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)
    const dispose = mount(tree as VNode, container)

    expect(container.querySelector('[data-id="st-static"]')?.tagName).toBe('H1')
    expect(container.querySelector('[data-id="st-static-p"]')?.tagName).toBe('P')

    dispose()
  })
})

describe('top-level <Transition> — function-wrapped children survive render', () => {
  it('resolves function-wrapped children before cloneVNode (no <undefined> tag)', () => {
    const childVNode = h('h1', { 'data-id': 'tn-h1' }, 'Hello')

    const tree = h(Transition, {
      show: () => true,
      appear: false,
      // Compiler-emitted shape.
      children: (() => childVNode) as unknown as VNode,
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)

    const dispose = mount(tree as VNode, container)

    const h1 = container.querySelector('[data-id="tn-h1"]')
    expect(
      h1,
      `Transition produced <undefined> — html=${container.innerHTML.slice(0, 400)}`,
    ).not.toBeNull()
    expect(h1?.tagName).toBe('H1')
    expect(h1?.textContent).toBe('Hello')
    expect(container.querySelector('undefined')).toBeNull()

    dispose()
  })

  it('static-VNode child control — was always working', () => {
    const tree = h(
      Transition,
      { show: () => true, appear: false },
      h('h1', { 'data-id': 'tn-static' }, 'Static'),
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)
    const dispose = mount(tree as VNode, container)

    expect(container.querySelector('[data-id="tn-static"]')?.tagName).toBe('H1')

    dispose()
  })
})
