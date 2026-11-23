/**
 * @vitest-environment happy-dom
 *
 * `<Link>` / `createLink` under a router `base` (#4269). The router pushes a
 * route path and adds its own base, but the rendered `href` is what a crawler,
 * "open in new tab", a no-JS click and the prerendered SSG HTML use. It used to
 * be `props.href` verbatim, so every `<Link>` on a subpath deploy pointed at the
 * host root (`href="/new"` on a site served from `/showcase/hn-clone/`).
 */
import { h } from '@pyreon/core'
import { createRouter, RouterProvider } from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLink, Link } from '../link'

const routes = [
  { path: '/', component: () => h('div', { id: 'home' }, 'home') },
  { path: '/about', component: () => h('div', { id: 'about' }, 'about') },
]

let host: HTMLElement
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
})
afterEach(() => {
  host.remove()
})

function hrefOf(component: unknown, props: Record<string, unknown>, base?: string): string {
  const router = createRouter({ routes, mode: 'history', ...(base ? { base } : {}), url: '/' })
  mount(h(RouterProvider, { router }, h(component as never, { ...props }, 'go')), host)
  return host.querySelector('a')!.getAttribute('href')!
}

describe('<Link> href under a router base', () => {
  it('prefixes an internal root-relative path with the base', () => {
    expect(hrefOf(Link, { href: '/about' }, '/docs/')).toBe('/docs/about')
    expect(hrefOf(Link, { href: '/' }, '/docs/')).toBe('/docs/')
  })

  it('keeps the query and fragment', () => {
    expect(hrefOf(Link, { href: '/about?tab=1#x' }, '/docs')).toBe('/docs/about?tab=1#x')
  })

  it('leaves the href alone without a base', () => {
    expect(hrefOf(Link, { href: '/about' })).toBe('/about')
  })

  it('never prefixes external, protocol-relative or forced-external hrefs', () => {
    expect(hrefOf(Link, { href: 'https://example.com/x' }, '/docs/')).toBe('https://example.com/x')
    expect(hrefOf(Link, { href: '//cdn.example.com/x' }, '/docs/')).toBe('//cdn.example.com/x')
    expect(hrefOf(Link, { href: 'mailto:a@b.c' }, '/docs/')).toBe('mailto:a@b.c')
    expect(hrefOf(Link, { href: '/raw-file.pdf', external: true }, '/docs/')).toBe('/raw-file.pdf')
  })

  it('createLink passes the based href to the custom component', () => {
    const MyLink = createLink((p) => h('a', { href: p.href }, p.children))
    expect(hrefOf(MyLink, { href: '/about' }, '/docs/')).toBe('/docs/about')
  })

  it('the SSR string (what SSG writes to disk) carries the base', async () => {
    const router = createRouter({ routes, mode: 'history', base: '/docs/', url: '/' })
    const html = await renderToString(h(RouterProvider, { router }, h(Link, { href: '/about' }, 'go')))
    expect(html).toContain('href="/docs/about"')
  })
})
