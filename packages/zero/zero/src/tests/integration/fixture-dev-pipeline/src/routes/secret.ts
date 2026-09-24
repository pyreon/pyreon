import { h } from '@pyreon/core'
import type { Middleware } from '@pyreon/server'

// Route middleware — must gate the page AND its loader data endpoint in dev,
// exactly as createServer does in production.
export const middleware: Middleware = (ctx) => {
  if (ctx.req.headers.get('x-auth') !== 'ok') return new Response('denied', { status: 401 })
}

export default function Secret() {
  return h('p', null, 'secret page')
}
