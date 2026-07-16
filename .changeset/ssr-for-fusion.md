---
'@pyreon/compiler': patch
'@pyreon/runtime-server': patch
---

SSR compile-to-string fast path: fused keyed-`<For>` emit. A `<For each by>{(item) => <el…>}</For>` child no longer bails its parent `_ssr` template to the h() walk — the parent skeleton compiles and the For lowers to one `_ssrForKeyed(each, by, item)` hole (new `@pyreon/runtime-server` export): a single tight loop producing the exact `<!--pyreon-for-->`/`<!--k:KEY-->` bytes of `renderForItems` while skipping the per-row `renderNode` dispatch + `RawHtml` unwrap. Byte-identical to the h() path by construction (locked by the runtime-dom differential + hydration cases, the compiler emit suite, and an explicit JS↔native byte-equality spec — the fuzz grammar generates no `<For>`); both compiler backends emit it. Bail conditions are exact (`fallback`, spreads, block-bodied or non-arrow children, ineligible item elements keep the h() path). Eligible SSR pages with keyed lists render substantially faster.
