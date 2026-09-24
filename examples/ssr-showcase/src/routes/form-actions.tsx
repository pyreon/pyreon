/**
 * Server functions probe — a route-level `action` export submitted through
 * `<Form>`. Works with JavaScript disabled (real form POST → the server runs
 * the action → re-render or 303) and enhanced with JavaScript (fetch, no
 * navigation, loaders revalidate). Driven by `e2e/ssr-node.spec.ts`.
 */
import { redirect, useLoaderData } from '@pyreon/router'
import { defineAction, fail, Form, useSubmission } from '@pyreon/zero/actions'
import { addEntry } from '../server/guestbook'

export const action = defineAction(async ({ formData }) => {
  const name = String(formData?.get('name') ?? '').trim()
  if (!name) return fail(422, { error: 'Name is required' })
  addEntry(name)
  if (formData?.get('intent') === 'redirect') throw redirect('/about')
  return { added: name }
})

export default function FormActionsPage() {
  const data = useLoaderData<{ entries: string[] }>()
  const sub = useSubmission(action)
  return (
    <div data-testid="form-actions-page">
      <h1>Server functions</h1>
      <ul data-testid="entries">
        {() => (data?.entries ?? []).map((e) => <li>{e}</li>)}
      </ul>
      <Form action={action} data-testid="guestbook-form">
        <input name="name" data-testid="name-input" />
        <button type="submit" data-testid="submit">Sign</button>
        <button type="submit" name="intent" value="redirect" data-testid="submit-redirect">
          Sign and leave
        </button>
      </Form>
      <p data-testid="pending">{() => (sub.pending() ? `saving ${String(sub.input()?.get('name') ?? '')}` : 'idle')}</p>
      <p data-testid="result">
        {() => {
          const r = sub.result() as { added?: string; error?: string } | undefined
          if (r?.error) return `error: ${r.error}`
          if (r?.added) return `added: ${r.added}`
          return 'none'
        }}
      </p>
    </div>
  )
}
