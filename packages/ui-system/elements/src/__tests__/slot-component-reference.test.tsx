// Regression: 0.24.3 (PR #839) added `resolveSlot` to make function-valued
// slot props reactive — `content={() => <X name={signal()} />}`. The
// implementation calls ANY function-typed slot value with no args, which
// crashes when the consumer passes a COMPONENT reference using the
// shorthand `beforeContent={Header}` (Header is `typeof === 'function'`
// too — `resolveSlot` calls it with no props, downstream
// `removeUndefinedProps(undefined)` throws
// `TypeError: Cannot convert undefined or null to object`).
//
// Reported by a real consumer (bokisch.com 0.24.3 → SSG build fails on
// every route that uses `beforeContent={Component}` shorthand —
// `Prerendered 0 page(s) + 404.html`).
//
// The discriminator: framework component functions carry a marker
// (`IS_ROCKETSTYLE` for rocketstyle wrappers, `PYREON__COMPONENT` for
// `@pyreon/elements` components). `resolveSlot` must mount marked
// components via `h(Component, null)` instead of calling bare.
import type { VNode, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import Element from '../Element/component'

// Match the bokisch.com bug shape: a rocketstyle-marked component used
// as a slot reference (NOT wrapped in `() => <Logo />`). The body
// requires non-undefined props — calling it with no args throws,
// exactly mirroring the real `removeUndefinedProps(undefined)` crash.
function makeRocketstyleStub(name: string, content: string) {
  const Component: any = (props: { className?: string } | undefined) => {
    Object.getOwnPropertyDescriptors(props as object)
    return h('div', { 'data-component': name, class: props?.className }, content)
  }
  Component.IS_ROCKETSTYLE = true
  Component.displayName = name
  return Component
}

// Match the @pyreon/elements framework-component shape.
function makeElementStub(name: string, content: string) {
  const Component: any = (props: { className?: string } | undefined) => {
    Object.getOwnPropertyDescriptors(props as object)
    return h('div', { 'data-component': name, class: props?.className }, content)
  }
  Component.PYREON__COMPONENT = `@pyreon/elements/${name}`
  Component.pkgName = '@pyreon/elements'
  return Component
}

/**
 * Walk Element's VNode tree to find ALL accessor-function children and
 * invoke them. Element wraps slot rendering as `{() => resolveSlot(value)}`
 * in the JSX child position — those closures are what mount the slot, and
 * are what crashes in the broken state when `value` is a component
 * reference. Calling the closures mirrors how runtime-dom and
 * runtime-server invoke them during render.
 *
 * Returns the array of accessor results in tree order.
 */
function invokeAllSlotAccessors(root: VNode): unknown[] {
  const results: unknown[] = []
  const visit = (node: VNodeChild | unknown): void => {
    if (typeof node === 'function') {
      // Reactive-accessor child position
      results.push((node as () => unknown)())
      return
    }
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      if (Array.isArray(node)) node.forEach(visit)
      return
    }
    const vnode = node as VNode & { props?: { children?: unknown } }
    // Pyreon `h()` stores JSX children in BOTH `vnode.children` (array)
    // AND `props.children` (single value). The slot-accessor closure
    // typically lands in `props.children` when passed explicitly.
    if (vnode.props && 'children' in vnode.props) {
      visit(vnode.props.children)
    }
    if (Array.isArray(vnode.children)) vnode.children.forEach(visit)
    else if (vnode.children) visit(vnode.children as VNodeChild)
  }
  visit(root)
  return results
}

describe('Element slot — component-reference shorthand (regression #839 follow-up)', () => {
  it('beforeContent={RocketstyleComponent} mounts via h(Component) — does NOT crash', () => {
    const Logo = makeRocketstyleStub('Logo', 'logo')
    const result = Element({
      tag: 'header',
      beforeContent: Logo,
      content: 'title',
    }) as VNode
    expect(() => invokeAllSlotAccessors(result)).not.toThrow()
  })

  it('afterContent={RocketstyleComponent} does not crash', () => {
    const Badge = makeRocketstyleStub('Badge', 'NEW')
    const result = Element({
      tag: 'header',
      content: 'title',
      afterContent: Badge,
    }) as VNode
    expect(() => invokeAllSlotAccessors(result)).not.toThrow()
  })

  it('content={RocketstyleComponent} (simple-element fast path) yields h(Component) VNode', () => {
    const Header = makeRocketstyleStub('Header', 'page header')
    const result = Element({ tag: 'header', content: Header }) as VNode
    const results = invokeAllSlotAccessors(result)
    expect(results.length).toBeGreaterThan(0)
    // First accessor result is the slot content. It must be the VNode
    // `h(Header, null)` — NOT the result of calling Header bare (which
    // would crash in the broken state, OR succeed in pre-PR-839 state
    // by accident if Header doesn't access props).
    const first = results[0] as VNode
    expect(first.type).toBe(Header)
  })

  it('content={ElementComponent} (PYREON__COMPONENT marker) yields h(Component) VNode', () => {
    const Inner = makeElementStub('Inner', 'inner')
    const result = Element({ tag: 'section', content: Inner }) as VNode
    const results = invokeAllSlotAccessors(result)
    expect(results.length).toBeGreaterThan(0)
    const first = results[0] as VNode
    expect(first.type).toBe(Inner)
  })

  // Counter-cases — the discriminator must NOT break the reactive-accessor
  // shape PR #839 fixed.
  it('content={() => <X />} (plain accessor) still calls function bare — reactive intact', () => {
    let called = 0
    const accessor = () => {
      called++
      return h('div', { 'data-accessor': 'called' }, 'accessor-output')
    }
    const result = Element({ tag: 'div', content: accessor }) as VNode
    const results = invokeAllSlotAccessors(result)
    expect(called).toBeGreaterThan(0)
    // Returns the VNode the accessor produced (NOT an `h(accessor, null)` wrap).
    const first = results[0] as VNode
    expect(first.type).toBe('div')
  })

  it('beforeContent={() => h(Component)} (accessor returning a VNode) still works', () => {
    const Logo = makeRocketstyleStub('Logo', 'logo')
    let called = 0
    const result = Element({
      tag: 'header',
      beforeContent: () => {
        called++
        return h(Logo, null)
      },
      content: 'title',
    }) as VNode
    expect(() => invokeAllSlotAccessors(result)).not.toThrow()
    expect(called).toBeGreaterThan(0)
  })
})
