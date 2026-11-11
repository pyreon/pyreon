import { useHead } from '@pyreon/head'
import { RouterView, useRoute } from '@pyreon/router'
import { DocsDrawer } from '../../docs-ui/drawer'
import { useDocsSearch } from '../../docs-ui/search'
import { DocsSidebar } from '../../docs-ui/sidebar'
import { DOCS_VARS_CSS } from '../../docs-ui/tokens'
import { SiteShell } from '../../site/shell/SiteShell'

/**
 * Docs layout — the reading shell for `/docs` and `/docs/*`, inside the same
 * marketing shell as every other page (logo, nav, theme toggle, footer), so
 * moving between `/` and `/docs` stays one site.
 *
 *   ≥ 1180px  sidebar · article · right rail (TOC, one product card, links)
 *   ≥ 960px   sidebar · article (the TOC moves under the title)
 *   < 960px   "Browse docs" drawer above the article
 *
 * Search opens with ⌘K / Ctrl+K / "/" or the sidebar's search box, and its
 * code loads on that first open. The docs tokens (`docs-ui/tokens.ts`, from
 * `site/theme.ts`) go into the head once; `styles/docs-v3.css` reads them.
 */
export function layout() {
  const route = useRoute()
  const path = () => route().path
  const search = useDocsSearch()

  useHead({ style: [{ children: DOCS_VARS_CSS }] })

  return (
    <SiteShell>
      <div class="dx">
        <a class="dx-skip" href="#dx-article">
          Skip to the article
        </a>
        <aside class="dx-aside">
          <DocsSidebar path={path} idPrefix="dx-side" label="Docs" onSearch={search.show} />
        </aside>
        <div class="dx-main">
          <DocsDrawer path={path} onSearch={search.show} />
          <RouterView />
        </div>
      </div>
      <search.Mount />
    </SiteShell>
  )
}
