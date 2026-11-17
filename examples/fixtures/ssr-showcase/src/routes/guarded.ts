/**
 * Route-middleware probe for the production e2e gates (ssr-node / isr-node).
 *
 * `middleware` is zero's documented per-route auth hook. The 2026-09 audit
 * showed it protected only a bare full-page GET: appending `?x` skipped it,
 * and the single-fetch data endpoint (`/_pyreon/data?path=/guarded`, which
 * every client-side navigation uses) returned the serverLoader's data without
 * running it at all. The e2e specs assert every one of those paths is 401.
 */
import { h } from '@pyreon/core'
import { useLoaderData } from '@pyreon/router'
import { defineAction } from '@pyreon/zero/actions'

export const middleware = (ctx: { req: Request }) => {
  if (ctx.req.headers.get('x-demo-auth') !== 'let-me-in') {
    return new Response('Unauthorized', { status: 401 })
  }
}

// Declared on this guarded page, so this page's middleware gates it on
// `/_zero/actions/<id>` and when posted to any other page via `?_action=`.
export const guardedAction = defineAction(async () => ({ ran: 'GUARDED_ACTION_SENTINEL_q7v1' }))

export default function GuardedPage() {
  const data = useLoaderData<{ secret: string }>()
  return h(
    'div',
    { 'data-testid': 'guarded-page', 'data-action': guardedAction.actionId },
    h('h1', null, 'Guarded'),
    h('p', { 'data-testid': 'guarded-secret' }, () => data?.secret ?? 'none'),
  )
}
