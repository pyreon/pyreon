---
"@pyreon/zero-content": minor
---

feat(zero-content): synonym/jargon-aware search

Docs search now expands framework-vocabulary synonyms at query time, so a
search for "reactive" finds the **signal** docs, "hydration" finds
"hydrate", "routing" finds the **navigation** pages, "attributes" finds
**props**, and so on. Plain keyword search — what VitePress and most docs
sites ship — returns nothing for these vocabulary mismatches, which is the
single biggest real-world relevance gap in docs search.

Implemented as a conservative, curated `searchOptions.processTerm` (11
high-confidence equivalence groups) — expansion happens at SEARCH time only,
so the prebuilt `search-index-*.json` is unchanged (`MiniSearch.loadJSON`
stays happy) and the index stays small. Non-jargon queries are untouched, so
precision holds (a search for "tooltip" still returns only the tooltip page).
