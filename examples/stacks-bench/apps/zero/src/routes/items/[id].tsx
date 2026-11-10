// /items/:id — https://pyreon.dev/docs/zero#route-module-exports + #server-loaders
// HTTP 404 for an unknown id: see src/entry-server.ts (KNOWN PYREON DEFECT note).
import { useLoaderData } from '@pyreon/router'
import { Link } from '@pyreon/zero/link'
import { formatPrice, type Item } from '../../server/data'

export default function ItemPage() {
  const data = useLoaderData<{ item: Item }>()
  return (
    <main>
      <h1 id="item-name">{data.item.name}</h1>
      <p>{data.item.description}</p>
      <p class="price">{formatPrice(data.item.price)}</p>
      <Link href="/items">Back</Link>
    </main>
  )
}
