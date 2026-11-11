import { notFound, useLoaderData } from '@pyreon/router'
import type { LoaderContext } from '@pyreon/zero'
import type { GetStaticPaths } from '@pyreon/zero/server'
import { COMPARE_IDS, loadCompare, loadCompareMeta } from '../../../site/content/pages'
import { loadSvg } from '../../../site/pages/assets'
import { ComparePage, type CompareView } from '../../../site/pages/ComparePage'

/** `/compare/<rival>` — one prerendered page per `content/pages/compare/<id>.json`. */
export const getStaticPaths: GetStaticPaths<{ id: string }> = () => COMPARE_IDS.map((id) => ({ params: { id } }))

export async function loader({ params }: LoaderContext): Promise<CompareView> {
  const id = params.id ?? ''
  const [page, meta, svg] = await Promise.all([loadCompare(id), loadCompareMeta(), loadSvg(`compare/${id}.svg`)])
  if (!page) notFound()
  return { page: page as CompareView['page'], meta, svg }
}

export default function CompareRoute() {
  const view = useLoaderData<CompareView | undefined>()
  if (!view) return null
  return <ComparePage view={view} />
}
