import type { ComponentFn, Props } from '@pyreon/core'
import { _rp, For, h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { renderToString } from '..'

// Regression for the SSR `_rp`/`makeReactiveProps` gap.
//
// The compiler wraps `<Comp prop={signalRead}>` as
// `h(Comp, { prop: _rp(() => signalRead) })`. mount.ts (CSR) calls
// `makeReactiveProps` on the raw vnode props before invoking the component, so
// inside the body `props.prop` invokes the getter and returns the resolved
// value. Pre-fix, `runtime-server` skipped that step — components received raw
// `_rp` functions, so `${props.prop}` stringified the function source and any
// downstream attribute / template-literal interpolation embedded code into the
// HTML (e.g. `<a href="() => props.path">` from the fundamentals layout).
//
// hydrate.ts had the same gap; lock-in lives in the runtime-dom suite.

describe('SSR — _rp-wrapped component props are resolved (makeReactiveProps wired into runtime-server)', () => {
  it('resolves `_rp(() => string)` to the string when interpolated in component-emitted HTML', async () => {
    const Link = (props: { to: string }) => h('a', { href: `#${props.to}` }, 'go')
    const html = await renderToString(
      h(Link, { to: _rp(() => '/about') as unknown as string }),
    )
    expect(html).toBe('<a href="#/about">go</a>')
    expect(html).not.toContain('=>')
  })

  it('resolves `_rp` chain when a parent reads its own getter and forwards through another `_rp`', async () => {
    // Layout-shape: outer passes `_rp(() => '/store')` as `path`; NavItem
    // reads `props.path` (which is now a getter) and re-wraps as
    // `_rp(() => props.path)` for the child. SSR must traverse BOTH layers.
    const Inner = (props: { to: string }) => h('a', { href: props.to }, 'x')
    const Outer = (props: { path: string }) =>
      h(Inner, { to: _rp(() => props.path) as unknown as string })
    const html = await renderToString(
      h(Outer, { path: _rp(() => '/store') as unknown as string }),
    )
    expect(html).toBe('<a href="/store">x</a>')
  })

  it('`<For each={items()}>` from a component renders correctly under SSR', async () => {
    // Regression: PR #410's `makeReactiveProps` in `mergeChildrenIntoProps`
    // converts `_rp(() => arr)` props to getters that RESOLVE the array. The
    // `<For>` function is a component (its body returns a ForSymbol vnode),
    // so it goes through that path. Result: the re-emitted ForSymbol vnode
    // has `props.each` as the resolved array, not the function. SSR's For
    // handler used to call `each()` unconditionally → TypeError. Defensive
    // normalization (typeof === 'function' ? each() : each) fixes both shapes.
    type Item = { id: number; name: string }
    const Page = () => {
      const items = () => [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ] as Item[]
      const forProps = {
        each: _rp(items) as unknown as () => Item[],
        by: (r: Item) => r.id,
        children: (r: Item) => h('span', null, r.name),
      }
      return h(For as unknown as ComponentFn, forProps as unknown as Props)
    }
    const html = await renderToString(h(Page, null))
    expect(html).toContain('a')
    expect(html).toContain('b')
    expect(html).not.toContain('SSR Error')
  })

  it('`<For each={arr}>` (already-array form) still renders correctly under SSR', async () => {
    // When `each` is a plain array (not a function), the defensive shape must
    // still iterate. `<For each={[1,2,3]}>` is the typical hand-coded form.
    type Item = { id: number; name: string }
    const forProps = {
      each: [{ id: 1, name: 'plain' }] as unknown as () => Item[],
      by: (r: Item) => r.id,
      children: (r: Item) => h('span', null, r.name),
    }
    const html = await renderToString(
      h(For as unknown as ComponentFn, forProps as unknown as Props),
    )
    expect(html).toContain('plain')
  })

  it('non-`_rp` function props (user-written accessors) still pass through to elements', async () => {
    // `class={() => 'foo'}` is NOT `_rp`-wrapped (it's a user-written
    // accessor, not a compiler emission). makeReactiveProps must leave it as
    // a plain function on `props.class` so the runtime can call it. The SSR
    // attribute renderer already invokes function-typed attribute values, so
    // the result still hits the rendered HTML — but we lock the contract in.
    const Wrapper = (props: { class: () => string }) =>
      h('div', { class: props.class }, 'x')
    const html = await renderToString(h(Wrapper, { class: () => 'foo' }))
    expect(html).toBe('<div class="foo">x</div>')
  })
})
