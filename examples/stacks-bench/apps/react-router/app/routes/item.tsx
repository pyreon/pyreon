// /items/:id — https://reactrouter.com/start/framework/data-loading
// 404 via `throw data(…, { status: 404 })` — https://reactrouter.com/how-to/error-boundary
import { data, Link } from 'react-router'
import { formatPrice, getItem } from '../data'
import type { Route } from './+types/item'

export async function loader({ params }: Route.LoaderArgs) {
  const item = await getItem(Number(params.id))
  if (!item) throw data('Not Found', { status: 404 })
  return { item }
}

export default function ItemPage({ loaderData }: Route.ComponentProps) {
  const { item } = loaderData
  return (
    <main>
      <h1 id="item-name">{item.name}</h1>
      <p>{item.description}</p>
      <p className="price">{formatPrice(item.price)}</p>
      <Link to="/items">Back</Link>
    </main>
  )
}
