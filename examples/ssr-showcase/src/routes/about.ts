import { h } from '@pyreon/core'
import { styled } from '@pyreon/styler'

// A styled element so SSG output exercises the @pyreon/styler runtime
// flush. Without this, ssr-showcase's SSG cells render styler-free routes
// and the SSG-styler regression check in scripts/verify-modes.ts has
// nothing to assert against. The styled span here ensures `sheet.ssrBuffer`
// is populated during SSG, so the rendered HTML's `<head>` should contain
// `<style data-pyreon-styler="...">` after the styler-flush wiring in
// ssg-plugin.ts.
const Highlight = styled('span')`
  background: yellow;
  padding: 0 4px;
  border-radius: 2px;
`

/**
 * About page — static content.
 */
export default function AboutPage() {
  return h(
    'div',
    { 'data-testid': 'about-page' },
    h('h1', null, 'About'),
    h('p', null, 'Pyreon is a signal-based UI framework with SSR, SSG, islands, and SPA support.'),
    h(
      'ul',
      null,
      h('li', null, 'Fine-grained reactivity via signals'),
      h('li', null, 'Compiled template output'),
      h('li', null, 'Full SSR streaming'),
      h('li', null, 'File-based routing via Zero'),
    ),
    h(Highlight, null, 'Built with care.'),
  )
}

export const meta = {
  title: 'About — SSR Showcase',
}
