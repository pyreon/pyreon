import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { seoPlugin } from '@pyreon/zero/seo'
import { defineConfig } from 'vite'

// PR L3 — i18n SSG build config for the `prefix`-strategy e2e gate
// (`e2e/ssg-i18n-prefix.spec.ts`). Companion to `vite.config.i18n.ts`
// (which uses `prefix-except-default`). PR L1 added the verify-modes
// cell for `prefix` at the build-artifact level — this config drives
// the matching real-Chromium runtime gate so the strategy's
// distinguishing shape (default locale IS prefixed, root `/` does not
// exist as a dist file, hreflang `x-default` points at the en-PREFIXED
// URL) is locked at the runtime layer too.
//
// Strategy `prefix`: every locale prefixed including default.
//   - /en/about (default locale, prefixed — distinguishing case)
//   - /de/about, /cs/about (non-default, also prefixed)
//   - NO unprefixed /about
//
// `hreflang: true` auto-detects from the SSG manifest — same shape
// as `vite.config.i18n.ts`, but the resulting `x-default` entry
// points at the en-PREFIXED URL (`/en/about`) under prefix strategy,
// not the unprefixed `/about`. That's the strategy's contract on the
// sitemap side.
//
// Kept as a separate config (not flag-gated on the main i18n config)
// so `bun run build:i18n-prefix` is a one-liner for local repro AND
// so the test webServer can chain build + serve cleanly.
export default defineConfig({
  plugins: [
    pyreon(),
    zero({
      mode: 'ssg',
      i18n: {
        locales: ['en', 'de', 'cs'],
        defaultLocale: 'en',
        strategy: 'prefix',
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
