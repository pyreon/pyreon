/** @jsxImportSource @pyreon/core */
/**
 * Regression: `kinetic('div').stagger()` with `show={() => true}` +
 * `appear` + multiple component-VNode children rendered `<undefined>`
 * tags in place of the children's actual DOM post-hydrate.
 *
 * Real-app reporter (examples/bokisch.com Intro section): SSG'd HTML
 * carried `<h1>Hello</h1>` + tagline + icons; client hydration produced
 * `<undefined></undefined>` tags (literal HTML element with tagName
 * "UNDEFINED") + `<!--pyreon-->` markers in place of every child.
 *
 * Bug class — Pyreon-compiler prop-inlining + cloneVNode-on-a-function:
 *
 *   1. The compiler rewrites local `const children = obj.x` then
 *      `<Comp>{children}</Comp>` as `Comp({..., children: () => obj.x})`.
 *      Component receives `props.children` as a FUNCTION, not an array.
 *
 *   2. StaggerRenderer iterated `(Array.isArray(children) ? children : [children])`
 *      directly. `[function].filter(isVNode)` collapsed to `[]` → the
 *      kinetic `<div>` rendered with zero children.
 *
 *   3. Even after StaggerRenderer's fix, TransitionItem's `cloneVNode(props.children, {ref})`
 *      tried to clone the same function-wrapped value (also auto-wrapped
 *      by the compiler one level down — `{cloneVNode(child, {style})}`
 *      became `() => cloneVNode(child, {style})`). Spreading a function
 *      via `{...fn, props: {...}}` yields `{props: {...}}` (no own
 *      enumerable properties on functions) — the resulting vnode had
 *      `type: undefined`. mountElement called `document.createElement(undefined)`
 *      → the browser produced literal `<undefined>` tags.
 *
 * Fix: `resolveChildren` helper in both StaggerRenderer (iteration) AND
 * TransitionItem (cloning). Unwraps function-wrapped children eagerly
 * since kinetic snapshots children at render time and does not observe
 * children changes.
 *
 * Bisect-verified: reverting either `resolveChildren` call in this PR
 * fails this spec — StaggerRenderer revert produces zero children in the
 * kinetic `<div>`; TransitionItem revert produces `<undefined>` tags
 * with the right cloned style.
 */
import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import kinetic from '../kinetic'
import TransitionItem from '../kinetic/TransitionItem'

// Build a kinetic Component VNode whose `props.children` is a FUNCTION
// (not an array), mirroring what the Pyreon vite-plugin emits when JSX
// children are inlined back at the call site (`<Entrance>{children}</Entrance>`
// → `jsx(Entrance, { children: () => h.children })`). The kinetic test
// pipeline uses `vl_rolldown_build` which does NOT do Pyreon's
// prop-inlining, so we construct the shape directly.
const buildEntranceWithFunctionChildren = (
  // Wider call signature — kinetic('div').stagger() returns a stagger-mode
  // component whose precise typed shape (`KineticComponent<'div', 'stagger'>`)
  // is narrower than what `kinetic()`'s default returns. The function-
  // children wrapper bypasses the strict children-required typing.
  Entrance: (props: Record<string, unknown>) => VNode | null,
  childArray: VNode[],
): VNode => {
  // h() puts children in vnode.children (rest args). For mountComponent's
  // merge to leave props.children alone, set it explicitly here.
  return h(Entrance, {
    show: () => true,
    appear: true,
    children: (() => childArray) as unknown as VNode[],
  })
}

let containers: HTMLElement[] = []
afterEach(() => {
  for (const c of containers) c.remove()
  containers = []
})

