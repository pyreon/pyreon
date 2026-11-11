import { PyreonNotFound } from '../components/PyreonNotFound'
import { SiteShell } from '../site/shell/SiteShell'

// 404 page — fs-router convention, rendered for any URL that matches no
// route (and written to dist/404.html). It sits at the root, outside the
// (site) group, so it wraps itself in the marketing shell.
export default function NotFoundPage() {
  return (
    <SiteShell>
      <PyreonNotFound />
    </SiteShell>
  )
}
