import pyreon from '@pyreon/vite-plugin'
import zero, { nodeAdapter } from '@pyreon/zero/server'
import { fontPlugin } from '@pyreon/zero/font'
import { seoPlugin } from '@pyreon/zero/seo'
import { chartsViteAlias } from '@pyreon/charts/vite'

export default {
  // @pyreon/charts requires tslib aliased to its ESM build (CLAUDE.md
  // documents this — ECharts' tslib import destructures named helpers
  // from a CJS factory whose top-level vars aren't on the default
  // export, so without the alias `__extends` resolves to `undefined`
  // and the page throws on first chart mount).
  resolve: {
    alias: { ...chartsViteAlias() },
  },
  plugins: [
    pyreon(),
    zero({ mode: 'ssg', adapter: nodeAdapter() }),

    // Google Fonts — self-hosted at build time, CDN in dev
    fontPlugin({
      google: ['Inter:wght@400;500;600;700;800', 'JetBrains Mono:wght@400'],
      fallbacks: {
        Inter: { fallback: 'Arial', sizeAdjust: 1.07, ascentOverride: 90 },
      },
    }),

    // Generate sitemap.xml and robots.txt at build time
    seoPlugin({
      sitemap: { origin: 'https://example.com' },
      robots: {
        rules: [{ userAgent: '*', allow: ['/'] }],
        sitemap: 'https://example.com/sitemap.xml',
      },
    }),
  ],
}