describe('kinetic("div").stagger() — function-wrapped children survive render', () => {
  it('iterates function-wrapped children correctly (no <undefined> tags)', () => {
    const Entrance = kinetic('div')
      .enter({ opacity: '0' })
      .enterTo({ opacity: '1' })
      .stagger({ interval: 20 })

    const tree = buildEntranceWithFunctionChildren(Entrance as never, [
      h('h1', { 'data-id': 'heading' }, 'Hello'),
      h('p', { 'data-id': 'tagline' }, 'tagline'),
      h('ul', { 'data-id': 'icons' }, h('li', null, 'icon-a')),
    ])

    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)

    const dispose = mount(tree as VNode, container)

    // Children are rendered with proper element tags — NOT <undefined>
    const heading = container.querySelector('[data-id="heading"]')
    const tagline = container.querySelector('[data-id="tagline"]')
    const icons = container.querySelector('[data-id="icons"]')

    expect(
      heading,
      `heading missing — pre-fix the function-wrapped child got mounted as <undefined>. ` +
        `container.innerHTML=${container.innerHTML.slice(0, 600)}`,
    ).not.toBeNull()
    expect(heading?.tagName).toBe('H1')
    expect(heading?.textContent).toBe('Hello')

    expect(tagline).not.toBeNull()
    expect(tagline?.tagName).toBe('P')

    expect(icons).not.toBeNull()
    expect(icons?.tagName).toBe('UL')

    // Sanity: no `<undefined>` tags should exist anywhere (pre-fix
    // TransitionItem's cloneVNode(props.children, {ref}) on a function
    // produced `{type: undefined, props: {ref}}` → mountElement called
    // document.createElement(undefined) → `<undefined>` element).
    expect(container.querySelector('undefined')).toBeNull()

    dispose()
  })

  it('TransitionItem resolves function-wrapped children before cloneVNode (no <undefined> tag)', () => {
    // Direct test for the SECOND fix-site — TransitionItem's
    // `cloneVNode(props.children, {ref})`. Pre-fix, when the parent
    // (StaggerRenderer/GroupRenderer) emits `<TransitionItem>{cloneVNode(c, {style})}</TransitionItem>`
    // under the Pyreon vite-plugin, the compiler wraps the JSX child as
    // `() => cloneVNode(c, {style})`. TransitionItem then receives
    // `props.children = function`. `cloneVNode(function, {ref})` spreads
    // the function (no own enumerable properties) → produces
    // `{type: undefined, props: {ref}}` → mountElement creates literal
    // `<undefined>` tag.
    const childVNode = h('h1', { 'data-id': 'ti-heading' }, 'Hello')
    const tree = h(TransitionItem, {
      show: () => true,
      appear: false,
      timeout: 100,
      enterStyle: { opacity: '0' },
      enterToStyle: { opacity: '1' },
      enterTransition: 'opacity 50ms ease',
      // Function-wrapped children, mirroring the compiler's emit.
      children: (() => childVNode) as unknown as VNode,
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)

    const dispose = mount(tree as VNode, container)

    const heading = container.querySelector('[data-id="ti-heading"]')
    expect(
      heading,
      `heading missing — pre-fix TransitionItem cloned the function, ` +
        `producing <undefined>. container.innerHTML=${container.innerHTML.slice(0, 400)}`,
    ).not.toBeNull()
    expect(heading?.tagName).toBe('H1')
    expect(heading?.textContent).toBe('Hello')
    expect(container.querySelector('undefined')).toBeNull()

    dispose()
  })

  it('iterates static-array children correctly (control — was always working)', () => {
    const Entrance = kinetic('div')
      .enter({ opacity: '0' })
      .enterTo({ opacity: '1' })
      .stagger({ interval: 20 })

    // No compiler wrap — children as a plain array.
    const tree = h(
      Entrance,
      { show: () => true, appear: true },
      h('h1', { 'data-id': 'heading-static' }, 'Static'),
      h('p', { 'data-id': 'tagline-static' }, 't'),
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)

    const dispose = mount(tree as VNode, container)

    expect(container.querySelector('[data-id="heading-static"]')?.tagName).toBe('H1')
    expect(container.querySelector('[data-id="tagline-static"]')?.tagName).toBe('P')
    expect(container.querySelector('undefined')).toBeNull()

    dispose()
  })
})
