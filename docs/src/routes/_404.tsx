import shareDefault from '../site/content/_share-default.json'
import { SITE_ORIGIN, usePageHeadWith } from '../site/head-core'
import { NF, NotFound } from '../site/pages/NotFound'
import { SiteShell } from '../site/shell/SiteShell'

// 404 page — fs-router convention, rendered for any URL that matches no
// route (and written to dist/404.html, which zero marks noindex). It sits at
// the root, outside the (site) group, so it wraps itself in the marketing
// shell.
export default function NotFoundPage() {
  // The router keeps this component in every page's client bundle (it
  // renders unknown URLs), so it takes the head core with the default share
  // card instead of the asset manifest.
  usePageHeadWith({
    path: '/404',
    image: { url: `${SITE_ORIGIN}/media/${shareDefault.file}`, width: shareDefault.width, height: shareDefault.height, alt: shareDefault.alt },
    title: `${NF.code} · ${NF.title} · Pyreon`,
    description: NF.lede,
    noindex: true,
  })
  return (
    <SiteShell>
      <NotFound />
    </SiteShell>
  )
}
