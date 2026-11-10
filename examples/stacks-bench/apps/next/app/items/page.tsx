// /items — a Server Component that reads data on the server, rendered per request.
// https://nextjs.org/docs/app/getting-started/fetching-data
// https://nextjs.org/docs/app/api-reference/functions/connection (opt out of prerendering)
// https://nextjs.org/docs/app/api-reference/components/link
import Link from 'next/link'
import { connection } from 'next/server'
import { formatPrice, listItems } from '@/lib/data'
import { AddItemForm } from './add-item-form'
import { Counter } from './counter'

export default async function ItemsPage() {
  await connection()
  const items = await listItems()

  return (
    <>
      <h1>Items</h1>
      <Counter />
      <ul id="items">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/items/${item.id}`}>{item.name}</Link>{' '}
            <span className="price">{formatPrice(item.price)}</span>
          </li>
        ))}
      </ul>
      <AddItemForm />
    </>
  )
}
