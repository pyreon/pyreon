---
"@pyreon/compiler": minor
---

perf(compiler): `ssrTemplate` compile-to-string SSR fast path is now DEFAULT-ON

The compile-to-string SSR fast path — which lowers an eligible static-skeleton
element tree to a single `_ssr(["<li>…","</li>"], hole0, …)` string template
(the SSR analog of the DOM `_tpl()` cloneNode path; card ~9× Solid, list-50
clear lead vs a compiled-Solid baseline) — now defaults **ON** whenever
`ssr: true`. Every SSR app gets the fast path automatically; no config needed.

`pyreon({ ssrTemplate: false })` (or `transformJSX({ ssr: true, ssrTemplate:
false })`) is the explicit opt-out to the h() SSR path.

This is safe because the baked bytes are BYTE-IDENTICAL to walking the
equivalent `h()` tree (each dynamic hole resolves through the SAME `renderNode`;
eligibility is conservative — spread / component child / void tag / `select` /
entity-carrying JSXText / `innerHTML` / dup attr / fragment / `<For>` all bail
to h()), so hydration sees identical bytes → no mismatch. Both compiler backends
(JS + Rust native) emit the identical `_ssr(...)`.

Validated end-to-end: `native-equivalence` + `fuzz-equivalence` (300 seeds × 3
modes) + `ssr-template-differential` (renderToString ≡ h()) + `ssr-node` (12
tests, real production node server) + `ssr-showcase` (22 tests, dev server) —
all real-Chromium render + hydrate green, with `_ssr(...)` genuinely emitted in
the built SSR bundle.
