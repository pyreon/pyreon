import { h } from '@pyreon/core'
import { redirect, RouterView } from '@pyreon/router'

export function layout() {
  return h(
    'div',
    { 'data-layout': 'auth-gated' },
    h(RouterView, null),
  )
}

/**
 * Parent-layout loader that throws `redirect()`. Simulates auth-gated
 * layouts: when an anonymous user hits ANY path under this layout
 * (including unmatched URLs that would otherwise render `_404.tsx`),
 * the loader fires, decides no session is present, throws redirect.
 *
 * In `mode: 'ssr'` dev this already worked via the upstream SSR
 * middleware. In `mode: 'ssg'` / `mode: 'spa'` dev — BEFORE the bug fix
 * — the loader never ran (bare HTML), so this was unreachable. AFTER
 * the fix, renderSsr runs the layout loader for unmatched URLs too, so
 * the redirect path needs to be exercised at least once for regression
 * coverage.
 */
export function loader(): never {
  throw redirect('/login', 307)
}
