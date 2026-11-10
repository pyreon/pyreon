// /items — https://tanstack.com/start/latest/docs/framework/react/guide/data-loading (loader → server fn)
//          https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
//            (FormData POST; `.url` on a plain <form> for no-JS progressive enhancement; useServerFn so a
//             thrown redirect navigates client-side)
//          https://tanstack.com/router/latest/docs/framework/react/guide/navigation (<Link>)
import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Counter } from '#/lib/counter'
import { formatPrice } from '#/lib/data'
import { addItemFn, getItems } from '#/lib/items.functions'

export const Route = createFileRoute('/items/')({
  loader: () => getItems(),
  component: Items,
})

function Items() {
  const items = Route.useLoaderData()
  const addItem = useServerFn(addItemFn)
  const [error, setError] = useState<string | null>(null)
  return (
    <main>
      <h1>Items</h1>
      <Counter />
      <ul id="items">
        {items.map((item) => (
          <li key={item.id}>
            <Link to="/items/$id" params={{ id: String(item.id) }}>
              {item.name}
            </Link>{' '}
            <span className="price">{formatPrice(item.price)}</span>
          </li>
        ))}
      </ul>
      <form
        method="post"
        action={addItemFn.url}
        encType="multipart/form-data"
        onSubmit={async (e) => {
          e.preventDefault()
          const result = await addItem({ data: new FormData(e.currentTarget) })
          setError(result?.error ?? null)
        }}
      >
        <input name="name" />
        <button type="submit">Add</button>
      </form>
      {error ? <p id="form-error">{error}</p> : null}
    </main>
  )
}
