import { notFound, useLoaderData } from '@pyreon/router'
import type { LoaderContext } from '@pyreon/zero'
import type { GetStaticPaths } from '@pyreon/zero/server'
import type { ProductData } from '../../../site/content/model'
import { loadProduct, PRODUCT_IDS } from '../../../site/content/products'
import { ProductPage } from '../../../site/pages/ProductPage'

/** `/products/<id>` — one prerendered page per content file in the app. */
export const getStaticPaths: GetStaticPaths<{ id: string }> = () => PRODUCT_IDS.map((id) => ({ params: { id } }))

export async function loader({ params }: LoaderContext): Promise<ProductData> {
  const data = await loadProduct(params.id ?? '')
  if (!data) notFound()
  return data as ProductData
}

export default function ProductRoute() {
  // Undefined only on a client-only cold start (`vite dev`, SPA fallback):
  // zero mounts first and runs loaders right after; RouterView re-renders
  // this route when the data arrives. Prerendered pages always have it.
  const data = useLoaderData<ProductData | undefined>()
  if (!data) return null
  return <ProductPage data={data} />
}
