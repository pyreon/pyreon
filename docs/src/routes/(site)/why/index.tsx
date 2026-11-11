import { useLoaderData } from '@pyreon/router'
import { fill } from '../../../site/content/fill'
import { loadWhyMeta, type WhyMeta } from '../../../site/content/pages'
import { RedirectPage } from '../../../site/pages/RedirectPage'

/** `/why` — no index page (sitemap decision "merge"): forwards to the first story in the content's order. */
export const loader = (): Promise<WhyMeta> => loadWhyMeta()

export default function WhyIndex() {
  const meta = useLoaderData<WhyMeta | undefined>()
  const first = meta?.order[0]
  if (!meta || !first) return null
  return <RedirectPage path="/why" to={`/why/${first.id}`} title={meta.template.index.title} label={fill(meta.template.index.label, { title: first.title })} />
}
