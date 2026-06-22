---
'@pyreon/styler': minor
'@pyreon/ui-core': minor
---

CPSE: opt-in default-pipeline integration (`init({ styleExtraction: true })`)

The `styled` / `Element` default pipeline can now route through Custom-Property
Style Extraction, behind an opt-in flag. With `init({ styleExtraction: true })`,
`PyreonUI` wires `@pyreon/styler`'s new `setStyleExtraction` (injecting
unistyle's `cpseRewrite`) so a **non-reactive** styled component's resolved
declarations become a value-agnostic rule (`prop: var(--u-…)`) + per-instance
inline custom properties. Distinct values then share **ONE** CSS rule (O(1)
rules — the rule-bloat win for high-cardinality apps); the value rides inline.

- **Off (default) = byte-identical** classic path. Every CPSE branch is gated on
  the flag; the full styler + ui-core + elements + rocketstyle + coolgrid +
  ui-components suites (node + real-Chromium) pass unchanged.
- **Scope:** the non-reactive (static + SSR) resolve — plain `styled` + `Element`
  (the `$element` path; a `cpseVarsCache` keyed by `$element` makes the value
  survive `elClassCache` hits). The **reactive** (rocketstyle accessor) path
  stays classic.
- **Honest limits:** it is **O(1) rules, NOT O(1) resolve** — the styler still
  resolves per distinct `$element` (it caches by value-bearing identity); the
  win is rule/bundle, not resolve-CPU. It also currently extracts **every** flat
  declaration including constants (`position: relative`, `display: …`), which
  inflates inline-style bytes — a future refinement can skip non-value-varying
  declarations. Measure per app (the win-matrix test) before enabling.

`setStyleExtraction(enabled, rewrite?)` is exported from `@pyreon/styler`
(`@internal` — wired by ui-core). New `init` option `styleExtraction: boolean`.

Proven: a dedicated real-Chromium suite — flag-on a function-interpolated
`styled` → value-agnostic class + inline var + N distinct values share ONE
class; flag-off → classic (N classes, no var, the self-discriminating contrast);
a **real `<Element>`** fires CPSE (renders correctly via var-indirection,
distinct gaps share one class, cache-hit keeps vars); a pre-existing inline
style is preserved. The `doResolve` CPSE branch is bisect-verified (neutering it
fails the flag-on specs).
