// ─── Shared MiniSearch options — build-time + runtime in lock-step ────────
//
// Pre-fix (PR-A audit L12) the same config existed twice:
//
//   `search/index-builder.ts:DEFAULT_MS_OPTIONS` — used to build the
//   `dist/search-index-<collection>.json` files at SSG time.
//
//   `search/search-runtime.tsx:MS_OPTIONS` — used to rehydrate the
//   MiniSearch instance from those JSONs on the client.
//
// MiniSearch's `loadJSON` requires the runtime options to MATCH the
// indexed-time options on `fields` / `storeFields` / `idField` (so
// document references resolve correctly) and `searchOptions` (so
// queries score with the same boost weights as were tuned for the
// content). Drift would silently break search — a `boost: { title: 2 }`
// indexed-time and `boost: { title: 3 }` runtime would re-rank but
// not enough to be obvious in a smoke test.
//
// Locked here so any tuning change ships to both consumers in one
// edit, and there's exactly one place to point at when explaining
// the search ranking story.

export const MINISEARCH_OPTIONS = {
  fields: ['title', 'description', 'headings', 'body'] as string[],
  // `anchors` is stored (not indexed) — the runtime reads it to deep-link a
  // result to the heading that best matches the query (see search-runtime).
  storeFields: [
    'title',
    'description',
    'url',
    'collection',
    'slug',
    'anchors',
  ] as string[],
  searchOptions: {
    boost: { title: 3, headings: 2, description: 1.5 },
    prefix: true,
    fuzzy: 0.15,
  },
} as const

export type MinisearchOptions = typeof MINISEARCH_OPTIONS
