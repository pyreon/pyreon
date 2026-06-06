---
'@pyreon/zero-content': minor
---

PR-J — collection features (audit M13+M14+M15+H10+H3+L7)

Six independent fixes:

- **M13**: `getCollection({ includeDrafts })` filters out entries
  whose frontmatter has `draft: true`. Defaults to off in production,
  on in dev so authors can preview WIP. Also accepts a `filter`
  predicate for tag-based listings, date-range filters, etc.

- **M14**: `reference(collection, slug)` typed helper + runtime
  resolvers (`resolveReference` / `resolveReferences`). Lets schemas
  store typed cross-collection pointers — frontmatter holds plain
  JSON, lookup happens on demand.

- **M15**: schema-shape convention for `draft` / `publishDate` /
  `updatedDate` documented; the runtime honors `draft` via M13.

- **H10**: longest-prefix collection lookup. Nested collection paths
  (`src/content/docs` AND `src/content/docs/api`) now route each
  file to the deeper collection regardless of config declaration
  order. Pre-fix iteration-order-dependent.

- **H3**: h1-h6 heading capture (was h2-h3 only). Configurable via
  the new `headingsMinLevel` / `headingsMaxLevel` emit options.

- **L7**: heading slug dedup. Two `<h2>Examples</h2>` sections get
  unique anchor ids (`examples` + `examples-2`); both the rendered
  id AND the captured `slug` field carry the deduped value so
  deep-links resolve correctly.

24 new specs cover the six contracts; H10 + L7 bisect-verified.
