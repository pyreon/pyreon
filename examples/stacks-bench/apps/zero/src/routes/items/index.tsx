// /items — follows docs/src/content/docs/zero.md:
//   "Server Loaders" (index.server.ts sibling), "Server Actions" (route `action` export + <Form>),
//   "Link" (https://pyreon.dev/docs/zero#link), and the create-zero posts/index.tsx list shape.
import { redirect, useLoaderData } from '@pyreon/router'
import { Link } from '@pyreon/zero/link'
import { defineAction, fail, Form, useSubmission } from '@pyreon/zero/actions'
import { Counter } from '../../components/Counter'
import { addItem, formatPrice, type ItemSummary, validateName } from '../../server/data'

export const action = defineAction(async ({ formData }) => {
  const check = validateName(formData?.get('name'))
  if (!check.ok) return fail(400, { error: check.error })
  const item = await addItem(check.name)
  throw redirect(`/items/${item.id}`)
})

export default function ItemsPage() {
  const data = useLoaderData<{ items: ItemSummary[] }>()
  const submission = useSubmission(action)
  return (
    <main>
      <h1>Items</h1>
      <Counter />
      <ul id="items">
        {data.items.map((item) => (
          <li>
            <Link href={`/items/${item.id}`}>{item.name}</Link>{' '}
            <span class="price">{formatPrice(item.price)}</span>
          </li>
        ))}
      </ul>
      <Form action={action}>
        <input name="name" />
        <button type="submit">Add</button>
      </Form>
      {() => {
        const r = submission.result() as { error?: string } | undefined
        return r?.error ? <p id="form-error">{r.error}</p> : null
      }}
    </main>
  )
}
