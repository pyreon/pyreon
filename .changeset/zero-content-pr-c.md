---
'@pyreon/zero-content': minor
---

PR-C audit H1 — `defineContentRoute()` helper. The single highest-leverage feature in the audit. Pre-fix every consumer re-invented the same ~80-line async-body + Suspense + cast dance just to make a route load a markdown entry by slug.

```ts
// Before — examples/docs-zero/src/routes/docs/[...slug].tsx
import { Suspense } from '@pyreon/core'
import { useParams } from '@pyreon/router'
import { getEntry } from '@pyreon/zero-content'
// ... 80 lines including async DocBody, Suspense wrap, ComponentFn cast, etc.

// After
import { defineContentRoute } from '@pyreon/zero-content'
export default defineContentRoute('docs', {
  wrap: (entry, body) => <Layout entry={entry}>{body}</Layout>,
})
```

Override surface (all optional):
- `fallback` — synchronously-rendered placeholder for `<Suspense>` (defaults to an empty `<article>` matching docs-zero / VitePress lineage; pass `null` to drop)
- `notFound` — `ComponentFn<{ slug: string }>` rendered when the slug doesn't resolve
- `wrap` — receives `(entry, body)` to inject layouts (frontmatter-driven layouts, sidebars, page footers)
- `articleClass` — defaults to `'docs-content vp-doc'`; pass `null` to skip the article wrapper entirely (useful when `wrap` provides its own)

Regression coverage: `_define-content-route.test.tsx` — 8 SSR specs covering registry-driven rendering, 404 fallback, custom notFound, wrap, articleClass: null, catch-all array params, empty slug for the bare `/<collection>/` route. Bisect-verified.

Real-app proof: `examples/docs-zero/src/routes/docs/[...slug].tsx` migrated to the helper (80 → 60 lines, with the new shape exposing `PageMeta` + `Toc` via the `wrap` callback). Docs-zero builds 93 pages + 404.html on the helper-based route.
