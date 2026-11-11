import '../site/ui-init'
import { useHead } from '@pyreon/head'
import { RouterView, useRoute } from '@pyreon/router'
import { PyreonUI } from '@pyreon/ui-core'
import { BLOG_FEED, BLOG_TITLE, SITE_ORIGIN } from '../blog/site'
import { colorMode, useFollowSystemMode } from '../site/color-mode'
import { siteTheme } from '../site/theme'

const DEFAULT_TITLE = 'Pyreon — the signal-based UI framework'
const DEFAULT_DESCRIPTION =
  'Signal-based UI framework — fine-grained reactivity, no virtual DOM, streaming SSR.'
const DEFAULT_IMAGE_ALT = 'Pyreon — the signal-based UI framework. Signals in. Updates out.'

/**
 * Root layout — every page renders through it:
 *
 *   - Site-wide head defaults (title, description, Open Graph, feed link).
 *   - The ONE `<PyreonUI>` for the whole site, in CSS-variables mode
 *     (`site/ui-init.ts`): the theme object is the same module constant on
 *     every request, and the mode is the shared colour-mode signal, which the
 *     pre-paint script in index.html seeded before first paint.
 *
 * Below it, `docs/_layout.tsx` is the docs reading shell and
 * `(site)/_layout.tsx` the marketing shell (nav, mega menu, footer).
 */
export function layout() {
  const route = useRoute()
  useFollowSystemMode()

  // Site-wide head defaults. They live here, not as static tags in
  // index.html, because @pyreon/head dedupes by key with the innermost
  // component winning: a page's own `og:image` / `og:url` / description
  // (e.g. a blog post's cover) REPLACES these. A static template tag cannot
  // be replaced, so social scrapers — which take the first `og:image` —
  // saw the generic card and `og:url` "https://pyreon.dev/" on every page.
  useHead(() => {
    const path = route().path
    return {
      title: DEFAULT_TITLE,
      meta: [
        { name: 'description', content: DEFAULT_DESCRIPTION },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `${SITE_ORIGIN}${typeof path === 'string' ? path : '/'}` },
        { property: 'og:title', content: DEFAULT_TITLE },
        { property: 'og:description', content: DEFAULT_DESCRIPTION },
        // Raster PNG: social cards reject SVG (see scripts/generate-og.mjs).
        { property: 'og:image', content: `${SITE_ORIGIN}/og.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: DEFAULT_IMAGE_ALT },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: `${SITE_ORIGIN}/og.png` },
        { name: 'twitter:image:alt', content: DEFAULT_IMAGE_ALT },
      ],
      // Feed autodiscovery on every page.
      link: [
        { rel: 'alternate', type: 'application/rss+xml', title: BLOG_TITLE, href: BLOG_FEED },
      ],
    }
  })

  return (
    <PyreonUI theme={siteTheme} mode={() => colorMode()}>
      <RouterView />
    </PyreonUI>
  )
}
