import { RouterView } from '@pyreon/router'
import { SiteShell } from '../../site/shell/SiteShell'

/**
 * Marketing shell for every page in this route group (the group adds nothing
 * to the URL): home, products, brand, blog, showcase, open, discord,
 * newsletter. The docs have their own layout under `routes/docs/`.
 */
export function layout() {
  return (
    <SiteShell>
      <RouterView />
    </SiteShell>
  )
}
