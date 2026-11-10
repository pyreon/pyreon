/**
 * Folder-gate probe for the ssr-node e2e: a `_layout` middleware guards the
 * pages under `vault/` AND the folder's not-found page, which renders this
 * layout (and runs its loader) for any unknown `/vault/*` URL.
 */
import { h } from '@pyreon/core'
import type { Middleware } from '@pyreon/server'
import { RouterView } from '@pyreon/router'

export const middleware: Middleware = (ctx) => {
  if (ctx.req.headers.get('x-demo-auth') !== 'let-me-in') {
    return new Response('Unauthorized', { status: 401 })
  }
}

export const loader = () => ({ vault: 'VAULT_LAYOUT_SENTINEL_p3x9' })

export function layout() {
  return h('section', { 'data-testid': 'vault-layout' }, h(RouterView, null))
}
