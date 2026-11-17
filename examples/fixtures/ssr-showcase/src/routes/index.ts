import { h } from '@pyreon/core'
import { RouterLink } from '@pyreon/router'
import { Counter } from '../components/Counter'

/**
 * Home page — static SSR page with interactive counter.
 */
export default function HomePage() {
  return h('div', { 'data-testid': 'home-page' },
    h('h1', null, 'SSR Showcase'),
    h('p', null, 'This page was server-side rendered with Pyreon Zero.'),
    h('h2', null, 'Interactive Counter'),
    h(Counter, null),
    // Phase 5 probe link — the ssr-node e2e drives a CLIENT-SIDE navigation
    // to the server-loader route through a real RouterLink (the router's
    // own nav pipeline, incl. the /_pyreon/data single-fetch).
    h(RouterLink as never, { to: '/secret-data', 'data-testid': 'nav-secret' } as never, 'Server data'),
  )
}

export const meta = {
  title: 'Home — SSR Showcase',
}
