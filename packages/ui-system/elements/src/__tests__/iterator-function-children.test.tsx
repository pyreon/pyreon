/** @jsxImportSource @pyreon/core */
/**
 * Regression: `<Iterator>{items}</Iterator>` where the Pyreon compiler
 * wrapped `items` in `() => items` (the prop-inlining pass) used to
 * silently misrender — the `Array.isArray(children)` and Fragment-type
 * checks both fell through (a function is neither), and the fallthrough
 * `renderChild(function)` called `render(function, props)` which
 * interpreted the function as a COMPONENT FUNCTION. That accidentally
 * worked at the DOM level (the wrapped function's call returned the array
 * and mountChild rendered it), but the per-item metadata (`first`/`last`/
 * `position`/`index`/`odd`/`even`) was LOST because the iteration loop
 * was never reached.
 *
 * Fix: unwrap eagerly at component-body entry — `typeof children ===
 * 'function' ? children() : children`. Mirrors kinetic's `resolveChildren`
 * pattern (PR #731 + top-level Transition/Stagger parallel fix).
 *
 * Bisect-verified: reverting the `typeof rawChildren === 'function'`
 * unwrap fails this spec — per-item `first`/`last` props arrive as
 * `undefined` because the iteration loop was skipped.
 */
import type { VNode, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import Iterator from '../helpers/Iterator/component'

let containers: HTMLElement[] = []
afterEach(() => {
  for (const c of containers) c.remove()
  containers = []
})

describe('<Iterator> — function-wrapped children', () => {
  it('iterates function-wrapped children with per-item metadata via wrapProps', () => {
    let firstFlagSet = false
    let lastFlagSet = false
    const positions: number[] = []

    // ItemWrapper just renders <li>. The per-item metadata is captured
    // via the `wrapProps` injector — Iterator calls it with the
    // attached metadata `{first, last, position, index, odd, even}`.
    // Counting positions/flags proves the iteration loop fired.
    const ItemWrapper = (props: {
      children?: VNodeChild
      'data-first'?: string
      'data-last'?: string
      'data-position'?: number
    }) => h('li', props as never, props.children as never)

    const items: VNode[] = [
      h('span', { 'data-id': 'item-a' }, 'A'),
      h('span', { 'data-id': 'item-b' }, 'B'),
      h('span', { 'data-id': 'item-c' }, 'C'),
    ]

    // Compiler-emitted shape: children is `() => items` (the prop-inlining
    // wrap for stable references). Pre-fix: the function was treated as a
    // component → iteration loop skipped → per-item metadata not attached.
    const tree = h(Iterator, {
      wrapComponent: ItemWrapper,
      // wrapProps receives `(itemProps, extendedProps)` where
      // extendedProps carries the per-item metadata. Captured here to
      // prove the iteration loop fired (which the fallthrough wouldn't).
      wrapProps: (_: object, ext: { first: boolean; last: boolean; position: number }) => {
        positions.push(ext.position)
        if (ext.first) firstFlagSet = true
        if (ext.last) lastFlagSet = true
        return {}
      },
      children: (() => items) as unknown as VNodeChild,
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)

    const dispose = mount(tree as VNode, container)

    expect(
      positions,
      `wrapProps was called for positions=${JSON.stringify(positions)}; ` +
        `expected [1,2,3] (per-item iteration loop must fire). ` +
        `html=${container.innerHTML.slice(0, 400)}`,
    ).toEqual([1, 2, 3])
    expect(firstFlagSet, 'first=true metadata must reach wrapProps').toBe(true)
    expect(lastFlagSet, 'last=true metadata must reach wrapProps').toBe(true)

    expect(container.querySelector('[data-id="item-a"]')?.tagName).toBe('SPAN')
    expect(container.querySelector('[data-id="item-b"]')?.tagName).toBe('SPAN')
    expect(container.querySelector('[data-id="item-c"]')?.tagName).toBe('SPAN')

    dispose()
  })

  it('static-array children control — was always working', () => {
    let renderedItems = 0
    const ItemWrapper = (props: { children?: VNodeChild; position?: number }) => {
      renderedItems++
      return h('li', { 'data-position': props.position }, props.children as never)
    }

    const tree = h(
      Iterator,
      { wrapComponent: ItemWrapper },
      h('span', { 'data-id': 'static-a' }, 'A'),
      h('span', { 'data-id': 'static-b' }, 'B'),
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)
    const dispose = mount(tree as VNode, container)

    expect(renderedItems).toBe(2)
    expect(container.querySelector('[data-id="static-a"]')?.tagName).toBe('SPAN')

    dispose()
  })
})
