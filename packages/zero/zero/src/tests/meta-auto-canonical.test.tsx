/**
 * `<Meta autoCanonical>` — canonical URL (+ og:url) derived from `origin` +
 * the current route path, so every page carries `<link rel="canonical">`
 * without per-route boilerplate. Exercised through the REAL SSR path
 * (RouterProvider + renderWithHead), not a re-implementation.
 */
import { h } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
import { describe, expect, it } from 'vitest'
import { Meta } from '../meta'

async function renderHeadAt(path: string, metaProps: Record<string, unknown>): Promise<string> {
  const routes = [
    { path: '/', component: () => h(Meta, metaProps) },
    { path: '/blog/:slug', component: () => h(Meta, metaProps) },
    { path: '/about', component: () => h(Meta, metaProps) },
  ]
  // Non-lazy components — the initial resolution for `url` is synchronous,
  // so no readiness await is needed before SSR.
  const router = createRouter({ routes, mode: 'history', url: path })
  const r = await renderWithHead(h(RouterProvider, { router }, h(RouterView, {})))
  return r.head
}

describe('<Meta> auto-canonical', () => {
  it('derives canonical + og:url from origin + current route path', async () => {
    const head = await renderHeadAt('/about', { origin: 'https://example.com', title: 'About' })
    expect(head).toContain('<link rel="canonical" href="https://example.com/about"')
    expect(head).toContain('property="og:url" content="https://example.com/about"')
  })

  it('strips a trailing slash from origin (no double slash)', async () => {
    const head = await renderHeadAt('/about', { origin: 'https://example.com/' })
    expect(head).toContain('href="https://example.com/about"')
    expect(head).not.toContain('example.com//about')
  })

  it('works for dynamic route paths', async () => {
    const head = await renderHeadAt('/blog/my-post', { origin: 'https://example.com' })
    expect(head).toContain('<link rel="canonical" href="https://example.com/blog/my-post"')
  })

  it('an explicit canonical always wins', async () => {
    const head = await renderHeadAt('/about', {
      origin: 'https://example.com',
      canonical: 'https://example.com/custom',
    })
    expect(head).toContain('href="https://example.com/custom"')
    expect(head).not.toContain('href="https://example.com/about"')
  })

  it('autoCanonical={false} suppresses derivation', async () => {
    const head = await renderHeadAt('/about', {
      origin: 'https://example.com',
      autoCanonical: false,
    })
    expect(head).not.toContain('rel="canonical"')
  })

  it('no origin → no canonical (prior behaviour unchanged)', async () => {
    const head = await renderHeadAt('/about', { title: 'About' })
    expect(head).not.toContain('rel="canonical"')
  })
})
