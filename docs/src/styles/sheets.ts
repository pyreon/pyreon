// `?url` emits each stylesheet as its own processed asset. The `docs` cascade
// layer: docs-v3.css declares it itself; vite-plugins/legacy-css-layer.ts
// wraps site-pages.css and blog.css in it.
import blogHref from '@pyreon/zero-content/blog.css?url'
import docsHref from './docs-v3.css?url'
import sitePagesHref from './site-pages.css?url'

/**
 * Stylesheets that only one side of the site needs. The client entry carries
 * only `tokens.css` (the site's semantic tokens, which the docs' live examples
 * and the older marketing pages read); each layout links its own sheets:
 *
 *   - `DOCS_STYLESHEETS`: the docs layout (`routes/docs/_layout.tsx`).
 *   - `SITE_STYLESHEETS`: the marketing layout (`routes/(site)/_layout.tsx`):
 *     the older pages' styles (blog, showcase, open) and the blog's.
 */
export const DOCS_STYLESHEETS: readonly string[] = [docsHref]
export const SITE_STYLESHEETS: readonly string[] = [sitePagesHref, blogHref]

const isDocsPath = (path: string): boolean => path === '/docs' || path.startsWith('/docs/')

/**
 * Prefetch the other side's stylesheets the first time the visitor points at
 * (or focuses) a link into it — a docs link on a marketing page, a marketing
 * link on a docs page — so the page they open paints without waiting for its
 * CSS. Nothing loads otherwise.
 *
 * It is also the client build's one reference to these files: pages are
 * static (no route module runs in the browser), and without a reference the
 * client build would not emit the files the layouts' `<link>`s point at.
 */
export function prefetchStylesheetsOnIntent(doc: Document): void {
  const fromDocs = isDocsPath(doc.location.pathname)
  const sheets = fromDocs ? SITE_STYLESHEETS : DOCS_STYLESHEETS
  const onIntent = (e: Event) => {
    const link = (e.target as Element | null)?.closest?.('a[href^="/"]')
    const href = link?.getAttribute('href')
    if (!href || isDocsPath(href.split(/[?#]/)[0] ?? '') === fromDocs) return
    doc.removeEventListener('pointerover', onIntent)
    doc.removeEventListener('focusin', onIntent)
    for (const sheet of sheets) {
      const el = doc.createElement('link')
      el.rel = 'prefetch'
      el.as = 'style'
      el.href = sheet
      doc.head.append(el)
    }
  }
  doc.addEventListener('pointerover', onIntent, { passive: true })
  doc.addEventListener('focusin', onIntent)
}
