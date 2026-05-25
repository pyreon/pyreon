// Regression: 0.24.3-0.25.0 `resolveSlot` discriminated via marker only
// (`IS_ROCKETSTYLE` / `PYREON__COMPONENT` / `pkgName`), so a user-authored
// bare-function component passed via the `beforeContent={Header}`
// shorthand took the accessor path — called bare via `Header()` without
// a `runWithHooks` setup window. Any lifecycle hook inside the body
// (`useWindowResize`, `onMount`, `provide`, etc.) fired
// `[Pyreon] onMount() called outside component setup` in dev-mode SSR.
//
// Reported by a real consumer (bokisch.com migrate-to-pyreon branch,
// `@pyreon/elements@0.25.0`):
//   const Header = () => {
//     const size = useWindowResize(200)
//     return <div>{size().width}</div>
//   }
//   Header.displayName = 'MyHeader'
//   <Element beforeContent={Header}>...</Element>
//
// The fix extends `isPyreonComponent` with a Tier 2 naming-convention
// check that catches user-authored bare components (PascalCase `.name`
// OR explicit `displayName`). Such components now route through
// `h(value, null)` and mount via the standard `runWithHooks` setup path
// — exactly like marker-carrying components.
import type { VNode, VNodeChild } from '@pyreon/core'
import { h, onMount, onUnmount } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import Element from '../Element/component'

/** Walk the JSX tree, invoke every accessor-function child, collect results. */
function invokeAccessors(root: VNode): VNode[] {
  const results: VNode[] = []
  const visit = (node: VNodeChild | unknown): void => {
    if (typeof node === 'function') {
      const v = (node as () => unknown)()
      if (v && typeof v === 'object' && !Array.isArray(v)) results.push(v as VNode)
      else if (Array.isArray(v)) v.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    const vnode = node as VNode & { props?: { children?: unknown } }
    if (vnode.props && 'children' in vnode.props) visit(vnode.props.children)
    if (Array.isArray(vnode.children)) vnode.children.forEach(visit)
    else if (vnode.children) visit(vnode.children as VNodeChild)
  }
  visit(root)
  return results
}

describe('Element resolveSlot — bare-function components with hooks (regression)', () => {
  it('routes a PascalCase bare component via h(), not bare call', () => {
    // Mirrors the bokisch.com Header shape: bare arrow assigned to
    // PascalCase const, no IS_ROCKETSTYLE / PYREON__COMPONENT marker.
    const Header = () => h('div', { 'data-bare': 'true' }, 'header')

    const tree = (Element as any)({ tag: 'header', beforeContent: Header }) as VNode
    const slotChildren = invokeAccessors(tree)

    // Find any VNode whose `type` is the Header function reference —
    // proves it was mounted as a component (h(Header, null)) rather
    // than called bare (which would have returned `<div data-bare/>`).
    const componentVNode = slotChildren.find(
      (v) => typeof v.type === 'function' && v.type === Header,
    )
    expect(componentVNode).toBeDefined()
    expect(componentVNode!.type).toBe(Header)
  })

  it('routes a function with displayName via h(), not bare call', () => {
    // Anonymous arrow with explicit displayName — common React-migration
    // shape. Tier 2 picks it up via displayName.
    const Comp: any = () => h('div', null, 'x')
    Object.defineProperty(Comp, 'name', { value: '' }) // anonymous
    Comp.displayName = 'MyHeader'

    const tree = (Element as any)({ tag: 'header', beforeContent: Comp }) as VNode
    const slotChildren = invokeAccessors(tree)
    const componentVNode = slotChildren.find((v) => v.type === Comp)
    expect(componentVNode).toBeDefined()
  })

  it('bare component using onMount inside resolveSlot does NOT warn', () => {
    // The exact bug shape: a bare PascalCase component uses a lifecycle
    // hook. Pre-fix, calling it bare hit `_current === null` → warning.
    // Post-fix, it's mounted via h() → standard component path →
    // `runWithHooks` establishes a setup window before the body runs.
    let warnCalls: unknown[][] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => { warnCalls.push(args) }

    try {
      // Component using onMount + onUnmount (covers the report's
      // useWindowResize shape, which internally calls onMount).
      const Header = () => {
        onMount(() => {})
        onUnmount(() => {})
        return h('div', null, 'x')
      }

      const tree = (Element as any)({ tag: 'header', beforeContent: Header }) as VNode
      // Invoking the slot accessor at this layer is what reproduces the
      // bug: the JSX runtime emits `{() => resolveSlot(beforeContent)}`,
      // and the accessor runs at mount time. We don't actually mount
      // anything to the DOM — we just exercise resolveSlot.
      invokeAccessors(tree)

      // Filter for the specific "outside component setup" warning.
      const setupWarnings = warnCalls.filter((args) =>
        args.some((a) => typeof a === 'string' && a.includes('called outside component setup')),
      )
      expect(setupWarnings).toEqual([])
    } finally {
      console.warn = originalWarn
    }
  })

  it('anonymous reactive accessor `() => <Comp/>` STILL takes bare-call path', () => {
    // The Tier 2 naming-convention check explicitly excludes anonymous
    // arrows — their `.name === ""` does not match the PascalCase check.
    // This preserves the reactive-accessor pattern documented since the
    // original Element API.
    const Inner = () => h('div', null, 'inner')
    let accessorRan = false
    const accessor: any = () => {
      accessorRan = true
      return h(Inner, null)
    }
    // Ensure name is empty (anonymous shape)
    Object.defineProperty(accessor, 'name', { value: '' })

    const tree = (Element as any)({ tag: 'header', beforeContent: accessor }) as VNode
    invokeAccessors(tree)
    // The accessor itself was CALLED (not wrapped in h()) — the inner
    // Inner component, on the other hand, would be routed through h()
    // by its own VNode-ness.
    expect(accessorRan).toBe(true)
  })

  it('camelCase helper `getContent` STILL takes bare-call path', () => {
    // Helpers named with camelCase (`getContent`, `renderHeader`, etc.)
    // are by convention NOT components. Tier 2 leaves them on the
    // accessor path so existing helper-returning-VNode patterns work.
    let called = false
    const getContent = () => {
      called = true
      return h('div', null, 'content')
    }

    const tree = (Element as any)({ tag: 'header', beforeContent: getContent }) as VNode
    invokeAccessors(tree)
    expect(called).toBe(true)
  })
})
