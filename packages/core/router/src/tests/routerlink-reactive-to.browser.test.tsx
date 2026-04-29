import { _rp, h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRouter, RouterLink, RouterProvider, useIsActive } from '../index'
import { setActiveRouter } from '../router'

describe('RouterLink reactive `to` prop', () => {
  beforeEach(() => {
    window.location.hash = ''
  })
  afterEach(() => {
    setActiveRouter(null)
    window.location.hash = ''
  })

  it('resolves _rp-wrapped `to` accessor to its string value, not the function literal', async () => {
    const routes = [{ path: '/', component: () => h('div', null, 'home') }]
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(
        RouterProvider,
        { router },
        h(RouterLink, { to: _rp(() => '/about') as unknown as string, id: 'link' }, 'Go'),
      ),
    )
    await flush()
    const link = container.querySelector<HTMLAnchorElement>('#link')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('#/about')
    unmount()
  })

  it('NavItem-shape: parent gets `path` as `_rp` getter and forwards it to RouterLink', async () => {
    // Mirrors `examples/fundamentals-playground/src/routes/_layout.tsx`:
    //   function NavItem(props) {
    //     return <RouterLink to={props.path} ...>{props.label}</RouterLink>
    //   }
    //   <NavItem path={tab.path} ... />
    // The compiler emits `_rp(() => tab.path)` for the parent's `path` prop,
    // which `makeReactiveProps` turns into a getter on NavItem's `props`.
    // Then `<RouterLink to={props.path}>` re-wraps that getter access as
    // `_rp(() => props.path)`. The outermost getter points back through
    // NavItem's getter to the literal value.
    const NavItem = (props: Record<string, unknown>) =>
      h(RouterLink, {
        to: _rp(() => props.path as string) as unknown as string,
        id: 'nav-link',
      })

    const routes = [
      { path: '/', component: () => h('div', { id: 'home' }, 'home') },
      { path: '/about', component: () => h('div', { id: 'about' }, 'about') },
    ]
    const router = createRouter({ routes, mode: 'hash' })
    const { container, unmount } = mountInBrowser(
      h(
        RouterProvider,
        { router },
        h(NavItem, { path: _rp(() => '/about') as unknown as string }),
      ),
    )
    await flush()
    const link = container.querySelector<HTMLAnchorElement>('#nav-link')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('#/about')
    expect(link!.getAttribute('href')).not.toContain('=>')
    unmount()
  })

  it('activeClass updates reactively when `to` is `_rp`-wrapped and route changes', async () => {
    // Pre-fix, `RouterLink`'s own `activeClass` computation read `props.to`
    // ONCE at component setup time and compared against the current path.
    // Even if `props.to` correctly resolved to the string, the comparison
    // was static — `activeClass` was a function returning a string but the
    // captured `target = props.to` (declared inline) was hoisted in setup
    // scope. After fixing setup-time captures of `props.to` (so the activeClass
    // accessor reads `props.to` lazily on each invocation), navigation
    // updates the class reactively.
    const routes = [
      { path: '/', component: () => h('div', { id: 'home' }, 'home') },
      { path: '/about', component: () => h('div', { id: 'about' }, 'about') },
    ]
    const router = createRouter({ routes, mode: 'hash' })

    const NavItem = (props: Record<string, unknown>) =>
      h(RouterLink, {
        to: _rp(() => props.path as string) as unknown as string,
        id: `link-${(props as { _id: string })._id}`,
      })

    const { container, unmount } = mountInBrowser(
      h(
        RouterProvider,
        { router },
        h('div', null, [
          h(NavItem, { _id: 'home', path: _rp(() => '/') as unknown as string }),
          h(NavItem, { _id: 'about', path: _rp(() => '/about') as unknown as string }),
        ]),
      ),
    )
    await flush()

    // RouterLink applies the default `router-link-active` class when the
    // current path matches `to`.
    expect(container.querySelector('#link-home')!.className).toContain('router-link-active')
    expect(container.querySelector('#link-about')!.className).not.toContain('router-link-active')

    await router.push('/about')
    await flush()

    expect(container.querySelector('#link-about')!.className).toContain('router-link-active')
    expect(container.querySelector('#link-home')!.className).not.toContain('router-link-active')
    unmount()
  })

  it('useIsActive(props.path) reactively flips when current route matches', async () => {
    // The full fundamentals layout shape: NavItem reads `props.path` (a
    // getter from `_rp`) and passes it BOTH to `RouterLink.to` AND to
    // `useIsActive`. Pre-fix, `useIsActive(props.path)` captured the
    // getter as the `path` argument — non-string — and silently returned
    // false for every route check.
    const routes = [
      { path: '/', component: () => h('div', { id: 'home' }, 'home') },
      { path: '/about', component: () => h('div', { id: 'about' }, 'about') },
    ]
    const router = createRouter({ routes, mode: 'hash' })

    const NavItem = (props: Record<string, unknown>) => {
      const isActive = useIsActive(props.path as string, true)
      return h(RouterLink, {
        to: _rp(() => props.path as string) as unknown as string,
        id: `link-${(props as { _id: string })._id}`,
        class: () => (isActive() ? 'is-active' : ''),
      })
    }

    const { container, unmount } = mountInBrowser(
      h(
        RouterProvider,
        { router },
        h('div', null, [
          h(NavItem, { _id: 'home', path: _rp(() => '/') as unknown as string }),
          h(NavItem, { _id: 'about', path: _rp(() => '/about') as unknown as string }),
        ]),
      ),
    )
    await flush()

    await router.push('/about')
    await flush()

    // The /about NavItem's useIsActive should now be true → className
    // includes 'is-active'.
    expect(container.querySelector('#link-about')!.className).toContain('is-active')
    expect(container.querySelector('#link-home')!.className).not.toContain('is-active')
    unmount()
  })
})
