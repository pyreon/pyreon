import { h } from '@pyreon/core'
import type { Middleware } from '@pyreon/server'
import { useRequestLocals } from '@pyreon/server'
import { defineAction, fail, Form, useSubmission } from '@pyreon/zero/actions'

const counts = ((globalThis as Record<string, unknown>).__zfCounts ??= { app: 0, route: 0 }) as {
  app: number
  route: number
}

// Route middleware — gates the page AND its action.
export const middleware: Middleware = (ctx) => {
  if (ctx.req.method === 'POST') counts.route++
  if (ctx.req.headers.get('x-auth') !== 'ok') return new Response('denied', { status: 401 })
}

export const action = defineAction(async ({ formData }) => {
  const name = String(formData?.get('name') ?? '')
  if (!name) return fail(422, { error: 'name required' })
  return { added: name }
})

export default function Guest() {
  const sub = useSubmission(action)
  return h(
    'main',
    null,
    h('p', { id: 'user' }, String(useRequestLocals().user ?? 'anon')),
    h('p', { id: 'result' }, () => {
      const r = sub.result() as { added?: string; error?: string } | undefined
      return r?.added ? `added:${r.added}` : r?.error ? `error:${r.error}` : 'none'
    }),
    h(Form, { action }, h('input', { name: 'name' })),
  )
}
