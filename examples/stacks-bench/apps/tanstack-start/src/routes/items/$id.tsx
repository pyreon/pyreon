// /items/:id — https://tanstack.com/start/latest/docs/framework/react/guide/data-loading
// Unknown id: the server function throws notFound() —
//   https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors
import { createFileRoute, Link } from '@tanstack/react-router'
import { formatPrice } from '#/lib/data'
import { getItemById } from '#/lib/items.functions'

export const Route = createFileRoute('/items/$id')({
  loader: ({ params }) => getItemById({ data: Number(params.id) }),
  notFoundComponent: () => <h1>Not Found</h1>,
  component: ItemPage,
})

function ItemPage() {
  const item = Route.useLoaderData()
  return (
    <main>
      <h1 id="item-name">{item.name}</h1>
      <p>{item.description}</p>
      <p className="price">{formatPrice(item.price)}</p>
      <Link to="/items">Back</Link>
    </main>
  )
}
