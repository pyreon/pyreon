import pyreon from '@pyreon/vite-plugin'
import content from '@pyreon/zero-content/plugin'
import zero from '@pyreon/zero/server'

// One config surface: fonts, SEO, favicons, og-images, and AI discoverability
// are all fields on zero() — no separate plugin imports needed.
export default {
  plugins: [
    // Markdown posts (src/content/blog) + /blog/rss.xml. Drafts and posts
    // dated after the build are left out of the build entirely.
    content({
      seo: {
        baseUrl: 'https://example.com',
        rss: {
          collection: 'blog',
          path: 'blog/rss.xml',
          title: 'Blog',
          description: 'A Pyreon Zero blog.',
          content: 'full',
        },
      },
    }),
    pyreon(),
    zero({
      mode: 'ssg',
      typedRoutes: true,

      // Google Fonts — self-hosted at build time (CDN in dev), preloaded,
      // with auto size-adjusted fallbacks that eliminate font-swap CLS
      // (use `font-family: var(--pyreon-font-inter)` in your CSS/theme).
      font: {
        google: ['Inter:wght@400;500;600;700;800', 'JetBrains Mono:wght@400'],
        subsets: ['latin'],
        fallbackAdjust: true,
      },

      // sitemap.xml + robots.txt at build time — set your real origin once.
      seo: {
        sitemap: { origin: 'https://example.com', useSsgPaths: true },
        robots: {
          rules: [{ userAgent: '*', allow: ['/'] }],
          sitemap: 'https://example.com/sitemap.xml',
        },
      },
    }),
  ],
}
