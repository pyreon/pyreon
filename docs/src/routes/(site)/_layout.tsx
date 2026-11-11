import { useHead } from '@pyreon/head'
import { RouterView } from '@pyreon/router'
import { SiteShell } from '../../site/shell/SiteShell'
import { SITE_STYLESHEETS } from '../../styles/sheets'

/**
 * Marketing shell for every page in this route group (the group adds nothing
 * to the URL): home, products, brand, blog, showcase, open, discord,
 * newsletter. The docs have their own layout under `routes/docs/`.
 *
 * It links the marketing-only stylesheets (`styles/sheets.ts`), so docs pages
 * never download them.
 */
export function layout() {
  useHead({ link: SITE_STYLESHEETS.map((href) => ({ rel: 'stylesheet', href })) })
  return (
    <SiteShell>
      <RouterView />
    </SiteShell>
  )
}
