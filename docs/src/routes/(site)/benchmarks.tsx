import { useLoaderData } from '@pyreon/router'
import { loadBenchmarks } from '../../site/content/pages'
import { loadProduct, PRODUCT_IDS } from '../../site/content/products'
import { loadSvgs } from '../../site/pages/assets'
import { BENCH_SVGS, BenchmarksPage, type BenchmarksView } from '../../site/pages/benchmarks/BenchmarksPage'
import { summarizeProduct, type ProductBenchSummary } from '../../site/pages/benchmarks/model'

/**
 * `/benchmarks` — the full record (`content/pages/benchmarks.json`). The
 * "every product" cards are summarized here from each product content file's
 * `benchmarks`, so they always match the product pages and only the small
 * summaries reach the page.
 */
export async function loader(): Promise<BenchmarksView> {
  const [data, svgs, products] = await Promise.all([
    loadBenchmarks(),
    loadSvgs(Object.values(BENCH_SVGS)),
    Promise.all(PRODUCT_IDS.map((id) => loadProduct(id))),
  ])
  return {
    data,
    svgs,
    products: products.flatMap((p) => {
      const s = p ? summarizeProduct(p) : null
      return s ? [s] : ([] as ProductBenchSummary[])
    }),
  }
}

export default function BenchmarksRoute() {
  const view = useLoaderData<BenchmarksView | undefined>()
  if (!view) return null
  return <BenchmarksPage view={view} />
}
