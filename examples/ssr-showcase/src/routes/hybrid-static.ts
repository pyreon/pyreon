/**
 * Phase 2 probe — a route that declares `renderMode = 'ssg'` inside this
 * SSR-mode app. The hybrid build prerenders it to `dist/hybrid-static/
 * index.html`; the emitted node/bun servers serve that file static-first.
 *
 * The loader captures a timestamp AT RENDER TIME — the e2e's static-first
 * proof: two requests against the production server return the SAME value
 * (baked at build), where an SSR render would produce a fresh one per hit.
 */
import { h } from '@pyreon/core'
import { useLoaderData } from '@pyreon/router'

export const renderMode = 'ssg'

export async function loader() {
  return { renderedAt: Date.now() }
}

export default function HybridStaticPage() {
  const data = useLoaderData<{ renderedAt: number }>()
  return h(
    'div',
    { 'data-testid': 'hybrid-static-page' },
    h('h1', null, 'Hybrid static'),
    h('p', { 'data-testid': 'hybrid-static-stamp' }, () => String(data?.renderedAt ?? 'none')),
  )
}
