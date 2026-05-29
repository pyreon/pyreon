import { h } from '@pyreon/core'

// Layout-less _404: NO sibling `_layout.tsx`. Per PR L5's follow-up,
// the router's `findNotFoundFallback` second-pass walker should still
// pick this up via the page-level fallback path and synthesize the
// `DefaultChromeLayout` wrapper around it.
export default function LayoutlessNotFound() {
  return h(
    'div',
    null,
    h('h1', null, '404 — Layoutless Not Found'),
    h('p', null, 'This is the layout-less variant: no _layout.tsx sibling.'),
  )
}
