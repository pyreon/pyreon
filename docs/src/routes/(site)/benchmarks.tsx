import { useLoaderData } from '@pyreon/router'
import { loadBenchmarks } from '../../site/content/pages'
import { loadSvgs } from '../../site/pages/assets'
import { BENCH_SVGS, BenchmarksPage, type BenchmarksView } from '../../site/pages/benchmarks/BenchmarksPage'
import { benchmarkProducts } from '../../site/pages/benchmarks/products'

/**
 * `/benchmarks` — the full record (`content/pages/benchmarks.json`). The
 * "every product" cards are summarized here from each product content file's
 * `benchmarks` (`benchmarkProducts`), so they always match the product pages
 * and only the small summaries reach the page.
 */
export async function loader(): Promise<BenchmarksView> {
  const [data, svgs, products] = await Promise.all([loadBenchmarks(), loadSvgs(Object.values(BENCH_SVGS)), benchmarkProducts()])
  return { data, svgs, products }
}

export default function BenchmarksRoute() {
  const view = useLoaderData<BenchmarksView | undefined>()
  if (!view) return null
  return <BenchmarksPage view={view} />
}
