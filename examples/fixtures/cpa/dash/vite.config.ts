import pyreon from '@pyreon/vite-plugin'
import zero, { vercelAdapter } from '@pyreon/zero/server'

// One config surface: fonts, SEO, favicons, og-images, and AI discoverability
// are all fields on zero() — no separate plugin imports needed.
export default {
  plugins: [
    pyreon(),
    zero({
      mode: 'ssr',
      ssr: { mode: 'stream' },
      adapter: vercelAdapter(),
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
        sitemap: { origin: 'https://example.com' },
        robots: {
          rules: [{ userAgent: '*', allow: ['/'] }],
          sitemap: 'https://example.com/sitemap.xml',
        },
      },
    }),
  ],
}
