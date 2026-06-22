---
'@pyreon/unistyle': minor
'@pyreon/runtime-server': patch
---

Custom-Property Style Extraction (CPSE) — engine + opt-in `cpseStyled` integration

The fundamental fix for the rocketstyle styling-runtime cost: **decouple a style
prop's CSS-rule identity from its value identity** so styling cost is flat in
style-value cardinality (and dynamic values are free), instead of O(distinct
value tuples). See `.claude/audits/custom-property-style-extraction-2026-06-22.md`.

**`@pyreon/unistyle` (new, additive):**
- `styles()` gains an `extractVars` mode — every flat `prop: value` declaration
  becomes a value-agnostic `prop: var(--u-<hash>)` and the value is collected
  into a sink (reuses all of `processDescriptor`'s resolution; structural
  fragments pass through). Absent ⇒ byte-identical to today.
- `extractStyleVar`, `cpseVarName`, `cpseRewrite` — the extraction primitives.
- `cpseStyled(tag)` — a styled primitive that applies CPSE: a value-agnostic
  class cached by property-set (N distinct values → ONE class, ONE
  `styler.resolve`) + per-instance inline custom properties; dynamic
  (signal-driven) values patch the inline property with no re-resolve. Opt-in,
  zero blast radius on the existing `styled`/`Element`/`rocketstyle` paths.

**`@pyreon/runtime-server` (fix):** `normalizeStyle` now preserves CSS
custom-property names (`--x`) verbatim instead of kebab-casing them — parity
with the client `applyStyleProp` guard. Closes a latent SSR/client divergence
for any `--Custom`-cased property (the inline custom properties CPSE emits).

**Proven:** counter harness asserts O(N)→O(1) (100 distinct values: 100
resolves + 100 rules classic vs 1 + 1 under CPSE); real-Chromium proves a real
`cpseStyled` component renders N distinct values from ONE class + ONE resolve,
with computed-style parity, nesting-safety, and dynamic updates at zero extra
resolve; SSR parity proven by composition (cpseStyled VNode shape +
normalizeStyle `--` serialization), each bisect-verified.

**Staged (not in this release):** the `init({ styleExtraction })` flag +
auto-migrating the default `styled`/`Element`/`rocketstyle` pipeline (broad
blast radius — the regression-gated rollout), and responsive-array assembly in
`cpseStyled` (the engine supports per-breakpoint var naming today).
