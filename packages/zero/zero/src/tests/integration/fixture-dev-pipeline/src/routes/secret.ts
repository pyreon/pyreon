import { h } from '@pyreon/core'
import type { Middleware } from '@pyreon/server'
import { defineAction } from '@pyreon/zero/actions'

// Route middleware — must gate the page AND its loader data endpoint in dev,
// exactly as createServer does in production. And the actions declared here.
export const middleware: Middleware = (ctx) => {
  if (ctx.req.headers.get('x-auth') !== 'ok') return new Response('denied', { status: 401 })
}

export const reveal = defineAction(async () => ({ revealed: 'SECRET-ACTION-RAN' }))

export default function Secret() {
  return h('p', { 'data-action': reveal.actionId }, 'secret page')
}
