/**
 * Phase 5 probe — page whose data comes from the `.server.ts` sibling.
 * On SSR the serverLoader runs in-process; on client navigation the router
 * single-fetches `/_pyreon/data?path=/secret-data` (cookies flow).
 */
import { h } from '@pyreon/core'
import { useLoaderData } from '@pyreon/router'

export default function SecretDataPage() {
  const data = useLoaderData<{ secret: string; sawCookie: string }>()
  return h(
    'div',
    { 'data-testid': 'secret-data-page' },
    h('h1', null, 'Server loader'),
    h('p', { 'data-testid': 'secret-value' }, () => data?.secret ?? 'none'),
    h('p', { 'data-testid': 'cookie-flag' }, () => data?.sawCookie ?? 'unknown'),
  )
}
