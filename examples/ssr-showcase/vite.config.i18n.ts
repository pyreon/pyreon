import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

// PR H — i18n SSG build config for the e2e gate (`e2e/ssg-i18n.spec.ts`).
// Builds the same ssr-showcase app under `zero({ i18n: { ... } })` so the
// playwright test can serve the prerendered output and verify per-locale
// route trees (default unprefixed + non-default locale-prefixed) work
// end-to-end at runtime — not just at the build-output string-assertion
// level (`verify-modes ssr-showcase × ssg-i18n`).
//
// Strategy `prefix-except-default` is the canonical SEO shape: `/about`
// stays canonical for the default locale, `/de/about` and `/cs/about`
// get explicit prefixes for non-default speakers.
//
// Kept as a separate file (not flag-gated on the main config) so the
// regular dev/build/preview commands stay simple, AND so `bun run
// build:i18n` is a one-liner for local repro of the i18n shape.
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
  ],
  resolve: { conditions: ['bun'] },
})
