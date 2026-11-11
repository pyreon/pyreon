import { useLoaderData } from '@pyreon/router'
import { fill } from '../../../site/content/fill'
import { loadCompareMeta, type CompareMeta } from '../../../site/content/pages'
import { RedirectPage } from '../../../site/pages/RedirectPage'

/** `/compare` — no index page (sitemap decision "merge"): forwards to the first rival in the content's order. */
export const loader = (): Promise<CompareMeta> => loadCompareMeta()

export default function CompareIndex() {
  const meta = useLoaderData<CompareMeta | undefined>()
  const id = meta?.order[0]
  const rival = meta?.rivals.find((r) => r.id === id)?.rival
  if (!meta || !id || !rival) return null
  return <RedirectPage path="/compare" to={`/compare/${id}`} title={meta.template.index.title} label={fill(meta.template.index.label, { rival })} />
}
