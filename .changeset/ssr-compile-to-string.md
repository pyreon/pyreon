---
"@pyreon/runtime-server": minor
"@pyreon/compiler": minor
---

feat(runtime-server,compiler): opt-in compile-to-string SSR fast path (`_ssr`)

The SSR analog of the DOM `_tpl()` cloneNode fast path: an eligible static-skeleton JSX subtree lowers to an `_ssr(["<li>…","</li>"], hole0, …)` string template instead of a `h()` VNode tree, so `renderToString` concatenates precompiled HTML with a lean `+=` accumulator instead of walking a per-request VNode tree. **Byte-identical output** to the h() path — hydration is unaffected.

- **runtime-server** — new primitives `_ssr` / `_ssrItem` / `_ssrChildren` / `_esc` / `_ssrAttr` / `_ssrAttrGen` / `_ssrAttrUrl`. The compiler PRE-STRINGIFIES every hole (`_esc(text)`, an `_ssrAttr*` for a dynamic attribute, or a nested `_ssr`/`_ssrChildren`) and bakes the `<!--$-->` accessor markers into the surrounding statics, so `_ssr` is a lean concat with one type check per hole — no per-hole `renderNode` dispatch, no re-escape. `_ssr` returns a `RawHtml`-branded fragment (the SafeString trust boundary) so a nested result / component return composes without re-escaping; `_ssrItem` (the `.map` item form) returns a plain string that `_ssrChildren` concatenates with no per-item wrap. `_esc` matches `renderNode`'s per-value output (primitive → escaped/String; a VNode in text position still mounts, possibly async). Dynamic attributes go through `renderProp` VERBATIM (`_ssrAttr`) or a byte-identical lean fast path for the common shapes (`_ssrAttrGen` generic, `_ssrAttrUrl` url) — so the url-guard, class `cx`/style normalize, boolean/aria rules, `toAttrName` name-map, null-omit, and escaping are all preserved.
- **compiler** — opt-in `TransformOptions.ssrTemplate` (requires `ssr: true`, default `false`). Eligibility is conservative and bails to `h()` on any shape it can't prove byte-identical: spreads, `<select>`/void-with-content, component children, `innerHTML`/`dangerouslySetInnerHTML`, duplicate attrs, and `&` in baked JSXText / raw JSX-string attrs (oxc keeps HTML entities literal while the h() JSX runtime may decode them). DYNAMIC attributes are now supported (via `_ssrAttr*`) — including `data-*`/`aria-*`/`class`/`style`/`id`/`href`/`src`/`title` and camelCase names. A `.map(item => <el>)` compiles to `_ssrChildren(arr.map(item => _ssrItem(…)))` with markers baked in, so list items skip VNode allocation too.

Opt-in and JS-backend-only in this release: with the flag OFF (the default, and what the cross-backend equivalence gates use) both backends stay byte-identical. The native (Rust) backend does not yet implement `ssrTemplate` — the dispatcher routes to the JS backend when the flag is set. `ssrTemplate` CANNOT be defaulted-on until the native backend implements it (else `native-equivalence` for `ssr: true` diverges: JS `_ssr` vs native `h()`). Native parity + a `pyreon({ ssrTemplate: true })` vite-plugin option (and then default-on) are the tracked follow-up.

Measured — objective cross-framework bench (`bun run bench:ssr-cross`, real babel-compiled Solid, prod builds, byte-identical correctness gate; the Pyreon side is now COMPILED through the fast path, the fair analog of Solid's babel compile). Apple M3 Max / Bun:

| Scenario | Pyreon `_ssr` | Pyreon `h()` | Solid | React 19 |
|---|---|---|---|---|
| card | **12.3M/s** 🥇 | 2.07M/s | 1.34M/s | 0.72M/s |
| list-50 | **111K/s** 🤝 | 39K/s | 130K/s | 25K/s |
| list-1000 | 6.4K/s | 2.6K/s | **7.2K/s** | 1.7K/s |

The fast path is **~9× faster than Solid on `card`**, **ties Solid on list-50** (CI-overlap), and is **1.12× behind Solid on list-1000** (2.8× over Pyreon's own h()). The residual list-1000 gap is the byte-identity tax on dynamic URL attrs (`renderProp`'s url-guard vs Solid's plain inline escape). Faster than `react-dom/server` on all three.
