import { createContext, useContext } from '@pyreon/core'
import type { ProductData } from '../site/content/model'
import { hasProduct, loadProduct } from '../site/content/products'
import type { ProductsIndexPage } from '../site/content/types-site'
import { PRODUCTS } from '../site/nav'
import { FLAT, overviewProductAt, railProductOf, type SidebarBadge } from './nav'
import type { TocHeading } from './toc'

export type ProductSummary = ProductsIndexPage['products'][number]

/**
 * What a docs page needs beyond its Markdown, loaded by the docs route BEFORE
 * the page renders (on the server for the prerender, on the client before
 * hydration), so the selling slots render synchronously and the server HTML
 * is adopted as is:
 *
 *   - `product`: the full content file (`content/<id>.json`) of the product
 *     this page is the overview of. Only overview pages load one; the slots
 *     that need it (`<ProductPitch>`, `<LiveDemo>`, `<BenchCallout>`,
 *     `<ComingFrom>`, `<CrossSell id>`) render nothing anywhere else, and a
 *     test keeps writers from placing them elsewhere.
 *   - `rail`: the one product the right rail suggests: name, package and
 *     category from the products index and its sidebar badge (the proof line,
 *     with its source), data the shell already carries, so the card costs a
 *     page no extra request.
 *
 * A product whose content file is not in the app yet (product slices are
 * still adding them) is simply absent: its slots are invisible, not broken.
 */
export interface RailProduct {
  id: string
  name: string
  package: string
  category: string
  href: string
  badge: SidebarBadge | undefined
}

/** The rail card's data for a product id. Pure; exported for tests. */
export function railProduct(id: string | undefined): RailProduct | undefined {
  const p = id === undefined ? undefined : PRODUCTS.find((x) => x.id === id)
  if (!p) return undefined
  const item = FLAT.find((f) => f.item.productId === id)?.item
  return { id: p.id, name: p.name, package: p.package, category: p.category, href: `/products/${p.id}`, badge: item?.badge }
}

export interface DocsPageData {
  product: ProductData | undefined
  rail: RailProduct | undefined
  /** TOC entries the overview's selling slots add above / below the Markdown (`sell/slots.ts`). */
  slots: { before: TocHeading[]; after: TocHeading[] }
}

export const EMPTY_PAGE_DATA: DocsPageData = { product: undefined, rail: undefined, slots: { before: [], after: [] } }

export const DocsDataContext = createContext<DocsPageData>(EMPTY_PAGE_DATA)

export const useDocsData = (): DocsPageData => useContext(DocsDataContext)

export async function loadPageData(path: string, railOverride?: string): Promise<DocsPageData> {
  const productId = overviewProductAt(path)
  const railId = railOverride ?? railProductOf(path)
  const product = productId && hasProduct(productId) ? await loadProduct(productId) : undefined
  // The slot module (and the demo registry it reads) loads only for an overview page.
  const slots = product ? (await import('./sell/slots')).slotHeadings(product) : EMPTY_PAGE_DATA.slots
  return { product, rail: railProduct(railId), slots }
}
