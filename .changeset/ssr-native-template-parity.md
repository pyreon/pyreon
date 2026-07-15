---
"@pyreon/compiler": minor
---

perf(compiler): native `_ssr` compile-to-string SSR fast path (byte-identical to JS)

The compile-to-string SSR fast path (`ssrTemplate`) — which lowers an eligible
static-skeleton element tree to a single `_ssr(["<li>…","</li>"], hole0, …)`
string template (the SSR analog of the DOM `_tpl()` cloneNode path) — is now
implemented in the **Rust native backend**, byte-identical to the JS backend.

Previously `ssrTemplate` was JS-only: the native backend emitted `h()`, so a
`transformJSX({ ssr: true, ssrTemplate: true })` call was force-routed through
the JS implementation. Now the flag is threaded to the native binary (7th arg)
and both backends emit the identical `_ssr(...)` / `_ssrAttr` / `_ssrItem` /
`_esc` / `<!--$-->`-marker output.

Parity is locked by the byte-identical `native-equivalence` oracle (new
`ssrTemplate` parity cases: static, dynamic-attr, `.map` list, safe/unsafe URL,
nested, conditional child, bail catalogue) and the seeded `fuzz-equivalence`
gate, which now compares THREE modes per seed (client, SSR h(), SSR
compile-to-string) — 300 seeds × 3 modes byte-identical, plus a 10k-seed
stress pass (0 divergence, ~9.7k real `_ssr` emissions).

This removes the blocker for making `ssrTemplate` default-on. The flag remains
opt-in; the default is unchanged.
