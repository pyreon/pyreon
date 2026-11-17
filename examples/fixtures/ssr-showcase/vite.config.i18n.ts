import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { seoPlugin } from '@pyreon/zero/seo'
import { defineConfig } from 'vite'

// PR H follow-up — i18n SSG build config for the e2e gate
// (`e2e/ssg-i18n.spec.ts`). Builds the same ssr-showcase app under
// `zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en' } })`
// so the playwright test can serve the prerendered output and verify
// per-locale routing works end-to-end at runtime — not just at the
// build-output level (`verify-modes ssr-showcase × ssg-i18n`).
//
// Strategy `prefix-except-default` is the i18nRouting() default —
// default locale (`en`) keeps unprefixed URLs (`/about`), non-default
// locales get explicit prefixes (`/de/about`, `/cs/about`). This is
// the SEO-canonical shape for primary-locale apps.
//
// PR K — also wires `seoPlugin` with `hreflang: true` so the e2e
// gate exercises hreflang sitemap generation through a real build:
// `/sitemap.xml` ends up with `<xhtml:link rel="alternate" hreflang>`
// siblings per locale variant + an `x-default` entry. The
// `hreflang: true` form auto-detects the i18n config from the SSG
// manifest the zero plugin writes — zero-config, single source of
// truth for the locale list.
//
// Kept as a separate config (not flag-gated on the main config) so
// the regular dev/build/preview commands stay simple, AND so
// `bun run build:i18n` is a one-liner for local repro of the i18n
// shape — same pattern as `vite.config.subpath.ts` for PR E.
export default defineConfig({
  plugins: [
    pyreon(),
    zero({
      mode: 'ssg',
      i18n: {
        locales: ['en', 'de', 'cs'],
        defaultLocale: 'en',
        strategy: 'prefix-except-default',
      },
    }),
    seoPlugin({
      sitemap: {
        origin: 'https://example.com',
        useSsgPaths: true,
        hreflang: true,
      },
    }),
  ],
  resolve: { conditions: ['bun'] },
})
