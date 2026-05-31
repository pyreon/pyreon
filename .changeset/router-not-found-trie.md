---
'@pyreon/router': patch
---

`findNotFoundFallback` now uses a pre-built prefix trie — O(URL segments) per 404 lookup instead of O(routes-in-tree) (PR-S9)

Pre-fix `findNotFoundFallback` walked the entire route tree on every 404, re-doing path-prefix checks and chain accumulation for every record. With N notFoundComponent-bearing records, lookup was O(N) and constant-factor heavy (string ops per record). Real i18n × dynamic-route apps with deeply-nested layouts can have dozens of such records — and the walk fires per request (and per render in dev).

**The fix**: a prefix trie of notFoundComponent records, built once at `buildRouteIndex` time and cached via `_indexCache` (WeakMap keyed on `RouteRecord[]` identity, same pattern as `staticMap`). Lookup walks the URL by segment, descending the trie in O(URL segments) and tracking the deepest layout-best and page-best entries along the way.

**Implementation details:**

- New `NotFoundTrieNode` with two parallel tracks per node: `layout` (record with children) and `page` (record without children — used only for layout-less synthetic-chrome fallback). Matches the layout/page distinction the old walk made.
- Specificity tiebreaker preserved: deeper chain wins; ties go to more specific (more-segments) paths. Encoded as `depth` + `specificity` fields on each trie entry.
- Path-prefix semantics naturally encoded by the trie structure: `/de` lives at depth 1 (segment `"de"`), so URL `/de/unknown` traverses root → "de" → no match, passing through the `/de` entry. URL `/encyclopedia` traverses root → "encyclopedia" → no match, never seeing the `/de` entry. No more substring-prefix false positives, and no more `startsWith` string comparisons per record.
- `pathPrefixApplies` helper is gone — its responsibility moved to the trie's structural prefix semantics.
- `findNotFoundFallback` signature gained a `trie: NotFoundTrieNode` parameter (called by `resolveRoute` after `buildRouteIndex`). The function body collapsed from 100+ lines to ~30 lines.

**Regression coverage**: 6 new tests in `match.test.ts` under `resolveRoute — PR-S9 notFoundComponent trie` describe block, asserting the trie produces byte-identical results to the old walk across the representative shapes (deepest-prefix wins; substring-prefix doesn't false-match; 3-level nesting; empty tree → null; cache reuse). Plus 1 perf assertion (1000 lookups across a 26-record tree stay sub-100ms — generous threshold, the trie typically lands at 5-20µs/call).

**No public API change**: the trie + caching are internal. `RouteIndex.notFoundTrie` is a new `@internal` field; no consumer references it. Behavioral contract is preserved (all 543 existing router tests pass unchanged).
