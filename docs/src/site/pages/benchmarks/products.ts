import { loadProduct, PRODUCT_IDS } from '../../content/products'
import { sortSummaries, summarizeProduct, type ProductBenchSummary } from './model'

/**
 * The "every product" cards on `/benchmarks`: one per product content file
 * (`content/products/*.json`) whose `benchmarks` has rows, sorted. Derived
 * from the files present, never a hand list, so a product that gains
 * benchmark data appears on the next build (tests/site-pages.test.ts holds it
 * to that).
 */
export async function benchmarkProducts(): Promise<ProductBenchSummary[]> {
  const products = await Promise.all(PRODUCT_IDS.map((id) => loadProduct(id)))
  return sortSummaries(
    products.flatMap((p) => {
      const s = p ? summarizeProduct(p) : null
      return s ? [s] : []
    }),
  )
}
