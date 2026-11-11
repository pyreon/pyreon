import { createContext, useContext } from '@pyreon/core'
import type { ProductData } from '../site/content/model'
import { hasProduct, loadProduct } from '../site/content/products'
import type { ProductsIndexPage } from '../site/content/types-site'
import { overviewAt, railProductOf } from './nav'
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
 *   - `rail`: the one product the right rail suggests (`_products.json`).
 *
 * A product whose content file is not in the app yet (product slices are
 * still adding them) is simply absent: its slots are invisible, not broken.
 */
export interface DocsPageData {
  product: ProductData | undefined
  rail: ProductSummary | undefined
  /** TOC entries the overview's selling slots add above / below the Markdown (`sell/slots.ts`). */
  slots: { before: TocHeading[]; after: TocHeading[] }
}

export const EMPTY_PAGE_DATA: DocsPageData = { product: undefined, rail: undefined, slots: { before: [], after: [] } }

export const DocsDataContext = createContext<DocsPageData>(EMPTY_PAGE_DATA)

export const useDocsData = (): DocsPageData => useContext(DocsDataContext)

/** Every product summary (`_products.json`), one lazy chunk shared by the rail and the sell components. */
export async function loadSummaries(): Promise<readonly ProductSummary[]> {
  const m = await import('../site/content/_products.json')
  return (m.products ?? []) as ProductSummary[]
}

export async function loadPageData(path: string, railOverride?: string): Promise<DocsPageData> {
  const overview = overviewAt(path)
  const railId = railOverride ?? railProductOf(path)
  const [product, summaries] = await Promise.all([
    overview && hasProduct(overview.productId) ? loadProduct(overview.productId) : Promise.resolve(undefined),
    railId ? loadSummaries() : Promise.resolve([] as readonly ProductSummary[]),
  ])
  // The slot module (and the demo registry it reads) loads only for an overview page.
  const slots = product ? (await import('./sell/slots')).slotHeadings(product) : EMPTY_PAGE_DATA.slots
  return { product, rail: railId ? summaries.find((s) => s.id === railId) : undefined, slots }
}
