---
"@pyreon/runtime-server": minor
"@pyreon/compiler": minor
---

perf(ssr): lean concat + dynamic-attribute eligibility for the `_ssr` fast path

Builds on the opt-in compile-to-string SSR fast path (`ssrTemplate`): makes it ~2–3× faster and much more broadly eligible, while keeping FULL byte-identity to the h() path.

- **Lean concat.** The compiler now PRE-STRINGIFIES every hole — `_esc(text)`, an `_ssrAttr*` for a dynamic attribute, or a nested `_ssr`/`_ssrChildren` — and bakes the `<!--$-->` accessor markers into the surrounding statics, so `_ssr` is a `+=` accumulator with one type check per hole (no per-hole `renderNode` dispatch, no re-escape). New `_ssrItem` is the `.map` item form: a plain string that `_ssrChildren` concatenates with no per-item `RawHtml` wrap. `_esc` is now a smart escaper (primitive → escaped/`String`; a VNode in a text position still MOUNTS, possibly async).
- **Dynamic attributes are now eligible** (previously bailed to `h()`). New `_ssrAttr` reuses `renderProp` VERBATIM — byte-identical incl. the url-guard, class `cx` / object-style normalize, boolean/aria rules, `toAttrName` name-map, and null-omit — with byte-identical LEAN fast paths for the common shapes: `_ssrAttrGen` (generic lowercase name) and `_ssrAttrUrl` (lowercase url name). So `<li data-id={r.id} href={h}>` rows now hit the fast path; the compiler still bails on spreads / `<select>` / component children / `innerHTML` / `&`-entity JSX strings.
- **Proven-non-null attr baking.** When a dynamic attr's value EXPRESSION is syntactically provably non-null-non-boolean (`String(x)`, template literals, `` `${...}` ``, `.toFixed()`/`.toString()`/`.join()`, numeric literals, `+`-concat with a string operand, `a ? b : c` of provable branches — and, for a URL attr, a provably-safe start), the `renderProp` null-omit / boolean / url-guard branches are provably DEAD, so the attr name + quotes BAKE into the statics and only the value is escaped (like Solid's template baking) — byte-identical to the h() path. A genuinely-nullable attr (`data-id={r.id}`) keeps the runtime helper (null-omit safety — a real correctness advantage over Solid's `null → name=""`). Bisect-verified: forcing the baking on for a null-able value diverges (the runtime null-omit is load-bearing).

The objective cross-framework bench (`bun run bench:ssr-cross`) now COMPILES the Pyreon side through the fast path (the fair analog of Solid's babel compile), guarded by its byte-identical correctness gate. Measured (M3 Max, Bun, real babel-Solid, prod): **card 12.3M/s (~9× over Solid, ~6× over Pyreon h())**, **list-50 111K/s (ties Solid — CI-overlap)**, **list-1000 6.4K/s (1.12× behind Solid, 2.8× over h())** — faster than `react-dom/server` on all three. The residual list-1000 gap is the byte-identity url-guard on `href` (Solid inlines a plain escape).

Still opt-in and JS-backend-only: `ssrTemplate` CANNOT be defaulted-on until the native (Rust) backend implements it, or `native-equivalence` for `ssr: true` would diverge (JS `_ssr` vs native `h()`). Native parity → default-on is the tracked follow-up.
