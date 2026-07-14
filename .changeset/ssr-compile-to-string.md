---
"@pyreon/runtime-server": minor
"@pyreon/compiler": minor
---

feat(runtime-server,compiler): opt-in compile-to-string SSR fast path (`_ssr`)

Adds the SSR analog of the DOM `_tpl()` cloneNode fast path: an eligible static-skeleton JSX subtree can lower to an `_ssr(["<li>…","</li>"], hole0, …)` string template instead of a `h()` VNode tree, so `renderToString` concatenates precompiled HTML instead of walking a per-request VNode tree.

- **runtime-server** — new public primitives `_ssr`, `_ssrChildren`, `_esc`. `_ssr`/`_ssrChildren` return a `RawHtml`-branded fragment (the SafeString trust boundary) so a nested fast-path result is concatenated verbatim while a plain string hole is still escaped. Every dynamic hole is resolved through the SAME `renderNode` the h() path uses, so the produced HTML is **byte-identical** to the h() walk it replaces — hydration is unaffected. `renderNode`/`streamNode` recognize `RawHtml` (and a Promise root) so `_ssr` composes through component boundaries and async holes. Maybe-async: sync subtrees pay zero promise hops.
- **compiler** — new opt-in `TransformOptions.ssrTemplate` (requires `ssr: true`, default `false`). The JS backend lowers eligible elements (`buildSsrCall`); eligibility is deliberately conservative and bails to `h()` on any shape it can't prove renders byte-identically (dynamic attrs, `<select>`/void-with-content, spreads, component children, camelCase/URL-unsafe attrs, object styles, `innerHTML`, `&` in baked JSXText / raw JSX string attrs — oxc keeps HTML entities literal but the h() path's JSX runtime may decode them, so any `&` there bails, …). A `.map(item => <el>)` child compiles to `_ssrChildren(arr.map(item => _ssr(…)))` with the accessor markers baked in, so list items skip VNode allocation too.

Opt-in and JS-backend-only in this release: with the flag OFF (the default, and what the cross-backend equivalence gates use) both backends stay byte-identical. The native (Rust) backend does not yet implement `ssrTemplate` — the dispatcher routes to the JS backend when the flag is set. Native parity + a `pyreon({ ssrTemplate: true })` vite-plugin option are the tracked follow-up.

Measured (Apple M3 Max, Bun, `NODE_ENV=production`): the fast path renders **1.6–1.9× faster than Pyreon's current SSR** across card/list-50/list-1000, and is faster than `react-dom/server` on all three.
