import { notFound, useLoaderData } from '@pyreon/router'
import type { LoaderContext } from '@pyreon/zero'
import type { GetStaticPaths } from '@pyreon/zero/server'
import { loadWhy, loadWhyMeta, WHY_IDS } from '../../../site/content/pages'
import { loadSvgs } from '../../../site/pages/assets'
import { whyDiagramFiles, WhyPage, type WhyView } from '../../../site/pages/WhyPage'

/** `/why/<id>` — one prerendered story page per `content/pages/why/<id>.json`. */
export const getStaticPaths: GetStaticPaths<{ id: string }> = () => WHY_IDS.map((id) => ({ params: { id } }))

export async function loader({ params }: LoaderContext): Promise<WhyView> {
  const page = await loadWhy(params.id ?? '')
  if (!page) notFound()
  const p = page as WhyView['page']
  const [svgs, meta] = await Promise.all([loadSvgs(whyDiagramFiles(p.id)), loadWhyMeta()])
  return { page: p, svgs, order: meta.order }
}

export default function WhyRoute() {
  const view = useLoaderData<WhyView | undefined>()
  if (!view) return null
  return <WhyPage view={view} />
}
