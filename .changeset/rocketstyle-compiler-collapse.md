---
'@pyreon/styler': minor
'@pyreon/runtime-dom': minor
'@pyreon/compiler': minor
'@pyreon/vite-plugin': minor
---

feat: P0 compile-time rocketstyle wrapper-collapse (opt-in `pyreon({ collapse: true })`)

The vertical slice of the P0 RFC. A literal-prop rocketstyle call site
(`<Button state="primary" size="medium">Save</Button>` — every dimension
prop a string literal, no spread, static-text children) collapses from a
5-layer wrapper mount (rocketstyle → attrs HOC → Element → Wrapper →
styled) into ONE `_rsCollapse` cloneNode. E2 measured **44× wall-clock**,
`mountChild` 9→1, `styler.resolve` 22→0. **OFF by default** — zero
behaviour change unless `pyreon({ collapse: true })` is set.

Parity is guaranteed BY CONSTRUCTION, not by reimplementing the
rocketstyle chain in the compiler (RFC decision 2): the Vite plugin
spins ONE programmatic Vite-SSR server bound to the consumer's own
`vite.config`, renders the REAL component twice (light + dark), and
captures the resolved class + styler rule text — the same
`renderToString` + `@pyreon/styler` code path the app uses. Styler's
FNV-1a class hash is identical SSR vs DOM (its hydration contract), so
the build-resolved class is byte-for-byte the client-mounted class.

New public surface (all additive):

- `@pyreon/styler` — `StyleSheet.getStyleRules()` (raw SSR rule
  snapshot) + `StyleSheet.injectRules(rules, key)` (idempotent
  pre-resolved rule injection, no re-hash).
- `@pyreon/runtime-dom` — `_rsCollapse(html, lightClass, darkClass,
  isDark, bind?)` (one html-keyed `_tpl` cloneNode; class reactively
  bound to the live mode accessor — RFC decision 1 dual-emit, mode swap
  re-runs ONLY the className on the SAME node, no remount; decision 4
  hoisted-factory). `runtime-dom` stays layer-pure (never imports
  styler/ui-core — the styler injection is the emitted code's job).
- `@pyreon/compiler` — `scanCollapsibleSites()` +
  `rocketstyleCollapseKey()` exports + `TransformOptions.collapseRocketstyle`.
  Detection + emission live ONLY in the JS path; `transformJSX`
  short-circuits to `transformJSX_JS` when the option is set (the Rust
  binary doesn't implement it). A SINGLE shared `detectCollapsibleShape`
  bail catalogue is used by both the plugin scan and the compiler emit
  so resolution keys can't drift.
- `@pyreon/vite-plugin` — `pyreon({ collapse: true | PyreonCollapseOptions })`
  + `createCollapseResolver` (Vite-SSR resolver, memoised, disposed in
  `closeBundle`). Only the CLIENT graph collapses — the SSR graph keeps
  the real mount.

Tested across 5 layers: styler `injectRules` (3 real-Chromium specs);
`_rsCollapse` (4 real-Chromium specs — light class, mode-flip-no-remount,
children dispose, shared parsed template); resolver vs the REAL
`@pyreon/ui-components` Button via Vite SSR (8 specs incl. determinism +
graceful bail on a non-existent export); compiler detection / emission /
full bail catalogue / once-per-module dedupe (13 specs); end-to-end
pipeline — real Button → resolver → scanner → compiler emits
`__rsCollapse` carrying the real SSR-resolved classes + class-stripped
template + rule bundle byte-for-byte. **Phase-4 RFC acceptance, real
Chromium, shipped `_rsCollapse` × the REAL `@pyreon/ui-components` Button**
(`examples/experiments/e2-static-rocketstyle/e2.browser.test.ts`, 2 specs):
(1) the collapsed `<button>` is `isEqualNode`-structurally-identical to
the real rocketstyle-mounted one with a char-for-char-equal `className`
and identical computed style; (2) the perf signature is exactly
`runtime.tpl ≥ 1` + `runtime.mountChild == 1` per Button (the real mount
is 8–9 mountChild) with **~27× wall-clock** (collapsed 0.20 ms vs
baseline 5.40 ms, in-suite benchmark). Additive guarantee: all 1079
`@pyreon/compiler` tests pass unchanged with collapse off.

Bisect-verified: disabling the compiler's `tryRocketstyleCollapse(node)`
detection call fails the 4 collapse-emission specs (`expected … to
contain '__rsCollapse('`) while the 9 bail-catalogue / key-stability
specs still pass; restored → 13/13.

**Deliberately deferred (follow-up PRs, tracked in
`.claude/plans/open-work-2026-q3.md` §P0):** an `examples/ui-showcase`
build-with-collapse **verify-modes cell** (a build-artifact gate —
ui-showcase's Buttons all carry `onClick` → correctly bail, so it needs
a dedicated literal-prop demo route first; note the real-Chromium
DOM-parity + perf-counter acceptance is NOT deferred — it ships here as
the Phase-4 e2 specs above), and dev-mode collapse (build-shaped today —
dev keeps the normal mount, graceful). The
slice is fundamentally complete end-to-end (detect → resolve → emit →
parity-proven); these extend coverage, they are not gaps in the
mechanism. The RFC doc was removed once shipped — its decisions are now
the code, documented in `CLAUDE.md` → "Compile-time rocketstyle collapse".
