import { usePageHead } from '../site/head'
import { NF, NotFound } from '../site/pages/NotFound'
import { SiteShell } from '../site/shell/SiteShell'

// 404 page — fs-router convention, rendered for any URL that matches no
// route (and written to dist/404.html, which zero marks noindex). It sits at
// the root, outside the (site) group, so it wraps itself in the marketing
// shell.
export default function NotFoundPage() {
  usePageHead({
    path: '/404',
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
