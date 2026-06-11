# @pyreon/vitest-config

## 0.13.3

### Patch Changes

- [#1416](https://github.com/pyreon/pyreon/pull/1416) [`b90e67c`](https://github.com/pyreon/pyreon/commit/b90e67c296cc39b2438490f4330b836b78395c8d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/zero`: add RSS 2.0 feed support to the SEO surface

  - New `generateRssFeed({ title, origin, items, ... })` builder
  - New `toRfc822` helper (ISO-8601 → RFC-822 date conversion)
  - `seoPlugin({ rss: {...} })` auto-emits `dist/rss.xml` at build time
  - `seoMiddleware` serves `/rss.xml` during dev
  - Exported from `@pyreon/zero/server`

  This consolidates SEO into one canonical source — RSS now lives alongside
  sitemap, robots, and JSON-LD generators in `seo.ts`.

  `@pyreon/zero-content`: deprecate duplicated SEO builders

  - `seo/rss.ts` is now a thin backward-compat adapter that delegates to
    `@pyreon/zero`'s `generateRssFeed`. Preserves the `baseUrl` field
    name. New code should import from `@pyreon/zero` directly.
  - `seo/sitemap.ts` and `seo/llms-txt.ts` marked `@deprecated`. Zero's
    `seoPlugin` (sitemap) and `aiPlugin` (llms.txt) are richer
    alternatives with i18n, hreflang, manifest-aware route enumeration,
    and dev-server middleware.

  `@pyreon/vitest-config`: add `@pyreon/zero/server` + `@pyreon/zero/client`
  subpath aliases so workspace test runs resolve them under the `bun`
  condition.

## 0.13.2

### Patch Changes

- [#1227](https://github.com/pyreon/pyreon/pull/1227) [`46c6ce8`](https://github.com/pyreon/pyreon/commit/46c6ce86568090b69a3b7fc71a41fd7a0bd164aa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lock coverage thresholds at ≥95% statements / lines on internals tooling packages.

  - `ansi`: was reporting 0% (default exclude on `src/**/index.ts`). Set `includeIndexInCoverage: true` + v8-ignore on env-detection branches that need real TTY. Measured 100% statements / 66% branches (env-dep paths).
  - `manifest`: 98.73% statements / 90.47% branches — lock thresholds.
  - `vitest-config`: 96.92% statements / 77.77% branches — lock thresholds.

- [#1288](https://github.com/pyreon/pyreon/pull/1288) [`efada83`](https://github.com/pyreon/pyreon/commit/efada8386168a4ceb47659f503630509fbe1552d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift coverage to 100% across all metrics. Added `tests/browser-config.test.ts` covering `defineBrowserConfig` shape + overrides merge. Annotated structurally-unreachable defensive conditionals with `/* v8 ignore */`: `node.ts` opt-in `setupFiles` / `coverageExclude` / `includeIndexInCoverage` spreads, `internals.ts` CI/local retry split, `browser.ts` overrides spread. Bumped vitest thresholds `branches: 77 → 95`, `functions: 85 → 95`.
