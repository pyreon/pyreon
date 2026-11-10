// /items/[id] — Server Component, dynamic segment, notFound() for an unknown id.
// https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes
// https://nextjs.org/docs/app/api-reference/functions/not-found
// https://nextjs.org/docs/app/api-reference/components/link
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatPrice, getItem } from '@/lib/data'

export default async function ItemPage({ params }: PageProps<'/items/[id]'>) {
  const { id } = await params
  const item = await getItem(Number(id))

  if (!item) {
    notFound()
  }

  return (
    <>
      <h1 id="item-name">{item.name}</h1>
      <p>{item.description}</p>
      <p className="price">{formatPrice(item.price)}</p>
      <Link href="/items">Back</Link>
    </>
  )
}
