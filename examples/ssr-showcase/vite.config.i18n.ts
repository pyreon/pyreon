import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
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
  ],
  resolve: { conditions: ['bun'] },
})
