---
"@pyreon/styler": minor
---

CSS-in-JS excellence pass — CSP nonce support + reproducible competitor benchmark:

- **CSP nonce** — `StyleSheetOptions.nonce` and `sheet.getStyleTag(nonce?)` now
  stamp the SSR-inlined critical `<style>` (and the client `<style>` element
  created on mount) with a `nonce` attribute, so a strict `style-src 'nonce-…'`
  policy (no `'unsafe-inline'`) admits the critical CSS on first paint instead
  of blocking it and FOUCing until client hydration re-inserts via CSSOM. Pass
  the per-request nonce to `getStyleTag(nonce)` (recommended — nonces rotate per
  response) or bake a default via `createSheet({ nonce })`. The nonce value is
  quote/`<`/`>`-stripped so it can't break out of the attribute. No nonce → the
  output is byte-identical to before (zero hydration-parity impact — className
  hashing is untouched).

- **Docs accuracy** — corrected the `createGlobalStyle` manifest note (its
  injected rule PERSISTS deduped, like emotion `injectGlobal`; it is NOT removed
  on unmount as the old text claimed) and fixed a batch of copy-paste-breaking
  stale API references on the styler docs page (`resolveCSS` → `resolve`,
  `styledElements` → the `styled` Proxy, `getSSRStyles` → `getStyleTag`,
  `data-nova-styler`/`ns-` → `data-pyreon-styler`/`pyr-`, `new CSSResult` →
  `css\`…\``).

This is a `minor` because it adds public API (`nonce` option +
`getStyleTag(nonce)` param). Also ships (non-published) a new reproducible
CSS-in-JS engine benchmark (`scripts/bench/core/styler.ts`) vs `@emotion/css`,
goober, and styled-components — median + 95% bootstrap CI + tie markers,
correctness-gated — replacing the README's prior unverified perf table with
measured numbers.
