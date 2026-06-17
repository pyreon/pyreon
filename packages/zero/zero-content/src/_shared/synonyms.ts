// ─── Search synonym / jargon expansion ───────────────────────────────────
//
// Keyword search structurally fails on framework-vocabulary mismatches: a
// user types "reactive" but every page says "signal"; "attributes" but the
// docs say "props"; "hydration" but the heading is "hydrate". Plain MiniSearch
// (what VitePress ships) returns nothing for those — the single biggest
// real-world relevance gap in docs search.
//
// This expands query terms at SEARCH time (not index time — the prebuilt
// `search-index-*.json` stays unchanged, so `MiniSearch.loadJSON` never sees a
// structural mismatch). A query term in any group below expands to the WHOLE
// group, so the query matches docs indexed under any synonym.
//
// CONSERVATIVE BY DESIGN. Over-expansion floods results with weak matches,
// which is worse than a miss. Every group is a high-confidence, genuine
// framework-vocabulary equivalence — not a thesaurus. Single tokens only
// (MiniSearch's default tokenizer splits on non-alphanumerics, so multi-word
// synonyms like "virtual dom" would never reach `processTerm` intact).

/**
 * Mutually-synonymous term groups. Membership is bidirectional: a query for
 * ANY term in a group expands to all of them. Keep each group tight — only
 * terms a user would reasonably type expecting the same docs.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // The #1 mismatch — Pyreon's core primitive vs how every other ecosystem
  // names the concept (Vue/MobX "reactive", RxJS "observable").
  ['signal', 'signals', 'reactive', 'reactivity', 'observable'],
  // Pyreon `effect` vs Vue/Solid `watch`.
  ['effect', 'effects', 'watch'],
  // Derived state — Pyreon `computed`, React `useMemo`, Solid `createMemo`.
  ['computed', 'memo', 'memoize', 'derived'],
  // Prop naming — Pyreon uses HTML attribute names (`class`, not `className`).
  ['props', 'prop', 'attributes', 'attribute', 'attrs'],
  // Dependency injection / context.
  ['context', 'provide', 'inject'],
  // Stem pair people type both ways.
  ['hydrate', 'hydration', 'hydrating'],
  // Routing cluster.
  ['route', 'routes', 'router', 'routing', 'navigate', 'navigation'],
  // Plural the index may have under either form.
  ['island', 'islands'],
  // Static generation.
  ['ssg', 'prerender', 'prerendering', 'prerendered'],
  // Global state.
  ['store', 'stores'],
  // Data fetching.
  ['query', 'queries', 'fetch', 'fetching'],
] as const

const SYNONYM_MAP: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, readonly string[]>()
  for (const group of SYNONYM_GROUPS) {
    for (const term of group) m.set(term, group)
  }
  return m
})()

/**
 * MiniSearch `searchOptions.processTerm`. Lowercases (matching the default
 * index-time processing) and expands recognised framework-jargon terms to
 * their synonym group. Returns the bare lowercased term for everything else,
 * so non-jargon queries are unchanged.
 */
export function expandSynonyms(term: string): string | string[] {
  const lower = term.toLowerCase()
  const group = SYNONYM_MAP.get(lower)
  return group ? [...group] : lower
}
