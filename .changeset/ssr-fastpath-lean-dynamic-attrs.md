---
"@pyreon/runtime-server": minor
"@pyreon/compiler": minor
---

perf(ssr): lean concat + dynamic-attribute eligibility for the `_ssr` fast path

Builds on the opt-in compile-to-string SSR fast path (`ssrTemplate`): makes it ~2–3× faster and much more broadly eligible, while keeping FULL byte-identity to the h() path.

- **Lean concat.** The compiler now PRE-STRINGIFIES every hole — `_esc(text)`, an `_ssrAttr*` for a dynamic attribute, or a nested `_ssr`/`_ssrChildren` — and bakes the `<!--$-->` accessor markers into the surrounding statics, so `_ssr` is a `+=` accumulator with one type check per hole (no per-hole `renderNode` dispatch, no re-escape). New `_ssrItem` is the `.map` item form: a plain string that `_ssrChildren` concatenates with no per-item `RawHtml` wrap. `_esc` is now a smart escaper (primitive → escaped/`String`; a VNode in a text position still MOUNTS, possibly async).
- **Dynamic attributes are now eligible** (previously bailed to `h()`). New `_ssrAttr` reuses `renderProp` VERBATIM — byte-identical incl. the url-guard, class `cx` / object-style normalize, boolean/aria rules, `toAttrName` name-map, and null-omit — with byte-identical LEAN fast paths for the common shapes: `_ssrAttrGen` (generic lowercase name) and `_ssrAttrUrl` (lowercase url name). So `<li data-id={r.id} href={h}>` rows now hit the fast path; the compiler still bails on spreads / `<select>` / component children / `innerHTML` / `&`-entity JSX strings.

The objective cross-framework bench (`bun run bench:ssr-cross`) now COMPILES the Pyreon side through the fast path (the fair analog of Solid's babel compile), guarded by its byte-identical correctness gate. Measured (M3 Max, Bun, real babel-Solid, prod): **card 12.3M/s (~9× over Solid, ~6× over Pyreon h())**, **list-50 111K/s (ties Solid — CI-overlap)**, **list-1000 6.4K/s (1.12× behind Solid, 2.8× over h())** — faster than `react-dom/server` on all three. The residual list-1000 gap is the byte-identity url-guard on `href` (Solid inlines a plain escape).

Still opt-in and JS-backend-only: `ssrTemplate` CANNOT be defaulted-on until the native (Rust) backend implements it, or `native-equivalence` for `ssr: true` would diverge (JS `_ssr` vs native `h()`). Native parity → default-on is the tracked follow-up.
