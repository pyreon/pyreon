import '../site/ui-init'
import { useHead } from '@pyreon/head'
import { RouterView, useRoute } from '@pyreon/router'
import { PyreonUI } from '@pyreon/ui-core'
import { BLOG_FEED, BLOG_TITLE, SITE_ORIGIN } from '../blog/site'
import { colorMode, useFollowSystemMode } from '../site/color-mode'
import shareDefault from '../site/content/_share-default.json'
import { color, siteTheme } from '../site/theme'

const DEFAULT_TITLE = 'Pyreon: the signal-based UI framework'
const DEFAULT_DESCRIPTION =
  'A signal-based TypeScript framework: components run once and only the DOM node that changed updates. Full stack on the web, with iOS and Android from the same .tsx (experimental).'
// The asset set's site-wide share card (scripts/sync-site-assets.ts writes
// the record). Pages set their own through `usePageHead` (src/site/head.ts).
const DEFAULT_IMAGE = `${SITE_ORIGIN}/media/${shareDefault.file}`
const DEFAULT_IMAGE_ALT = shareDefault.alt

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
        { property: 'og:site_name', content: 'Pyreon' },
        { property: 'og:image', content: DEFAULT_IMAGE },
        { property: 'og:image:width', content: String(shareDefault.width) },
        { property: 'og:image:height', content: String(shareDefault.height) },
        { property: 'og:image:alt', content: DEFAULT_IMAGE_ALT },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: DEFAULT_IMAGE },
        { name: 'twitter:image:alt', content: DEFAULT_IMAGE_ALT },
        // Browser chrome colour, per OS scheme (the page background tokens).
        { name: 'theme-color', content: color.bg.dark, media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: color.bg.light, media: '(prefers-color-scheme: light)' },
      ],
      // Feed autodiscovery on every page.
      link: [
        { rel: 'alternate', type: 'application/rss+xml', title: BLOG_TITLE, href: BLOG_FEED },
        // The brand icon set (09-site/assets/brand, synced to public/brand).
        { rel: 'icon', type: 'image/svg+xml', href: '/brand/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/brand/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/brand/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    }
  })

  return (
    <PyreonUI theme={siteTheme} mode={() => colorMode()}>
      <RouterView />
    </PyreonUI>
  )
}
