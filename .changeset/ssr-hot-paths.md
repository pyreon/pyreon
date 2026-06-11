---
'@pyreon/runtime-server': patch
---

SSR hot-path optimizations from a CPU-profiling campaign against real-app-shaped trees (`scripts/bench-ssr.ts`): escapeHtml's dirty path drops the callback-replace for a charCode scan with lazy slicing (escaping measured ~19% of non-GC render time); `safeKeyForMarker` adds fast paths for numeric and `[\w.:]` keys (the dominant `<For>` key shapes — skips encodeURIComponent, ~7% of list-heavy renders) while dash-bearing keys keep the full `%2D` encoding so the `<!--k:KEY-->` comment-safety contract is unchanged (bisect-locked security spec); `isVoidElement` stops allocating a per-element `toLowerCase` string; `toAttrName` memoizes resolved+escaped attribute names; `renderPropSkipped` probes `on[A-Z]` via charCodes instead of a regex. Interleaved A/B/A/B benchmark (output byte-identical): blog-index-shaped pages −10%, 1k-row table −13% per render. 14 new edge-case lock specs.
