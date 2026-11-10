// /items — React Router framework mode, following:
//   https://reactrouter.com/start/framework/data-loading  (server `loader` + loaderData prop)
//   https://reactrouter.com/start/framework/actions       (`action` + <Form method="post"> + actionData)
//   https://reactrouter.com/start/framework/navigating    (<Link>)
// `loader`/`action` are removed from the client bundle by the framework, so
// the data module's store stays on the server (only formatPrice reaches the client).
import { data, Form, Link, redirect } from 'react-router'
import { Counter } from '../counter'
import { addItem, formatPrice, listItems, validateName } from '../data'
import type { Route } from './+types/items'

export async function loader() {
  return { items: await listItems() }
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const check = validateName(formData.get('name'))
  if (!check.ok) return data({ error: check.error }, { status: 400 })
  const item = await addItem(check.name)
  return redirect(`/items/${item.id}`)
}

export default function Items({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main>
      <h1>Items</h1>
      <Counter />
      <ul id="items">
        {loaderData.items.map((item) => (
          <li key={item.id}>
            <Link to={`/items/${item.id}`}>{item.name}</Link>{' '}
            <span className="price">{formatPrice(item.price)}</span>
          </li>
        ))}
      </ul>
      <Form method="post">
        <input name="name" />
        <button type="submit">Add</button>
      </Form>
      {actionData?.error ? <p id="form-error">{actionData.error}</p> : null}
    </main>
  )
}
