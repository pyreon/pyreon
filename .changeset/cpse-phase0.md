---
'@pyreon/unistyle': patch
---

Custom-Property Style Extraction (CPSE) — Phase 0 (experimental primitive + measurement)

Adds `extractStyleVar(property, value, rootSize?)` (experimental) — the Phase-0
proof-of-concept for decoupling a style prop's **CSS-rule identity** from its
**value identity**. Instead of baking a resolved value into a rule
(`gap: 2.25rem` → one new rule + one `styler.resolve` per distinct value —
cost O(distinct value tuples)), it emits a value-agnostic rule
(`gap: var(--u-<hash>)`, resolved ONCE) and returns the per-instance custom
property to apply inline — cost O(component definitions), flat in value
cardinality, and dynamic (signal-driven) values for free.

This is an additive, experimental export; no existing behaviour changes. It is
the de-risking slice for the framework-level styling-runtime fix described in
`.claude/audits/custom-property-style-extraction-2026-06-22.md`. Proven:
the cost-model harness asserts O(N)→O(1) at the real `styler.resolve` / rule-count
counters (100 distinct values: 100 resolves + 100 rules today vs 1 + 1 under
CPSE), and the real-Chromium suite proves computed-style parity, nesting-safety,
and 50 dynamic updates with zero `styler.resolve`. Generalization across the
unistyle property set, responsive arrays, and rocketstyle integration is the
roadmap (RFC §5).
