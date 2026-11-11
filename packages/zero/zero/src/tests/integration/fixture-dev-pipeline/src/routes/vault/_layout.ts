import { h } from '@pyreon/core'
import { RouterView } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'

// A folder gate: guards every page under vault/ AND its not-found page.
export const middleware: Middleware = (ctx) => {
  if (ctx.req.headers.get('x-auth') !== 'ok') return new Response('vault denied', { status: 401 })
}

export function layout() {
  return h('section', null, 'vault-layout', h(RouterView, null))
}
