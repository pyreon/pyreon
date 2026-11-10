import pyreon from '@pyreon/vite-plugin'
import content from '@pyreon/zero-content/plugin'
import zero from '@pyreon/zero/server'
import { fontPlugin } from '@pyreon/zero/font'
import { seoPlugin } from '@pyreon/zero/seo'

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
    zero({ mode: 'ssg' }),

    // Google Fonts — self-hosted at build time, CDN in dev
    fontPlugin({
      google: ['Inter:wght@400;500;600;700;800', 'JetBrains Mono:wght@400'],
      fallbacks: {
        Inter: { fallback: 'Arial', sizeAdjust: 1.07, ascentOverride: 90 },
      },
    }),

    // Generate sitemap.xml and robots.txt at build time.
    // `useSsgPaths: true` reads the resolved-paths manifest the SSG plugin
    // emits at closeBundle, so dynamic blog routes (`/blog/[slug]`)
    // enumerated via getStaticPaths land in sitemap.xml — without it,
    // only the static routes (`/`, `/about`, `/blog`) would appear.
    seoPlugin({
      sitemap: { origin: 'https://example.com', useSsgPaths: true },
      robots: {
        rules: [{ userAgent: '*', allow: ['/'] }],
        sitemap: 'https://example.com/sitemap.xml',
      },
    }),
  ],
}
