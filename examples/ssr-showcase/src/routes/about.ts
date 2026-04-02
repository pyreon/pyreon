import { h } from '@pyreon/core'

/**
 * About page — static content.
 */
export default function AboutPage() {
  return h('div', { 'data-testid': 'about-page' },
    h('h1', null, 'About'),
    h('p', null, 'Pyreon is a signal-based UI framework with SSR, SSG, islands, and SPA support.'),
    h('ul', null,
      h('li', null, 'Fine-grained reactivity via signals'),
      h('li', null, 'Compiled template output'),
      h('li', null, 'Full SSR streaming'),
      h('li', null, 'File-based routing via Zero'),
    ),
  )
}

export const meta = {
  title: 'About — SSR Showcase',
}
