import { h } from '@pyreon/core'

export default function NotFound() {
  // If this content ever appears in the response, the layout loader's
  // redirect was NOT honoured — that's the regression we lock against.
  return h('div', null,
    h('h1', null, '404 — should NOT be visible (loader redirects first)'),
  )
}
