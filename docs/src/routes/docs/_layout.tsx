import { useHead } from '@pyreon/head'
import { RouterView, useRoute } from '@pyreon/router'
import { DocsSearchIsland, DocsDrawerIsland } from '../../docs-ui/islands'
import { normalizeDocsPath } from '../../docs-ui/nav'
import { DocsSidebar } from '../../docs-ui/sidebar'
import { DOCS_VARS_CSS } from '../../docs-ui/tokens'
import { SiteShell } from '../../site/shell/SiteShell'
import { DOCS_STYLESHEETS } from '../../styles/sheets'

/**
 * Prefetch a docs page the reader is about to open (pointer down or a short
 * hover; Chromium's Speculation Rules, ignored elsewhere): docs pages are
 * static documents, and this keeps a click between them close to instant
 * without a client router.
 */
const SPECULATION_RULES = JSON.stringify({
  prefetch: [{ where: { href_matches: '/docs/*' }, eagerness: 'moderate' }],
})

/**
 * Docs layout — the reading shell for `/docs` and `/docs/*`, inside the same
 * marketing shell as every other page (logo, nav, theme toggle, footer), so
 * moving between `/` and `/docs` stays one site.
 *
 *   ≥ 1180px  sidebar · article · right rail (TOC, one product card, links)
 *   ≥ 960px   sidebar · article (the TOC moves under the title)
 *   < 960px   "Browse docs" drawer above the article
 *
 * Like the marketing pages, a docs page is static HTML with islands
 * (`site/render-mode.ts`, `docs-ui/islands.ts`): the sidebar, breadcrumbs,
 * the Markdown and the selling slots never run in the browser; search, the
 * drawer, the TOCs, page actions, code copy and the live examples are islands.
 * Links between docs pages are page loads (prefetched, above).
 *
 * The docs tokens (`docs-ui/tokens.ts`, from `site/theme.ts`) go into the
 * head once; `styles/docs-v3.css` reads them.
 */
export function layout() {
  const route = useRoute()
  const path = normalizeDocsPath(route().path)

  useHead({
    style: [{ children: DOCS_VARS_CSS }],
    link: DOCS_STYLESHEETS.map((href) => ({ rel: 'stylesheet', href })),
    script: [{ type: 'speculationrules', children: SPECULATION_RULES }],
  })

  return (
    <SiteShell>
      <div class="dx">
        <a class="dx-skip" href="#dx-article">
          Skip to the article
        </a>
        <aside class="dx-aside">
          <DocsSidebar path={path} idPrefix="dx-side" label="Docs" search={<DocsSearchIsland />} />
        </aside>
        <div class="dx-main">
          <DocsDrawerIsland path={path} />
          <RouterView />
        </div>
      </div>
    </SiteShell>
  )
}
