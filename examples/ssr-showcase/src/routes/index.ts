import { h } from '@pyreon/core'
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
  )
}

export const meta = {
  title: 'Home — SSR Showcase',
}
