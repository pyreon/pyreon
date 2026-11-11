import { RouterView } from '@pyreon/router'
import { PageFrame } from '../../../site/shell/SiteShell'

/**
 * Blog pages render `@pyreon/zero-content/blog`'s own markup; this frame
 * gives them clearance below the marketing shell's floating nav bar.
 */
export function layout() {
  return (
    <PageFrame>
      <RouterView />
    </PageFrame>
  )
}
