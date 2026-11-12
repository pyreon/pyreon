import { h } from '@pyreon/core'

/**
 * Different text on the server and in the browser: a hydration mismatch.
 *
 * Written with `h()` on purpose. The runtime reports a text divergence on
 * the `h()` hydration path, but not yet inside an adopted compiled JSX
 * template (pyreon/pyreon#4419), and the overlay can only show what the
 * runtime reports.
 */
export default function Where() {
  return h('p', { id: 'where' }, typeof window === 'undefined' ? 'Rendered on the server' : 'Rendered in the browser')
}
