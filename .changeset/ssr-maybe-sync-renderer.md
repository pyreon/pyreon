---
'@pyreon/runtime-server': patch
---

`renderToString` rewritten to a maybe-sync renderer — every function in the string-render family now returns `string | Promise<string>` instead of always-`Promise<string>`. Fully-synchronous subtrees (the overwhelming majority — async components are rare) concatenate plain strings with ZERO promise hops; only a genuine `async function Component()` promotes its own subtree to a Promise, with `.then` continuations resuming the sequential child walk so strict left-to-right sibling order, provider visibility across async boundaries, and the context-stack trim-after-settle semantics are all preserved (locked by the new `maybe-sync-order.test.ts` contract specs).

Why: the previous `async renderNode` + `html += await renderNode(child)` shape paid promise machinery at every node — on a 500-node SSR page (~100 RouterLinks) that was ~90µs of pure promise overhead per render against ~10µs of actual HTML work.

Measured (M3 Max, Bun, production, controlled A/B): `renderToString` scenarios — empty +43% (697K renders/s), simple-5-routes +51% (220K/s), links-100 +41% (15.1K/s), layouts-26-params +78% (38.5K/s). Full `@pyreon/server` handler throughput (zero's SSR/ISR request path): simple +24% (206K req/s), medium-10-routes +32% (186K req/s), nested-5-deep +45% (114K req/s). Every zero SSR/ISR request and every SSG page build renders through this path.

Public API unchanged — `renderToString` still returns `Promise<string>`; only the internal tree walk is promise-free for sync trees. The streaming path (`renderToStream`) is untouched (progressive flushing is inherently async).
